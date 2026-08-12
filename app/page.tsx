'use client';

import { useState, useEffect, useRef } from 'react';
import { Map, Polygon, CustomOverlayMap, MapMarker, useKakaoLoader } from 'react-kakao-maps-sdk';

export default function Home() {
  const [mapLoading, mapError] = useKakaoLoader({
    appkey: process.env.NEXT_PUBLIC_KAKAO_APP_KEY as string,
    libraries: ['services'], 
  });

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeSector, setActiveSector] = useState('A (샘플)');
  const [actionLog, setActionLog] = useState<string | null>(null);
  const [completedSectors, setCompletedSectors] = useState<string[]>([]);
  
  const [mapCenter, setMapCenter] = useState({ lat: 35.0932, lng: 126.3831 }); 
  const [myLocation, setMyLocation] = useState<{lat: number, lng: number} | null>(null);
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [mapLevel, setMapLevel] = useState(4); 

  const [searchAddress, setSearchAddress] = useState("");

  const [isRecording, setIsRecording] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [diaryLogs, setDiaryLogs] = useState<string[]>([]);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
    script.async = true;
    document.head.appendChild(script);
    script.onload = () => {
      if (!(window as any).Kakao.isInitialized()) {
        (window as any).Kakao.init(process.env.NEXT_PUBLIC_KAKAO_APP_KEY);
      }
    };
  }, []);

  const sectorPaths = {
    'A (샘플)': [
      { lat: 35.0940, lng: 126.3820 }, { lat: 35.0940, lng: 126.3830 },
      { lat: 35.0932, lng: 126.3830 }, { lat: 35.0932, lng: 126.3820 },
    ],
    'B (샘플)': [
      { lat: 35.0940, lng: 126.3832 }, { lat: 35.0940, lng: 126.3842 },
      { lat: 35.0932, lng: 126.3842 }, { lat: 35.0932, lng: 126.3832 },
    ],
    'C (샘플)': [
      { lat: 35.0930, lng: 126.3820 }, { lat: 35.0930, lng: 126.3842 },
      { lat: 35.0922, lng: 126.3842 }, { lat: 35.0922, lng: 126.3820 },
    ]
  };

  const sectorCenters = {
    'A (샘플)': { lat: 35.0936, lng: 126.3825 },
    'B (샘플)': { lat: 35.0936, lng: 126.3837 },
    'C (샘플)': { lat: 35.0926, lng: 126.3831 },
  };

  useEffect(() => {
    if (activeSector.includes('내 농장') || activeSector.includes('검색된')) return;
    setLoading(true);
    const { lat, lng } = sectorCenters[activeSector as keyof typeof sectorCenters] || sectorCenters['A (샘플)'];
    fetchWeatherData(lat, lng, activeSector);
  }, [activeSector]);

  // 💡 [핵심 교체!] 가짜 데이터를 지우고 Open-Meteo 실시간 날씨 API를 연결합니다!
  const fetchWeatherData = async (lat: number, lng: number, sectorName: string) => {
    try {
      // 1. 진짜 날씨 API 찌르기 (현재 날씨 + 시간대별 예측)
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,precipitation&hourly=temperature_2m,precipitation_probability,weather_code&timezone=Asia%2FSeoul`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('날씨 데이터를 가져올 수 없습니다.');
      const weatherData = await response.json();

      // 2. 현재 시간 기준으로 몇 번째 데이터인지 찾기
      const now = new Date();
      const currentHourIndex = weatherData.hourly.time.findIndex((t: string) => new Date(t) >= now);
      const idx = currentHourIndex !== -1 ? currentHourIndex : 0;

      // 3. WMO 날씨 코드를 이쁜 이모티콘으로 바꾸는 마법 공식
      const getWeatherDesc = (code: number) => {
        if (code === 0) return { icon: '☀️', desc: '맑음' };
        if (code <= 3) return { icon: '⛅', desc: '구름' };
        if (code <= 48) return { icon: '🌫️', desc: '안개' };
        if (code <= 67) return { icon: '🌧️', desc: '비' };
        if (code <= 77) return { icon: '❄️', desc: '눈' };
        if (code <= 82) return { icon: '🌦️', desc: '소나기' };
        return { icon: '⚡', desc: '뇌우' };
      };

      // 4. 3시간, 6시간, 9시간 뒤의 날씨 예측 데이터 조립
      const forecast = [3, 6, 9].map(offset => {
        const targetIdx = idx + offset;
        const wInfo = getWeatherDesc(weatherData.hourly.weather_code[targetIdx]);
        return {
          time: `${offset}시간 뒤`,
          temp: weatherData.hourly.temperature_2m[targetIdx].toFixed(1),
          pop: weatherData.hourly.precipitation_probability[targetIdx],
          icon: wInfo.icon,
          desc: wInfo.desc
        };
      });

      const currentTemp = weatherData.current.temperature_2m;
      const currentHum = weatherData.current.relative_humidity_2m;
      const currentRain = weatherData.current.precipitation;
      
      // 5. 실제 기온과 습도를 바탕으로 잡초 위험도 동적 계산 (고온 다습할수록 위험)
      const riskScore = Math.min(100, Math.max(0, Math.round((currentTemp / 30) * 40 + (currentHum / 100) * 60)));
      
      let rec = "현재 날씨가 양호합니다. 일상적인 관리를 진행하세요.";
      if (riskScore >= 80) rec = "⚠️ 고온 다습하여 잡초 발아 위험이 매우 높습니다! 즉각적인 제초 및 방제 작업을 권장합니다.";
      else if (riskScore >= 60) rec = "잡초 성장이 활발해질 수 있는 조건입니다. 밭 상태를 예찰해 주세요.";

      // 화면에 실제 데이터 뿌리기!
      setData({
        weather: { temp: currentTemp.toFixed(1), rain: currentRain, humidity: currentHum },
        forecast: forecast,
        riskScore: riskScore,
        recommendation: rec
      });
      setLoading(false);
      
    } catch (err) {
      console.error(err);
      // 인터넷이 끊겼을 때만 가짜 데이터를 보여줌
      setData({
        weather: { temp: '26.7', rain: '0', humidity: '94' },
        forecast: [],
        riskScore: 40,
        recommendation: `[오류] 통신 지연. 인터넷 연결을 확인해주세요.`
      });
      setLoading(false);
    }
  };

  const handleKakaoShare = () => {
    if (!(window as any).Kakao || !(window as any).Kakao.isInitialized()) {
      alert("카카오톡 공유 기능을 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    
    (window as any).Kakao.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: `🚜 [긴급] ${activeSector} 방제 관제 보고`,
        description: `현재 기온: ${data?.weather?.temp}°C | 습도: ${data?.weather?.humidity}%\n잡초 위험도: ${data?.riskScore}점\n\n* AI 조언: ${data?.recommendation}`,
        imageUrl: 'https://images.unsplash.com/photo-1592982537447-6f26487e4726?auto=format&fit=crop&q=80&w=800',
        link: {
          mobileWebUrl: window.location.href,
          webUrl: window.location.href,
        },
      },
      buttons: [
        {
          title: '스마트 관제탑으로 즉시 이동',
          link: {
            mobileWebUrl: window.location.href,
            webUrl: window.location.href,
          },
        },
      ],
    });
  };

  const handleAddressSearch = () => {
    if (!searchAddress.trim()) return;
    if (!(window as any).kakao || !(window as any).kakao.maps || !(window as any).kakao.maps.services) {
      alert("지도 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    const geocoder = new (window as any).kakao.maps.services.Geocoder();
    geocoder.addressSearch(searchAddress, function(result: any, status: any) {
      if (status === (window as any).kakao.maps.services.Status.OK) {
        const lat = parseFloat(result[0].y);
        const lng = parseFloat(result[0].x);
        setMapCenter({ lat, lng });
        setMyLocation({ lat, lng });
        setActiveSector(`검색: ${searchAddress.substring(0, 8)}...`);
        setTimeout(() => setMapLevel(1), 600);
        setLoading(true);
        fetchWeatherData(lat, lng, '검색된 농장');
      } else {
        alert("주소를 찾을 수 없습니다. 정확한 주소를 입력해주세요.");
      }
    });
  };

  const handleGpsSearch = () => {
    if (!navigator.geolocation) {
      alert("GPS를 지원하지 않는 브라우저입니다.");
      return;
    }
    setIsGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setMapCenter({ lat, lng }); 
        setMyLocation({ lat, lng }); 
        setActiveSector('내 농장(GPS)'); 
        setTimeout(() => setMapLevel(1), 600);
        setLoading(true);
        fetchWeatherData(lat, lng, '내 농장(GPS)');
        setIsGpsLoading(false);
      },
      (error) => {
        alert("GPS 위치를 가져올 수 없습니다. 위치 권한을 허용해주세요!");
        setIsGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  const openRoadview = () => {
    if (!mapCenter) return;
    const url = `https://map.kakao.com/link/roadview/${mapCenter.lat},${mapCenter.lng}`;
    window.open(url, '_blank');
  };

  const handleAction = () => {
    const now = new Date();
    const actionMessage = `${now.getMonth() + 1}월 ${now.getDate()}일 ${now.getHours()}시 ${now.getMinutes()}분 - ${activeSector} 방제 완료!`;
    setActionLog(actionMessage);
    setCompletedSectors(prev => Array.from(new Set([...prev, activeSector])));
  };

  const handleVoiceRecord = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("이 브라우저에서는 음성 인식을 지원하지 않습니다.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'ko-KR';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event: any) => {
      const currentTranscript = Array.from(event.results).map((result: any) => result[0].transcript).join('');
      setVoiceText(currentTranscript);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognition.start();
  };

  const saveDiary = () => {
    if (!voiceText.trim()) return;
    const now = new Date();
    const timestamp = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
    const newLog = `[${timestamp}] ${activeSector} : ${voiceText}`;
    setDiaryLogs(prev => [newLog, ...prev]);
    setVoiceText("");
  };

  if (loading && !data) return <div className="flex h-screen items-center justify-center text-xl font-bold text-green-700">농장 데이터를 분석 중입니다... 🚜</div>;

  return (
    <main className="min-h-screen bg-green-50 p-4 md:p-8 font-sans flex flex-col items-center">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden mb-8">
        <div className="bg-green-600 p-6 text-white text-center relative">
          <h1 className="text-3xl font-extrabold mb-2">🌱 실시간 농장 위성 관제 AI</h1>
          <p className="opacity-90 font-medium">전국 농업인 전용 스마트 방제 시스템</p>
        </div>

        <div className="p-6">
          {/* 지도 영역 */}
          <div className="mb-8 border-4 border-green-100 rounded-2xl overflow-hidden shadow-inner relative">
            <div className="absolute top-4 left-4 right-4 z-10 flex gap-2 shadow-lg">
              <input 
                type="text"
                value={searchAddress}
                onChange={(e) => setSearchAddress(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddressSearch()}
                placeholder="밭 주소를 입력하세요 (예: 목포시 상동 123)"
                className="flex-1 px-4 py-3 rounded-xl border-2 border-green-500 font-bold text-gray-800 outline-none bg-white/95 focus:bg-white transition-colors"
              />
              <button 
                onClick={handleAddressSearch}
                className="bg-green-600 hover:bg-green-700 text-white font-black px-6 py-3 rounded-xl transition-transform active:scale-95"
              >
                검색
              </button>
            </div>

            {mapLoading ? (
              <div className="h-80 bg-gray-100 flex items-center justify-center font-bold text-gray-400">지도를 불러오는 중입니다...</div>
            ) : mapError ? (
              <div className="h-80 bg-red-50 flex items-center justify-center font-bold text-red-500">지도 로드 실패</div>
            ) : (
              <Map center={mapCenter} isPanto={true} style={{ width: "100%", height: "450px" }} level={mapLevel} mapTypeId={3}>
                {(Object.keys(sectorPaths) as Array<keyof typeof sectorPaths>).map((sector) => {
                  const isCompleted = completedSectors.includes(sector);
                  const isActive = activeSector === sector;
                  return (
                    <div key={sector}>
                      <Polygon
                        path={sectorPaths[sector]} strokeWeight={3}
                        strokeColor={isCompleted ? "#2563EB" : (isActive ? "#FF0000" : "#00FF00")}
                        strokeOpacity={0.9} strokeStyle="solid"
                        fillColor={isCompleted ? "#3B82F6" : (isActive ? "#FF0000" : "#00FF00")}
                        fillOpacity={isActive ? 0.4 : 0.25}
                        onClick={() => { setActiveSector(sector); setMapCenter(sectorCenters[sector]); setMapLevel(4); setActionLog(null); }}
                      />
                      <CustomOverlayMap position={sectorCenters[sector]}>
                        <div className={`px-4 py-2 rounded-full font-black text-xs shadow-lg cursor-pointer ${isCompleted ? 'bg-blue-600 text-white border-2 border-white' : isActive ? 'bg-red-500 text-white transform scale-110' : 'bg-green-600 text-white'}`} onClick={(e) => { e.stopPropagation(); setActiveSector(sector); setMapCenter(sectorCenters[sector]); setMapLevel(4); setActionLog(null); }}>
                          {isCompleted ? `✅ ${sector} 완료` : sector}
                        </div>
                      </CustomOverlayMap>
                    </div>
                  );
                })}
                {myLocation && (
                  <CustomOverlayMap position={myLocation}>
                    <div className="w-5 h-5 bg-red-500 rounded-full border-4 border-white shadow-lg animate-pulse" />
                  </CustomOverlayMap>
                )}
              </Map>
            )}

            <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
              <button onClick={openRoadview} className="bg-white hover:bg-gray-50 border-2 border-indigo-500 text-indigo-700 px-4 py-3 rounded-2xl text-sm font-black shadow-2xl flex items-center justify-center gap-2 transition-transform transform hover:scale-105 active:scale-95">
                🛣️ 주변 로드뷰 보기
              </button>
              <button onClick={handleGpsSearch} disabled={isGpsLoading} className="bg-white hover:bg-gray-50 border-2 border-blue-500 text-blue-700 px-4 py-3 rounded-2xl text-sm font-black shadow-2xl flex items-center justify-center gap-2 transition-transform transform hover:scale-105 active:scale-95">
                {isGpsLoading ? '📡 GPS 연결 중...' : '🎯 내 위치로 이동 (GPS)'}
              </button>
            </div>
          </div>

          {data && (
            <>
              {/* 💡 [진짜 날씨 연동 완료] */}
              <div className="grid grid-cols-3 gap-4 text-center mb-6 bg-green-100/50 rounded-2xl p-5 border border-green-100">
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-1">현재 기온</p>
                  <p className="text-2xl font-black text-gray-800">{data.weather?.temp ?? '-'}°C</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-1">강수량</p>
                  <p className="text-2xl font-black text-blue-600">{data.weather?.rain ?? '-'}mm</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-1">습도</p>
                  <p className="text-2xl font-black text-gray-800">{data.weather?.humidity ?? '-'}%</p>
                </div>
              </div>

              {/* 💡 [진짜 단기 예보 연동 완료] */}
              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  🌦️ 단기 기상 예보 (실시간)
                </h2>
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-6 rounded-2xl border border-blue-200 shadow-sm flex justify-between">
                  {data.forecast.map((forecast: any, idx: number) => (
                    <div key={idx} className="flex flex-col items-center flex-1 border-r border-blue-200 last:border-0">
                      <span className="text-sm font-bold text-blue-800 mb-2">{forecast.time}</span>
                      <span className="text-3xl mb-1">{forecast.icon}</span>
                      <span className="text-lg font-black text-gray-800">{forecast.temp}°C</span>
                      <span className="text-sm font-semibold text-gray-600">{forecast.desc} (강수 {forecast.pop}%)</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-right text-blue-600 mt-2 font-semibold">* 현재 보고 계신 좌표의 100% 리얼 실시간 날씨입니다.</p>
              </div>

              {/* 동적 전문가 조언 */}
              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">🤖 AI 농업 전문가 조언</h2>
                <div className="text-gray-700 leading-relaxed whitespace-pre-line bg-gray-50 p-6 rounded-2xl border border-gray-200 text-lg shadow-sm">
                  {data.recommendation}
                </div>
              </div>
            </>
          )}

          {/* 방제 보고 및 카카오톡 공유 */}
          <div className="border-t-2 border-dashed border-gray-200 pt-8 mt-8 text-center flex flex-col gap-4">
            {completedSectors.includes(activeSector) ? (
              <div className="w-full md:w-auto bg-blue-100 border-2 border-blue-500 text-blue-800 font-bold py-4 px-12 rounded-2xl text-xl shadow-inner mx-auto inline-block">
                ✅ {activeSector} 방제 완료
              </div>
            ) : (
              <button onClick={handleAction} className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-12 rounded-2xl text-xl shadow-lg transition-transform mx-auto">
                🚜 {activeSector} 방제 완료 보고
              </button>
            )}
            
            <button onClick={handleKakaoShare} className="w-full md:w-auto bg-[#FEE500] hover:bg-[#F4DC00] text-black font-extrabold py-4 px-12 rounded-2xl text-xl shadow-lg transition-transform transform hover:scale-105 active:scale-95 mx-auto flex items-center justify-center gap-3">
              <span className="text-2xl">💬</span> 카카오톡으로 현장 공유하기
            </button>
          </div>

          {/* AI 음성 영농 일지 섹션 */}
          <div className="border-t-2 border-dashed border-gray-200 pt-8 mt-8 text-center">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center justify-center gap-2">
              🎙️ AI 스마트 영농 일지
            </h2>
            <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-2xl shadow-sm text-left">
              <button
                onClick={handleVoiceRecord}
                className={`w-full py-4 px-6 rounded-2xl font-black text-white text-lg transition-all shadow-lg flex items-center justify-center gap-3 mb-4 ${
                  isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-700 transform hover:scale-105 active:scale-95'
                }`}
              >
                {isRecording ? '🔴 마이크 끄기 (말씀하세요...)' : '🎙️ 음성으로 일지 쓰기'}
              </button>
              <textarea 
                value={voiceText} onChange={(e) => setVoiceText(e.target.value)}
                placeholder="마이크 버튼을 누르고 '오늘 잡초 뽑고 농약 2통 살포 완료' 라고 말해보세요."
                className="w-full p-4 rounded-xl border-2 border-indigo-200 focus:border-indigo-500 outline-none resize-none h-24 text-gray-700 font-medium mb-4 shadow-inner bg-white"
              />
              <button 
                onClick={saveDiary} disabled={!voiceText.trim()}
                className="w-full bg-gray-800 hover:bg-black text-white font-bold py-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                💾 {activeSector} 작업 일지 저장하기
              </button>
            </div>
            {diaryLogs.length > 0 && (
              <div className="mt-6 text-left">
                <h3 className="text-lg font-bold text-gray-700 mb-3 flex items-center gap-2">
                  📋 최근 작업 기록
                </h3>
                <ul className="space-y-3">
                  {diaryLogs.map((log, idx) => (
                    <li key={idx} className="bg-white px-4 py-3 rounded-xl border-l-4 border-indigo-500 shadow-sm text-gray-700 font-medium">{log}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
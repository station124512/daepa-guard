'use client';

import { useState, useEffect, useRef } from 'react';
import { Map, Polygon, CustomOverlayMap, MapMarker, useKakaoLoader } from 'react-kakao-maps-sdk';

export default function Home() {
  const [mapLoading, mapError] = useKakaoLoader({
    appkey: process.env.NEXT_PUBLIC_KAKAO_APP_KEY as string,
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

  // 💡 [음성 인식용 상태 변수들 추가]
  const [isRecording, setIsRecording] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [diaryLogs, setDiaryLogs] = useState<string[]>([]);
  const recognitionRef = useRef<any>(null); // 마이크 끄기 제어용

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
    if (activeSector === '내 농장(GPS)' && myLocation) return;
    setLoading(true);
    const { lat, lng } = sectorCenters[activeSector as keyof typeof sectorCenters] || sectorCenters['A (샘플)'];
    fetchWeatherData(lat, lng, activeSector);
  }, [activeSector]);

  const fetchWeatherData = (lat: number, lng: number, sectorName: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    fetch(`/api/weed-check?lat=${lat}&lng=${lng}&sector=${sectorName}`, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('서버 응답 오류');
        return res.json();
      })
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        console.error(err);
        setData({
          weather: { temp: '26.7', rain: '0', humidity: '94' },
          riskScore: sectorName.includes('내 농장') ? 85 : 40,
          recommendation: `${sectorName} 통신 지연. 기본 안전 모드로 구동됩니다.`
        });
        setLoading(false);
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

  const handleAction = () => {
    const now = new Date();
    const actionMessage = `${now.getMonth() + 1}월 ${now.getDate()}일 ${now.getHours()}시 ${now.getMinutes()}분 - ${activeSector} 방제 완료!`;
    setActionLog(actionMessage);
    setCompletedSectors(prev => Array.from(new Set([...prev, activeSector])));
  };

  // 💡 [핵심 기능] AI 음성 인식 로직
  const handleVoiceRecord = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("이 브라우저에서는 음성 인식을 지원하지 않습니다. 크롬(Chrome)이나 안드로이드 스마트폰을 사용해주세요!");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'ko-KR'; // 한국어 인식 모드
    recognition.interimResults = true; // 말하는 도중에도 글씨 나오게
    recognition.continuous = false; // 한 번 말하고 쉬면 자동 종료

    recognition.onstart = () => setIsRecording(true);
    
    recognition.onresult = (event: any) => {
      const currentTranscript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      setVoiceText(currentTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error(event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  };

  // 💡 음성 텍스트를 일지에 저장하는 로직
  const saveDiary = () => {
    if (!voiceText.trim()) return;
    const now = new Date();
    const timestamp = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    // [8/13 16:30] A구역 : 잎마름병 약 2통 살포함
    const newLog = `[${timestamp}] ${activeSector} : ${voiceText}`;
    setDiaryLogs(prev => [newLog, ...prev]);
    setVoiceText(""); // 저장 후 입력창 초기화
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
          <div className="mb-8 border-4 border-green-100 rounded-2xl overflow-hidden shadow-inner relative">
            {mapLoading ? (
              <div className="h-80 bg-gray-100 flex items-center justify-center font-bold text-gray-400">지도를 불러오는 중입니다...</div>
            ) : mapError ? (
              <div className="h-80 bg-red-50 flex items-center justify-center font-bold text-red-500">지도 로드 실패</div>
            ) : (
              <Map
                center={mapCenter}
                isPanto={true} 
                style={{ width: "100%", height: "400px" }}
                level={mapLevel} 
                mapTypeId={3}
              >
                {(Object.keys(sectorPaths) as Array<keyof typeof sectorPaths>).map((sector) => {
                  const isCompleted = completedSectors.includes(sector);
                  const isActive = activeSector === sector;

                  return (
                    <div key={sector}>
                      <Polygon
                        path={sectorPaths[sector]}
                        strokeWeight={3}
                        strokeColor={isCompleted ? "#2563EB" : (isActive ? "#FF0000" : "#00FF00")}
                        strokeOpacity={0.9}
                        strokeStyle="solid"
                        fillColor={isCompleted ? "#3B82F6" : (isActive ? "#FF0000" : "#00FF00")}
                        fillOpacity={isActive ? 0.4 : 0.25}
                        onClick={() => { 
                          setActiveSector(sector); 
                          setMapCenter(sectorCenters[sector]); 
                          setMapLevel(4);
                          setActionLog(null); 
                        }}
                      />
                      <CustomOverlayMap position={sectorCenters[sector]}>
                        <div 
                          className={`px-4 py-2 rounded-full font-black text-xs shadow-lg cursor-pointer ${
                            isCompleted ? 'bg-blue-600 text-white border-2 border-white' : 
                            isActive ? 'bg-red-500 text-white transform scale-110' : 'bg-green-600 text-white'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveSector(sector);
                            setMapCenter(sectorCenters[sector]);
                            setMapLevel(4);
                            setActionLog(null);
                          }}
                        >
                          {isCompleted ? `✅ ${sector} 완료` : sector}
                        </div>
                      </CustomOverlayMap>
                    </div>
                  );
                })}

                {myLocation && (
                  <MapMarker position={myLocation}>
                    <div className="p-1 text-red-500 font-bold text-sm bg-white rounded-full px-2 border-2 border-red-500 shadow-md">
                      📍 내 농장
                    </div>
                  </MapMarker>
                )}
              </Map>
            )}

            <button 
              onClick={handleGpsSearch}
              disabled={isGpsLoading}
              className="absolute bottom-4 right-4 bg-white hover:bg-gray-50 border-2 border-blue-500 text-blue-700 px-4 py-3 rounded-2xl text-sm font-black shadow-2xl z-10 flex items-center gap-2 transition-transform transform hover:scale-105 active:scale-95"
            >
              {isGpsLoading ? '📡 GPS 연결 중...' : '🎯 내 농장 위치 찾기'}
            </button>
          </div>

          {data && (
            <>
              <div className="grid grid-cols-3 gap-4 text-center mb-8 bg-green-100/50 rounded-2xl p-5 border border-green-100">
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

              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">🤖 AI 농업 전문가 조언</h2>
                <div className="text-gray-700 leading-relaxed whitespace-pre-line bg-gray-50 p-6 rounded-2xl border border-gray-200 text-lg shadow-sm">
                  {data.recommendation}
                </div>
              </div>
            </>
          )}

          {/* 👇 신규 추가: 🎤 AI 음성 영농 일지 섹션 👇 */}
          <div className="border-t-2 border-dashed border-gray-200 pt-8 mt-8 text-center">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center justify-center gap-2">
              🎙️ AI 스마트 영농 일지
            </h2>
            <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-2xl shadow-sm text-left">
              <button
                onClick={handleVoiceRecord}
                className={`w-full py-4 px-6 rounded-2xl font-black text-white text-lg transition-all shadow-lg flex items-center justify-center gap-3 mb-4 ${
                  isRecording 
                    ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                    : 'bg-indigo-600 hover:bg-indigo-700 transform hover:scale-105 active:scale-95'
                }`}
              >
                {isRecording ? '🔴 마이크 끄기 (말씀하세요...)' : '🎙️ 음성으로 일지 쓰기'}
              </button>

              <textarea 
                value={voiceText}
                onChange={(e) => setVoiceText(e.target.value)}
                placeholder="마이크 버튼을 누르고 '오늘 잡초 뽑고 농약 2통 살포 완료' 라고 말해보세요."
                className="w-full p-4 rounded-xl border-2 border-indigo-200 focus:border-indigo-500 outline-none resize-none h-24 text-gray-700 font-medium mb-4 shadow-inner bg-white"
              />
              
              <button 
                onClick={saveDiary}
                disabled={!voiceText.trim()}
                className="w-full bg-gray-800 hover:bg-black text-white font-bold py-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                💾 {activeSector} 작업 일지 저장하기
              </button>
            </div>

            {/* 저장된 일지 목록 */}
            {diaryLogs.length > 0 && (
              <div className="mt-6 text-left">
                <h3 className="text-lg font-bold text-gray-700 mb-3 flex items-center gap-2">
                  📋 최근 작업 기록
                </h3>
                <ul className="space-y-3">
                  {diaryLogs.map((log, idx) => (
                    <li key={idx} className="bg-white px-4 py-3 rounded-xl border-l-4 border-indigo-500 shadow-sm text-gray-700 font-medium">
                      {log}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {/* 👆 신규 추가 끝 👆 */}

        </div>
      </div>
    </main>
  );
}
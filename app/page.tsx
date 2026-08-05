'use client';

import { useState, useEffect } from 'react';
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
        
        // 1. 카메라 중심을 내 위치로 먼저 부드럽게 이동시킵니다.
        setMapCenter({ lat, lng }); 
        setMyLocation({ lat, lng }); 
        setActiveSector('내 농장(GPS)'); 
        
        // 💡 2. [시간차 공격!] 0.6초 뒤에 지도를 1레벨로 확! 줌인시킵니다.
        setTimeout(() => {
          setMapLevel(1); 
        }, 600);
        
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

    fetch('/api/action-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sector: activeSector, action_message: actionMessage }),
    }).catch(console.error);
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
                isPanto={true} // 💡 마법의 속성: 지도가 뚝! 안 끊기고 스무스하게 쓱~ 날아갑니다.
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
                          // 💡 다시 샘플 구역 누르면 멀리서 보이게 줌 아웃 (레벨 4)
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

              <div className="mb-10 text-center">
                <h2 className="text-lg font-bold text-blue-700 mb-3">{activeSector} 잡초 발아 위험도</h2>
                <div className="text-6xl font-black text-red-500 mb-6">{data.riskScore} <span className="text-2xl text-gray-400">/ 100</span></div>
                <div className="w-full bg-gray-100 rounded-full h-5 shadow-inner overflow-hidden">
                  <div className="bg-gradient-to-r from-orange-400 to-red-500 h-5 rounded-full transition-all duration-1000 ease-out" style={{ width: `${data.riskScore}%` }}></div>
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

          <div className="border-t-2 border-dashed border-gray-200 pt-8 text-center">
            {completedSectors.includes(activeSector) ? (
              <div className="w-full md:w-auto bg-blue-100 border-2 border-blue-500 text-blue-800 font-bold py-4 px-12 rounded-2xl text-xl shadow-inner mx-auto inline-block">
                ✅ {activeSector} 방제 완료
              </div>
            ) : (
              <button 
                onClick={handleAction}
                className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-12 rounded-2xl text-xl shadow-lg transition-transform transform hover:scale-105 active:scale-95 mx-auto"
              >
                🚜 {activeSector} 방제 완료 보고
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
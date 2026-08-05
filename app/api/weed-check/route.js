import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

// 간단 인메모리 캐시: 개발용으로 동일 좌표 요청 시 최근 응답을 빠르게 반환
const cache = new Map(); // key -> { ts: number, data: any }
const CACHE_TTL = 60 * 1000; // 60초
const MODEL_TIMEOUT = 25 * 1000; // 모델 호출 타임아웃 25초

// 1. 위도/경도를 기상청 전용 X/Y 격자로 변환해주는 공식 함수
function getGridXY(lat, lng) {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0;
  const OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const DEGRAD = Math.PI / 180.0;
  
  const re = RE / GRID;
  let sn = Math.log(Math.cos(SLAT1 * DEGRAD) / Math.cos(SLAT2 * DEGRAD)) / Math.log(Math.tan(Math.PI * 0.25 + SLAT2 * DEGRAD * 0.5) / Math.tan(Math.PI * 0.25 + SLAT1 * DEGRAD * 0.5));
  let sf = Math.pow(Math.tan(Math.PI * 0.25 + SLAT1 * DEGRAD * 0.5), sn) * Math.cos(SLAT1 * DEGRAD) / sn;
  let ro = re * sf / Math.pow(Math.tan(Math.PI * 0.25 + OLAT * DEGRAD * 0.5), sn);
  let ra = re * sf / Math.pow(Math.tan(Math.PI * 0.25 + (lat) * DEGRAD * 0.5), sn);
  let theta = lng * DEGRAD - OLON * DEGRAD;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return { 
    x: Math.floor(ra * Math.sin(theta) + XO + 0.5), 
    y: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) 
  };
}

export async function GET(request) {
  try {
    // 2. 프론트엔드에서 보낸 내 위치(위도, 경도) 받기 (없으면 기본값 적용)
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat') || '35.0936'; 
    const lng = searchParams.get('lng') || '126.3831';

    // 3. 내 위치를 기상청 좌표(X, Y)로 변환
    const { x, y } = getGridXY(Number(lat), Number(lng));

    // 4. 기상청 API는 매시간 40분에 최신화되므로 시간에 맞게 세팅
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const kst = new Date(utc + (9 * 3600000)); // 한국 시간
    if (kst.getMinutes() < 40) kst.setHours(kst.getHours() - 1);
    
    const base_date = kst.getFullYear().toString() + (kst.getMonth() + 1).toString().padStart(2, '0') + kst.getDate().toString().padStart(2, '0');
    const base_time = kst.getHours().toString().padStart(2, '0') + '00';

    // 5. 공공데이터포털(기상청) 실시간 호출
    const KMA_KEY = process.env.KMA_API_KEY;
    const kmaUrl = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${KMA_KEY}&pageNo=1&numOfRows=10&dataType=JSON&base_date=${base_date}&base_time=${base_time}&nx=${x}&ny=${y}`;
    
    const kmaRes = await fetch(kmaUrl);
    const kmaData = await kmaRes.json();
    
    const items = kmaData.response?.body?.items?.item || [];
    let temp = "25", rain = "0", humidity = "60"; // 에러 대비 기본값

    items.forEach(item => {
      if (item.category === 'T1H') temp = item.obsrValue; // 기온
      if (item.category === 'RN1') rain = item.obsrValue; // 강수량
      if (item.category === 'REH') humidity = item.obsrValue; // 습도
    });

    // 6. 진짜 날씨 데이터를 바탕으로 Gemini AI에게 농사 조언 요청
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'models/gemini-2.5-flash' });

    // 캐시 키: 위도/경도 조합
    const cacheKey = `${lat}:${lng}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data, { status: 200 });
    }

    const prompt = `당신은 대파 밭 잡초 방제 전문가입니다.
    현재 내 밭의 진짜 날씨는 기온 ${temp}도, 강수량 ${rain}mm, 습도 ${humidity}%입니다. 
    이 날씨를 바탕으로 잡초 발아 위험도 점수(0~100)를 예측하고, 오늘 농부에게 필요한 현실적인 방제 조언을 3줄로 작성해주세요.
    반드시 JSON 형식으로만 응답하세요: {"riskScore": 85, "recommendation": "조언내용"}`;

    // 모델 호출에 타임아웃 적용
    const callModel = () => model.generateContent(prompt);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('model timeout')), MODEL_TIMEOUT));
    const result = await Promise.race([callModel(), timeoutPromise]);

    let text = result.response.text();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const aiData = JSON.parse(text);

    const responseBody = {
      weather: { temp, rain, humidity },
      riskScore: aiData.riskScore,
      recommendation: aiData.recommendation
    };

    // 캐시에 저장
    try { cache.set(cacheKey, { ts: Date.now(), data: responseBody }); } catch (e) { /* ignore */ }

    // 7. 최종 결과를 프론트엔드로 발송!
    return NextResponse.json(responseBody, { status: 200 });

  } catch (error) {
    console.error("기상청/AI 처리 에러:", error);
    // 캐시된 예전 응답이 있으면 이를 반환하여 사용자 경험을 개선합니다.
    try {
      const { searchParams } = new URL(request.url);
      const lat = searchParams.get('lat') || '35.0936';
      const lng = searchParams.get('lng') || '126.3831';
      const cacheKey = `${lat}:${lng}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        return NextResponse.json(cached.data, { status: 200 });
      }
    } catch (e) {
      // ignore
    }

    return NextResponse.json({ error: "실시간 데이터를 불러오지 못했습니다." }, { status: 500 });
  }
}
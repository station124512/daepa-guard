import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // .env.local에 복붙하신 DATABASE_URL 암호를 가져와 연결합니다.
    const sql = neon(process.env.DATABASE_URL);
    
    // action_logs 라는 이름의 방제 기록용 테이블을 생성합니다.
    await sql`
      CREATE TABLE IF NOT EXISTS action_logs (
        id SERIAL PRIMARY KEY,
        sector VARCHAR(10) NOT NULL,
        action_message TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    return NextResponse.json({ message: "🌱 임자도 대파 밭 DB 테이블 생성 완료!" }, { status: 200 });
  } catch (error) {
    console.error("DB 생성 에러:", error);
    return NextResponse.json({ error: "DB 생성 실패", details: error.message }, { status: 500 });
  }
}
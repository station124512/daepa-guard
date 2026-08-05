import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    // 1. 프론트엔드에서 보낸 데이터(구역, 방제 메시지)를 꺼냅니다.
    const body = await request.json();
    const { sector, action_message } = body;

    // 2. 데이터가 비어있으면 에러를 뱉습니다.
    if (!sector || !action_message) {
      return NextResponse.json({ error: "데이터가 부족합니다." }, { status: 400 });
    }

    // 3. DB 금고 문을 열고 기록을 삽입(INSERT)합니다.
    const sql = neon(process.env.DATABASE_URL);
    
    await sql`
      INSERT INTO action_logs (sector, action_message)
      VALUES (${sector}, ${action_message})
    `;

    return NextResponse.json({ message: "방제 기록이 성공적으로 저장되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("DB 저장 에러:", error);
    return NextResponse.json({ error: "DB 저장 실패", details: error.message }, { status: 500 });
  }
}
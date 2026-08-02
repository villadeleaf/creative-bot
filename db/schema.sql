-- น้องครีเอทีฟ 🎨 — ตารางฐานข้อมูลกลาง (แชร์กันทั้งทีม)
-- รันครั้งเดียวใน Supabase → SQL Editor → New query → วาง → Run
-- server เท่านั้นที่เข้าถึง (ผ่าน service_role key) — เปิด RLS ปิดทางฝั่ง client ไว้เพื่อความปลอดภัย

create table if not exists calendar (
  id bigint generated always as identity primary key,
  d text not null,                 -- วันที่รูปแบบ 'YYYY-MM-DD'
  txt text not null,               -- รายละเอียดโพสต์
  created_at timestamptz default now()
);

create table if not exists ideas (
  id bigint generated always as identity primary key,
  txt text not null,               -- ไอเดีย/คำตอบที่เก็บไว้
  created_at timestamptz default now()
);

alter table calendar enable row level security;   -- service_role ข้ามได้, anon เข้าไม่ได้
alter table ideas    enable row level security;

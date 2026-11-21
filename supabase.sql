-- انسخ هذا كله في Supabase > SQL Editor ثم اضغط Run

-- الأساتذة: رمز الدخول محفوظ مشفّرًا (hash) ولا يُخزَّن الرمز نفسه
create table if not exists teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code_hash text unique not null,
  created_at timestamptz default now()
);

-- التلاميذ: كل تلميذ تابع لأستاذ واحد
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  name text not null,
  code text unique not null,
  created_at timestamptz default now()
);

create table if not exists recordings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  surah int not null,
  ayah_from int,
  ayah_to int,
  audio_path text not null,
  status text not null default 'pending',   -- pending | ok | redo
  note text,
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

-- محاولات الدخول الخاطئة (للحماية من تخمين الرموز)
create table if not exists login_failures (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz default now()
);
create index if not exists login_failures_ip_time on login_failures (ip, created_at);
create index if not exists students_teacher on students (teacher_id);
create index if not exists recordings_student on recordings (student_id, status);

-- حماية: لا أحد يقرأ الجداول مباشرة، كل شيء يمر عبر الخادم فقط
alter table teachers enable row level security;
alter table students enable row level security;
alter table recordings enable row level security;
alter table login_failures enable row level security;

-- مخزن التسجيلات (خاص، غير عام)
insert into storage.buckets (id, name, public)
values ('recitations', 'recitations', false)
on conflict (id) do nothing;

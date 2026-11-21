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

-- الواجبات: الآيات التي يطلبها الأستاذ (student_id فارغ = لكل تلاميذه)
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  surah int not null,
  ayah_from int not null,
  ayah_to int not null,
  note text,
  created_at timestamptz default now()
);
create index if not exists assignments_teacher on assignments (teacher_id, created_at);
alter table assignments enable row level security;

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

-- الحصة المباشرة + الإشعارات + من المتصل
alter table teachers add column if not exists last_seen timestamptz;
alter table teachers add column if not exists live_room text;
alter table teachers add column if not exists live_started_at timestamptz;
alter table teachers add column if not exists announcement text;
alter table teachers add column if not exists announced_at timestamptz;
alter table students add column if not exists last_seen timestamptz;

-- اشتراكات الإشعارات (جهاز التلميذ)
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
create index if not exists push_student on push_subscriptions (student_id);

-- إعدادات داخلية (مفاتيح الإشعارات تُولَّد تلقائيًا وتُحفظ هنا)
create table if not exists settings (
  key text primary key,
  value jsonb not null
);

alter table push_subscriptions enable row level security;
alter table settings enable row level security;


notify pgrst, 'reload schema';

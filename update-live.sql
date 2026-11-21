-- تحديث: الحصة المباشرة + الإشعارات + من المتصل
-- شغّل هذا مرة واحدة في Supabase > SQL Editor

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

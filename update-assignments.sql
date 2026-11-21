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
notify pgrst, 'reload schema';

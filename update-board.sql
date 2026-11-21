-- تحديث: لوحة العرض (الآيات المعروضة أثناء الحصة)
-- شغّل هذا مرة واحدة في Supabase > SQL Editor
alter table teachers
  add column if not exists board_surah int,
  add column if not exists board_from int,
  add column if not exists board_to int,
  add column if not exists board_current int,
  add column if not exists board_updated_at timestamptz;
notify pgrst, 'reload schema';

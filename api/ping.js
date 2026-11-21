import { db, authStudent, authTeacher, fail, isOnline, liveActive } from './_lib.js';

// نبضة كل 30 ثانية: تسجّل أن صاحبها متصل، وتُرجع حالة الآخرين
export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const now = new Date().toISOString();

  // ---------- الأستاذ: يرى تلاميذه (متصل أم لا، ومن فعّل الإشعارات) ----------
  if (req.headers['x-teacher-code']) {
    const teacher = await authTeacher(req, res);
    if (!teacher) return;
    await db.from('teachers').update({ last_seen: now }).eq('id', teacher.id);
    const [{ data: t }, { data: studs }] = await Promise.all([
      db.from('teachers').select('live_room,live_started_at,announcement,announced_at').eq('id', teacher.id).maybeSingle(),
      db.from('students').select('id,name,last_seen').eq('teacher_id', teacher.id).order('name')
    ]);
    const ids = (studs || []).map(s => s.id);
    const { data: subs } = ids.length
      ? await db.from('push_subscriptions').select('student_id').in('student_id', ids)
      : { data: [] };
    const withPush = new Set((subs || []).map(s => s.student_id));
    const live = liveActive(t);
    return res.json({
      live: live ? { room: t.live_room, started_at: t.live_started_at } : null,
      announcement: t?.announcement || null, announced_at: t?.announced_at || null,
      students: (studs || []).map(s => ({ id: s.id, name: s.name, online: isOnline(s.last_seen), push: withPush.has(s.id) }))
    });
  }

  // ---------- التلميذ: يرى هل أستاذه متصل، والإعلان، ورابط الحصة إن بدأت ----------
  const student = await authStudent(req, res, req.body?.code);
  if (!student) return;
  await db.from('students').update({ last_seen: now }).eq('id', student.id);
  const { data: t } = await db.from('teachers')
    .select('name,last_seen,live_room,live_started_at,announcement,announced_at')
    .eq('id', student.teacher_id).maybeSingle();
  const live = liveActive(t);
  res.json({
    teacher: { name: t?.name || '', online: isOnline(t?.last_seen) },
    live: live ? { room: t.live_room, started_at: t.live_started_at } : null,
    announcement: t?.announcement || null, announced_at: t?.announced_at || null,
    me: student.name
  });
}

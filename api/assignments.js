import { db, authStudent, authTeacher, fail } from './_lib.js';

// الواجبات: الأستاذ يحدد الآيات المطلوبة، والتلميذ يراها
export default async function handler(req, res) {
  // ---------- التلميذ: واجباته (الموجهة له أو لكل تلاميذ أستاذه) ----------
  if (req.method === 'GET' && !req.headers['x-teacher-code']) {
    const student = await authStudent(req, res, req.query.code);
    if (!student) return;
    const { data, error } = await db.from('assignments')
      .select('id,student_id,surah,ayah_from,ayah_to,note,created_at')
      .eq('teacher_id', student.teacher_id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return fail(res, 500, error.message);
    const mine = data.filter(a => !a.student_id || a.student_id === student.id).slice(0, 10);
    return res.json(mine.map(({ student_id, ...a }) => a));
  }

  const teacher = await authTeacher(req, res);
  if (!teacher) return;

  if (req.method === 'GET') {
    const { data, error } = await db.from('assignments')
      .select('id,student_id,surah,ayah_from,ayah_to,note,created_at,students(name)')
      .eq('teacher_id', teacher.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return fail(res, 500, error.message);
    return res.json(data.map(({ students, ...a }) => ({ ...a, student: students?.name || null })));
  }

  if (req.method === 'POST') {
    const { student_id, surah, from, to, note } = req.body || {};
    const s = parseInt(surah, 10), f = parseInt(from, 10), t = parseInt(to, 10) || f;
    if (!(s >= 1 && s <= 114)) return fail(res, 400, 'اختر السورة');
    if (!(f >= 1) || t < f || t - f > 100) return fail(res, 400, 'حدد الآيات (من … إلى …)');
    if (student_id) {
      const { data: st } = await db.from('students').select('id')
        .eq('id', student_id).eq('teacher_id', teacher.id).maybeSingle();
      if (!st) return fail(res, 404, 'التلميذ غير موجود');
    }
    const { data, error } = await db.from('assignments').insert({
      teacher_id: teacher.id, student_id: student_id || null,
      surah: s, ayah_from: f, ayah_to: t, note: String(note || '').slice(0, 500)
    }).select('id').single();
    if (error) return fail(res, 500, error.message);
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { error } = await db.from('assignments').delete()
      .eq('id', req.query.id).eq('teacher_id', teacher.id);
    if (error) return fail(res, 500, error.message);
    return res.json({ ok: true });
  }

  fail(res, 405, 'Method not allowed');
}

import { db, authTeacher, fail } from './_lib.js';

// الأستاذ يصحّح تسجيلًا لأحد تلاميذه: ok = صحيحة، redo = تحتاج إعادة
export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const teacher = await authTeacher(req, res);
  if (!teacher) return;
  const { id, status, note } = req.body || {};
  if (!['ok', 'redo'].includes(status)) return fail(res, 400, 'حالة غير صالحة');

  // التأكد أن التسجيل لتلميذ من تلاميذ هذا الأستاذ
  const { data: rec } = await db.from('recordings')
    .select('id,students!inner(teacher_id)').eq('id', id).eq('students.teacher_id', teacher.id).maybeSingle();
  if (!rec) return fail(res, 404, 'التسجيل غير موجود');

  const { error } = await db.from('recordings')
    .update({ status, note: String(note || '').slice(0, 1000), reviewed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return fail(res, 500, error.message);
  res.json({ ok: true });
}

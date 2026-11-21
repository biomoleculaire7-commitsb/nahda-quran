import { db, authAdmin, fail, hash, newTeacherCode, removeAudioOf } from './_lib.js';

// خاص بالمدير: عرض الأساتذة، إضافة أستاذ، تجديد رمزه، حذفه
export default async function handler(req, res) {
  if (!(await authAdmin(req, res))) return;

  if (req.method === 'GET') {
    const { data, error } = await db.from('teachers')
      .select('id,name,created_at,students(count)').order('name');
    if (error) return fail(res, 500, error.message);
    return res.json(data.map(t => ({ id: t.id, name: t.name, students: t.students?.[0]?.count || 0 })));
  }

  // إضافة أستاذ: يظهر الرمز مرة واحدة فقط
  if (req.method === 'POST') {
    const name = String(req.body?.name || '').trim().slice(0, 80);
    if (!name) return fail(res, 400, 'اكتب اسم الأستاذ');
    const code = newTeacherCode();
    const { data, error } = await db.from('teachers').insert({ name, code_hash: hash(code) }).select('id,name').single();
    if (error) return fail(res, 500, error.message);
    return res.json({ ...data, code });
  }

  // تجديد الرمز (إذا نسيه الأستاذ أو تسرّب)
  if (req.method === 'PATCH') {
    const code = newTeacherCode();
    const { data, error } = await db.from('teachers')
      .update({ code_hash: hash(code) }).eq('id', req.query.id).select('id,name').single();
    if (error) return fail(res, 500, error.message);
    return res.json({ ...data, code });
  }

  // حذف الأستاذ مع تلاميذه وتسجيلاتهم
  if (req.method === 'DELETE') {
    const { data: studs } = await db.from('students').select('id').eq('teacher_id', req.query.id);
    await removeAudioOf((studs || []).map(s => s.id));
    const { error } = await db.from('teachers').delete().eq('id', req.query.id);
    if (error) return fail(res, 500, error.message);
    return res.json({ ok: true });
  }

  fail(res, 405, 'Method not allowed');
}

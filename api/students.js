import { db, authTeacher, fail, newStudentCode, removeAudioOf } from './_lib.js';

// خاص بالأستاذ: تلاميذه فقط
export default async function handler(req, res) {
  const teacher = await authTeacher(req, res);
  if (!teacher) return;

  if (req.method === 'GET') {
    const { data, error } = await db.from('students')
      .select('id,name,code').eq('teacher_id', teacher.id).order('name');
    if (error) return fail(res, 500, error.message);
    return res.json(data);
  }

  if (req.method === 'POST') {
    const name = String(req.body?.name || '').trim().slice(0, 80);
    if (!name) return fail(res, 400, 'اكتب اسم التلميذ');
    for (let i = 0; i < 10; i++) {
      const { data, error } = await db.from('students')
        .insert({ name, code: newStudentCode(), teacher_id: teacher.id })
        .select('id,name,code').single();
      if (!error) return res.json(data);
      if (error.code !== '23505') return fail(res, 500, error.message); // 23505 = رمز مكرر، نعيد المحاولة
    }
    return fail(res, 500, 'تعذّر إنشاء رمز');
  }

  if (req.method === 'DELETE') {
    const { data: s } = await db.from('students')
      .select('id').eq('id', req.query.id).eq('teacher_id', teacher.id).maybeSingle();
    if (!s) return fail(res, 404, 'التلميذ غير موجود');
    await removeAudioOf([s.id]);
    const { error } = await db.from('students').delete().eq('id', s.id);
    if (error) return fail(res, 500, error.message);
    return res.json({ ok: true });
  }

  fail(res, 405, 'Method not allowed');
}

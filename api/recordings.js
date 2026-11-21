import { db, authStudent, authTeacher, signedUrl, fail, BUCKET } from './_lib.js';

const EXT = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3' };
const MAX_BASE64 = 4_300_000; // حد Vercel للطلب ~4.5MB

export default async function handler(req, res) {
  // ---------- التلميذ يرسل تسجيلًا ----------
  if (req.method === 'POST') {
    const { code, surah, from, to, mime, audio } = req.body || {};
    const student = await authStudent(req, res, code);
    if (!student) return;
    const s = parseInt(surah, 10);
    if (!(s >= 1 && s <= 114)) return fail(res, 400, 'اختر السورة');
    if (!audio || audio.length > MAX_BASE64) return fail(res, 400, 'التسجيل طويل جدًا أو فارغ');

    const baseMime = String(mime || 'audio/webm').split(';')[0];
    const ext = EXT[baseMime] || 'webm';
    const path = `${student.id}/${Date.now()}.${ext}`;

    const up = await db.storage.from(BUCKET).upload(path, Buffer.from(audio, 'base64'), { contentType: baseMime });
    if (up.error) return fail(res, 500, up.error.message);

    const { error } = await db.from('recordings').insert({
      student_id: student.id, surah: s,
      ayah_from: parseInt(from, 10) || null, ayah_to: parseInt(to, 10) || null,
      audio_path: path
    });
    if (error) return fail(res, 500, error.message);
    return res.json({ ok: true });
  }

  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');

  // ---------- الأستاذ: تسجيلات تلاميذه فقط ----------
  if (req.headers['x-teacher-code']) {
    const teacher = await authTeacher(req, res);
    if (!teacher) return;
    const status = req.query.status || 'pending';
    let q = db.from('recordings')
      .select('id,surah,ayah_from,ayah_to,audio_path,status,note,created_at,students!inner(name,teacher_id)')
      .eq('students.teacher_id', teacher.id)
      .order('created_at', { ascending: status === 'pending' })
      .limit(100);
    q = status === 'pending' ? q.eq('status', 'pending') : q.neq('status', 'pending');
    const { data, error } = await q;
    if (error) return fail(res, 500, error.message);
    const out = await Promise.all(data.map(async ({ students, audio_path, ...r }) =>
      ({ ...r, student: students?.name, url: await signedUrl(audio_path) })));
    return res.json(out);
  }

  // ---------- التلميذ: تسجيلاته فقط ----------
  const student = await authStudent(req, res, req.query.code);
  if (!student) return;
  const { data, error } = await db.from('recordings')
    .select('id,surah,ayah_from,ayah_to,audio_path,status,note,created_at')
    .eq('student_id', student.id)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) return fail(res, 500, error.message);
  const out = await Promise.all(data.map(async ({ audio_path, ...r }) => ({ ...r, url: await signedUrl(audio_path) })));
  res.json(out);
}

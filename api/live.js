import { db, authTeacher, fail, pushToStudents, randomToken } from './_lib.js';

// الأستاذ: إعلان موعد، بدء الحصة، إنهاء الحصة
export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const teacher = await authTeacher(req, res);
  if (!teacher) return;

  const { action, text } = req.body || {};
  const { data: studs } = await db.from('students').select('id').eq('teacher_id', teacher.id);
  const ids = (studs || []).map(s => s.id);
  const host = req.headers.host;

  if (action === 'announce') {
    const msg = String(text || '').trim().slice(0, 300);
    if (!msg) return fail(res, 400, 'اكتب نص الإعلان');
    await db.from('teachers').update({ announcement: msg, announced_at: new Date().toISOString() }).eq('id', teacher.id);
    const r = await pushToStudents(ids, { title: `📢 ${teacher.name}`, body: msg, url: '/?live=1', tag: 'announce' }, host);
    return res.json({ ok: true, ...r, students: ids.length });
  }

  if (action === 'start') {
    const room = `NahdaQuran-${randomToken(16)}`;   // اسم غرفة عشوائي لا يمكن تخمينه
    await db.from('teachers').update({ live_room: room, live_started_at: new Date().toISOString() }).eq('id', teacher.id);
    const r = await pushToStudents(ids, {
      title: '🔴 بدأت الحصة المباشرة',
      body: `${teacher.name} في انتظارك، اضغط للدخول`,
      url: '/?live=1', tag: 'live'
    }, host);
    return res.json({ ok: true, room, ...r, students: ids.length });
  }

  if (action === 'end') {
    await db.from('teachers').update({ live_room: null, live_started_at: null }).eq('id', teacher.id);
    return res.json({ ok: true });
  }

  if (action === 'clear') {
    await db.from('teachers').update({ announcement: null, announced_at: null }).eq('id', teacher.id);
    return res.json({ ok: true });
  }

  fail(res, 400, 'إجراء غير معروف');
}

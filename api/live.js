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

  // لوحة العرض: الآيات المعروضة والآية الحالية
  if (action === 'board') {
    const s = parseInt(req.body.surah, 10), f = parseInt(req.body.from, 10);
    const t = parseInt(req.body.to, 10) || f;
    const c = parseInt(req.body.current, 10) || f;
    if (!(s >= 1 && s <= 114) || !(f >= 1) || t < f || t - f > 60 || c < f || c > t)
      return fail(res, 400, 'تحقق من السورة وأرقام الآيات (60 آية كحد أقصى)');
    await db.from('teachers').update({
      board_surah: s, board_from: f, board_to: t, board_current: c, board_updated_at: new Date().toISOString()
    }).eq('id', teacher.id);
    return res.json({ ok: true });
  }

  if (action === 'board_clear') {
    await db.from('teachers').update({ board_surah: null, board_from: null, board_to: null, board_current: null,
      board_updated_at: new Date().toISOString() }).eq('id', teacher.id);
    return res.json({ ok: true });
  }

  if (action === 'end') {
    await db.from('teachers').update({ live_room: null, live_started_at: null,
      board_surah: null, board_from: null, board_to: null, board_current: null }).eq('id', teacher.id);
    return res.json({ ok: true });
  }

  if (action === 'clear') {
    await db.from('teachers').update({ announcement: null, announced_at: null }).eq('id', teacher.id);
    return res.json({ ok: true });
  }

  fail(res, 400, 'إجراء غير معروف');
}

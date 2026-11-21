import { db, authStudent, vapid, fail } from './_lib.js';

// اشتراك جهاز التلميذ في الإشعارات
export default async function handler(req, res) {
  // المفتاح العام (لا يحتاج دخولًا)
  if (req.method === 'GET') {
    const { publicKey } = await vapid(req.headers.host);
    return res.json({ publicKey });
  }

  const { code, subscription, endpoint } = req.body || {};
  const student = await authStudent(req, res, code);
  if (!student) return;

  if (req.method === 'POST') {
    const ep = subscription?.endpoint, keys = subscription?.keys || {};
    if (!ep || !/^https:\/\//.test(ep) || !keys.p256dh || !keys.auth) return fail(res, 400, 'اشتراك غير صالح');
    await db.from('push_subscriptions').delete().eq('endpoint', ep);
    const { error } = await db.from('push_subscriptions')
      .insert({ student_id: student.id, endpoint: ep, p256dh: keys.p256dh, auth: keys.auth });
    if (error) return fail(res, 500, error.message);
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    await db.from('push_subscriptions').delete().eq('endpoint', String(endpoint || '')).eq('student_id', student.id);
    return res.json({ ok: true });
  }

  fail(res, 405, 'Method not allowed');
}

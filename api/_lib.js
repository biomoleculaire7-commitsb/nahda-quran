import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const BUCKET = 'recitations';
const MAX_FAILS = 10;      // عدد المحاولات الخاطئة المسموح بها
const WINDOW_MIN = 15;     // خلال كم دقيقة

// تنظيف الرابط: نقبل فقط https://xxxx.supabase.co (بدون /rest/v1 أو / في الآخر)
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim()
  .replace(/\/(rest|storage|auth)\/v1.*$/, '')
  .replace(/\/+$/, '');

export const db = createClient(
  SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export function fail(res, status, message) {
  res.status(status).json({ error: message });
  return null;
}

export const hash = s => crypto.createHash('sha256').update(String(s)).digest('hex');

function sameSecret(a, b) {
  const x = Buffer.from(hash(a)), y = Buffer.from(hash(b));
  return crypto.timingSafeEqual(x, y);
}

// ---------- توليد الرموز ----------
export const newStudentCode = () => String(crypto.randomInt(100000, 1000000));   // 6 أرقام
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';                               // بدون O/0 و I/1/L
export const newTeacherCode = () =>
  Array.from({ length: 8 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

// ---------- الحد من محاولات التخمين ----------
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}
async function blocked(req) {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const { count } = await db.from('login_failures')
    .select('id', { count: 'exact', head: true })
    .eq('ip', clientIp(req)).gte('created_at', since);
  return (count || 0) >= MAX_FAILS;
}
async function recordFailure(req) {
  await db.from('login_failures').insert({ ip: clientIp(req) });
  // تنظيف المحاولات القديمة (أكثر من يوم)
  await db.from('login_failures').delete().lt('created_at', new Date(Date.now() - 86_400_000).toISOString());
}
const TOO_MANY = 'محاولات خاطئة كثيرة، انتظر ربع ساعة ثم حاول مرة أخرى';

// ---------- التحقق من الهوية ----------
// كل دالة تُرجع صاحب الهوية، أو null بعد أن ترسل رسالة الخطأ

export async function authStudent(req, res, code) {
  if (await blocked(req)) return fail(res, 429, TOO_MANY);
  let student = null;
  if (/^\d{6}$/.test(String(code || ''))) {
    const { data } = await db.from('students')
      .select('id,name,teacher_id,teachers(name)').eq('code', String(code)).maybeSingle();
    student = data;
  }
  if (!student) { await recordFailure(req); return fail(res, 401, 'الرمز غير صحيح'); }
  return student;
}

export async function authTeacher(req, res) {
  if (await blocked(req)) return fail(res, 429, TOO_MANY);
  const code = String(req.headers['x-teacher-code'] || '').trim().toUpperCase();
  let teacher = null;
  if (code.length === 8) {
    const { data } = await db.from('teachers').select('id,name').eq('code_hash', hash(code)).maybeSingle();
    teacher = data;
  }
  if (!teacher) { await recordFailure(req); return fail(res, 401, 'رمز الأستاذ غير صحيح'); }
  return teacher;
}

export async function authAdmin(req, res) {
  if (await blocked(req)) return fail(res, 429, TOO_MANY);
  const pass = String(req.headers['x-admin-password'] || '');
  const real = process.env.ADMIN_PASSWORD || '';
  if (!real || !pass || !sameSecret(pass, real)) { await recordFailure(req); return fail(res, 401, 'كلمة السر غير صحيحة'); }
  return true;
}

// ---------- أدوات ----------
export async function signedUrl(path) {
  const { data } = await db.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl || null;
}

export async function removeAudioOf(studentIds) {
  if (!studentIds.length) return;
  const { data } = await db.from('recordings').select('audio_path').in('student_id', studentIds);
  const paths = (data || []).map(r => r.audio_path);
  for (let i = 0; i < paths.length; i += 500) await db.storage.from(BUCKET).remove(paths.slice(i, i + 500));
}

// ---------- من المتصل ----------
export const ONLINE_SECONDS = 70;
export const isOnline = ts => Boolean(ts) && (Date.now() - new Date(ts).getTime()) < ONLINE_SECONDS * 1000;
export const LIVE_HOURS = 3;   // الحصة تنتهي تلقائيًا بعد 3 ساعات إن نسي الأستاذ إنهاءها
export const liveActive = t => Boolean(t?.live_room) && t.live_started_at &&
  (Date.now() - new Date(t.live_started_at).getTime()) < LIVE_HOURS * 3600_000;
export const randomToken = n =>
  Array.from({ length: n }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

// ---------- الإشعارات (Web Push) ----------
// المفاتيح تُولَّد تلقائيًا أول مرة وتُحفظ في جدول settings، فلا حاجة لإعداد شيء
import webpush from 'web-push';
let _vapid = null;
export async function vapid(host) {
  if (!_vapid) {
    let { data } = await db.from('settings').select('value').eq('key', 'vapid').maybeSingle();
    if (!data) {
      await db.from('settings').insert({ key: 'vapid', value: webpush.generateVAPIDKeys() });
      ({ data } = await db.from('settings').select('value').eq('key', 'vapid').maybeSingle());
    }
    _vapid = data.value;
  }
  const subject = process.env.VAPID_SUBJECT || (host ? `https://${host}` : 'mailto:admin@example.com');
  webpush.setVapidDetails(subject, _vapid.publicKey, _vapid.privateKey);
  return _vapid;
}

export async function pushToStudents(studentIds, payload, host) {
  if (!studentIds.length) return { sent: 0, total: 0 };
  await vapid(host);
  const { data: subs } = await db.from('push_subscriptions')
    .select('id,endpoint,p256dh,auth').in('student_id', studentIds);
  let sent = 0; const dead = [];
  await Promise.all((subs || []).map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.id);   // اشتراك منتهي
    }
  }));
  if (dead.length) await db.from('push_subscriptions').delete().in('id', dead);
  return { sent, total: (subs || []).length };
}

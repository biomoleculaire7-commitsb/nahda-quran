import { authTeacher, fail } from './_lib.js';

// الأستاذ يتحقق من رمزه عند الدخول
export default async function handler(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');
  const teacher = await authTeacher(req, res);
  if (!teacher) return;
  res.json({ name: teacher.name });
}

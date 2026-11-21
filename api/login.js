import { authStudent, fail } from './_lib.js';

// التلميذ يدخل برمزه (6 أرقام)
export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const student = await authStudent(req, res, req.body?.code);
  if (!student) return;
  res.json({ name: student.name, teacher: student.teachers?.name || '' });
}

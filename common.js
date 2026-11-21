const SURAHS = ["الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس","هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه","الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم","لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر","فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق","الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة","الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة","المعارج","نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس","التكوير","الانفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد","الشمس","الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات","القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر","المسد","الإخلاص","الفلق","الناس"];

const STATUS = { pending: ["بانتظار التصحيح", "#b7791f"], ok: ["صحيحة ✓", "#0f6b4f"], redo: ["أعِد القراءة", "#c53030"] };

function surahLabel(r) {
  const range = r.ayah_from ? ` (${r.ayah_from}${r.ayah_to && r.ayah_to !== r.ayah_from ? "–" + r.ayah_to : ""})` : "";
  return `سورة ${SURAHS[r.surah - 1]}${range}`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function store(key, val) {
  try { if (val === undefined) return localStorage.getItem(key); if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val); }
  catch (e) { return null; }
}

async function api(path, { method = "GET", body, headers = {} } = {}) {
  const r = await fetch(path, {
    method, headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const raw = await r.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (e) {}
  if (!r.ok) {
    if (data.error) throw new Error(data.error);
    // رسالة تشخيص: رقم الخطأ وبداية رد الخادم
    const hint = r.status === 404 ? "الملف غير موجود على الخادم (لم يُرفع أو لم يُنشر)"
               : r.status === 413 ? "التسجيل أكبر من المسموح، سجّل مدة أقصر"
               : raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    throw new Error(`حدث خطأ (${r.status}): ${hint}`);
  }
  return data;
}

// ---------- نص ورش (مجمع الملك فهد، عبر fawazahmed0/quran-api) ----------
const WARSH_BASE = "https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/ara-quranwarsh";
const _warshCache = {};
async function warshChapter(surah) {
  if (_warshCache[surah]) return _warshCache[surah];
  let data = null;
  for (const url of [`${WARSH_BASE}/${surah}.min.json`, `${WARSH_BASE}/${surah}.json`]) {
    try { const r = await fetch(url); if (r.ok) { data = await r.json(); break; } } catch (e) {}
  }
  if (!data) throw new Error("تعذّر تحميل نص الآيات، تحقق من الإنترنت");
  const list = Array.isArray(data) ? data : (data.chapter || data.verses || data.quran || []);
  const verses = list.map(v => ({ n: Number(v.verse ?? v.verse_number ?? v.number), t: String(v.text ?? "") }))
                     .filter(v => v.n && v.t);
  if (!verses.length) throw new Error("صيغة نص الآيات غير متوقعة");
  return (_warshCache[surah] = verses);
}
async function warshAyat(surah, from, to) {
  const all = await warshChapter(surah);
  return all.filter(v => v.n >= from && v.n <= (to || from));
}
const toArabicDigits = n => String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);

// ---------- الحصة المباشرة ----------
function jitsiUrl(room, name) {
  return `https://meet.jit.si/${encodeURIComponent(room)}#userInfo.displayName=${encodeURIComponent(JSON.stringify(name || ""))}`;
}
const dot = on => `<span class="dot${on ? " on" : ""}"></span>`;
function timeAgo(ts) {
  if (!ts) return "";
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.round(m / 60);
  return h < 24 ? `منذ ${h} ساعة` : new Date(ts).toLocaleDateString("ar-DZ");
}

// نبضة كل 30 ثانية ما دامت الصفحة ظاهرة
function startHeartbeat(fn, every = 30000) {
  let timer = null;
  const run = () => { if (document.visibilityState === "visible") fn(); };
  run();
  timer = setInterval(run, every);
  document.addEventListener("visibilitychange", run);
  return () => clearInterval(timer);
}

// ---------- لوحة العرض ----------
// ترسم الآيات، وتلوّن الآية الحالية، وتجعل كل آية قابلة للضغط (عند الأستاذ)
async function renderBoard(el, board, onPick) {
  const key = `${board.surah}:${board.from}:${board.to}`;
  if (el.dataset.key !== key) {
    el.dataset.key = key;
    el.innerHTML = `<div class="hint">جارٍ تحميل الآيات…</div>`;
    let ayat;
    try { ayat = await warshAyat(board.surah, board.from, board.to); }
    catch (e) { el.dataset.key = ""; el.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; return; }
    el.innerHTML = "";
    const title = document.createElement("div");
    title.className = "board-title";
    title.textContent = `سورة ${SURAHS[board.surah - 1]}`;
    const body = document.createElement("div");
    body.className = "quran board";
    for (const v of ayat) {
      const span = document.createElement("span");
      span.className = "ayah"; span.dataset.n = v.n;
      span.append(v.t + " ");
      const n = document.createElement("span"); n.className = "n"; n.textContent = `﴿${toArabicDigits(v.n)}﴾`;
      span.append(n);
      if (onPick) { span.style.cursor = "pointer"; span.onclick = () => onPick(v.n); }
      body.append(span, " ");
    }
    el.append(title, body);
  }
  let curEl = null;
  el.querySelectorAll(".ayah").forEach(a => {
    const on = Number(a.dataset.n) === Number(board.current);
    a.classList.toggle("cur", on);
    if (on) curEl = a;
  });
  if (curEl && el.dataset.cur !== String(board.current)) {
    el.dataset.cur = String(board.current);
    curEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

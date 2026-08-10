// ============================================================
//  น้องครีเอทีฟ 🎨 — เซิร์ฟเวอร์บอท (แยกคนละตัวกับน้องลีฟโดยสิ้นเชิง)
//  ช่องทาง:
//   - GET  /          หน้าเว็บ (public/index.html) — ทีมล็อกอินเข้าใช้
//   - POST /login     ตรวจรหัสทีม (TEAM_PASSWORD)
//   - POST /chat      แชทจริงจากหน้าเว็บ (ต้องล็อกอินก่อน)
//   - POST /ask       สำหรับระบบเฮีย (x-nong-secret: ASK_SECRET)
//   - GET  /selftest  เช็คระบบ
// ============================================================

const path = require("path");
try { require("dotenv").config({ path: path.join(__dirname, ".env") }); } catch (e) {} // โหลด .env ตอนรัน local (บน Render ใช้ env จาก dashboard)

const express = require("express");
const { generateReply, imagePrompt, analyzeImage, analyzeAdsData, visionChat, fetchLiveTrends, fetchPageStats, pageInsightBrief, fbPublish, FB_ON, MODEL,
  IG_CONFIGURED, igAuthUrl, igExchangeCode, igLongLived, igRefresh, igProfile, igPublish, igRecentComments, igReplyComment, igTopMedia } = require("./brain");

const app = express();
const PORT = process.env.PORT || 3100;
const ASK_SECRET = (process.env.ASK_SECRET || "").trim();
const TEAM_PASSWORD = (process.env.TEAM_PASSWORD || "").trim(); // รหัสให้ทีมล็อกอินหน้าเว็บ
const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim(); // สำหรับแก้รูปจริง (gpt-image-1)
const MAX_TURNS = 20;

// ---- ฐานข้อมูลกลาง Supabase (ปฏิทิน+คลังไอเดีย แชร์กันทั้งทีม) ----
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY || "").trim();
const SB_ON = !!(SUPABASE_URL && SUPABASE_KEY);
async function sb(pathq, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathq}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "content-type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

const conversations = new Map();

// ---- Context Memory: ข้อมูลแบรนด์ที่ทีมเพิ่มเอง (น้องอ่านทุกครั้งก่อนตอบ) ----
let brandCache = { at: 0, txt: "" };
async function brandNotes() {
  if (!SB_ON) return "";
  if (Date.now() - brandCache.at < 60 * 1000) return brandCache.txt;
  try {
    const rows = await sb("brand_notes?select=txt&order=id.desc&limit=30");
    brandCache = { at: Date.now(), txt: rows.map((r) => "• " + r.txt).join("\n") };
  } catch (e) { /* ตารางยังไม่ถูกสร้าง — ข้ามเงียบๆ */ }
  return brandCache.txt;
}
// ---- สมองเรียนรู้: บทเรียนจากผลจริงของเพจ (สร้างจาก computeLearnings ด้านล่าง) ----
let learnCache = { at: 0, txt: "" };
async function getLearnings() {
  if (!SB_ON) return "";
  if (Date.now() - learnCache.at < 5 * 60 * 1000) return learnCache.txt;
  try {
    const rows = await sb("page_learnings?select=txt&order=id.desc&limit=1");
    learnCache = { at: Date.now(), txt: (rows && rows[0] && rows[0].txt) || "" };
  } catch (e) { /* ตารางยังไม่ถูกสร้าง — ข้ามเงียบๆ */ }
  return learnCache.txt;
}
// brand + สิ่งที่เรียนรู้จากผลจริง — ผนวกเข้า system ทุกครั้งที่สร้างคอนเทนต์
async function getBrandExtra() {
  const [b, l] = await Promise.all([brandNotes(), getLearnings()]);
  const parts = [];
  if (b) parts.push(b);
  if (l) parts.push("บทเรียนจากผลจริงของเพจ (ใช้เป็นไกด์เขียนคอนเทนต์ให้ตรงกับที่คนของเราชอบ):\n" + l);
  return parts.join("\n\n");
}

// ---- ตรวจรหัสทีม (ใช้กับทุก endpoint ของหน้าเว็บ) ----
function teamOK(req) {
  return TEAM_PASSWORD && (req.headers["x-team-pass"] || "") === TEAM_PASSWORD;
}
// ดึง JSON ก้อนแรกจากข้อความ (เผื่อมี ```json ครอบ)
function parseJSON(t) { try { const m = String(t).match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } catch (e) { return null; } }
// แยกแคปชั่น 4 บล็อกจากมาร์กเกอร์ [FB]/[IG]/[TIKTOK]/[STORY] (รองรับข้อความหลายบรรทัด)
function parseCapBlocks(text) {
  const s = String(text || "");
  const re = /\[(FB|IG|TIKTOK|STORY)\]/gi;
  const marks = []; let m;
  while ((m = re.exec(s))) marks.push({ key: m[1].toLowerCase(), start: m.index, end: re.lastIndex });
  if (!marks.length) return null;
  const out = {};
  for (let i = 0; i < marks.length; i++) {
    const body = s.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].start : s.length).trim();
    if (body) out[marks[i].key] = body;
  }
  return Object.keys(out).length ? out : null;
}
// อ่าน access token ของ IG ที่เชื่อมไว้ (แถวเดียว)
async function igToken() {
  if (!IG_CONFIGURED || !SB_ON) return null;
  try { const rows = await sb("ig_account?select=access_token&order=id.desc&limit=1"); return rows && rows.length ? rows[0].access_token : null; }
  catch (e) { return null; }
}

// ---- เสิร์ฟหน้าเว็บ (public/) ----
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "12mb" })); // เผื่อรูปที่อัปมาแก้ (base64)

// ---- เช็คสุขภาพ (ไม่เรียก AI) ----
app.get("/health", (_req, res) => res.send("น้องครีเอทีฟ 🎨 พร้อมทำงานค่ะ"));

app.get("/selftest", (req, res) => {
  if (!ASK_SECRET || (req.query.key || "") !== ASK_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const rawKey = process.env.ANTHROPIC_API_KEY || "";
  res.json({
    version: "v4-db-image",
    model: MODEL,
    keyRawLen: rawKey.length,
    keyCleanLen: rawKey.replace(/[^A-Za-z0-9_-]/g, "").length,
    teamLogin: TEAM_PASSWORD ? "on" : "off",
    db: SB_ON ? "on" : "off",
    editImage: OPENAI_KEY ? "on" : "off",
    conversations: conversations.size,
  });
});

// ---- ล็อกอินทีม: ตรวจรหัส ----
app.post("/login", express.json({ limit: "16kb" }), (req, res) => {
  if (!TEAM_PASSWORD) return res.status(503).json({ ok: false, error: "ยังไม่ได้ตั้งรหัสทีม (TEAM_PASSWORD)" });
  const pass = String((req.body || {}).password || "");
  if (pass !== TEAM_PASSWORD) return res.status(401).json({ ok: false, error: "รหัสไม่ถูกต้อง" });
  return res.json({ ok: true });
});

// ---- ประวัติแชทถาวร (Supabase: chat_messages) — restart แล้วไม่ลืม ----
async function loadHistory(userId) {
  if (conversations.has(userId)) return conversations.get(userId);
  if (!SB_ON) return [];
  try {
    const rows = await sb(`chat_messages?select=role,content&user_id=eq.${encodeURIComponent(userId)}&order=id.desc&limit=${MAX_TURNS * 2}`);
    return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
  } catch (e) { console.error("loadHistory:", e.message); return []; }
}
function saveMessages(userId, msgs) {
  if (!SB_ON) return;
  sb("chat_messages", { method: "POST", body: JSON.stringify(msgs.map((m) => ({ user_id: userId, role: m.role, content: m.content }))) })
    .catch((e) => console.error("saveMessages:", e.message));
}

// ---- แชทจริงจากหน้าเว็บ (ต้องล็อกอิน = ส่งรหัสทีมมาใน header) ----
app.post("/chat", express.json({ limit: "256kb" }), async (req, res) => {
  if (!TEAM_PASSWORD || (req.headers["x-team-pass"] || "") !== TEAM_PASSWORD) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const { userId, message } = req.body || {};
  if (!userId || !message) return res.status(400).json({ error: "userId and message required" });

  let history = await loadHistory(userId);
  history.push({ role: "user", content: String(message) });
  if (history.length > MAX_TURNS * 2) history = history.slice(-MAX_TURNS * 2);

  let replyText;
  try {
    replyText = await generateReply(history, await getBrandExtra());
  } catch (e) {
    console.error("chat error:", e.message);
    return res.status(200).json({ reply: "ระบบขัดข้องชั่วคราวค่ะ 🙏 ลองอีกครั้งนะคะ" });
  }
  const clean = (replyText || "").replace(/\n{3,}/g, "\n\n").trim();
  if (clean) {
    history.push({ role: "assistant", content: clean });
    conversations.set(userId, history);
    saveMessages(userId, [{ role: "user", content: String(message) }, { role: "assistant", content: clean }]);
  }
  return res.json({ reply: clean || "ขอโทษค่ะ ตอบไม่ได้ตอนนี้ ลองใหม่นะคะ" });
});

// ---- โหลดประวัติแชทมาโชว์ตอนเปิดหน้าเว็บ ----
app.get("/api/history", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  const userId = String(req.query.userId || "");
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    if (!SB_ON) return res.json({ rows: [] });
    const rows = await sb(`chat_messages?select=role,content&user_id=eq.${encodeURIComponent(userId)}&order=id.desc&limit=${MAX_TURNS * 2}`);
    res.json({ rows: rows.reverse() });
  } catch (e) { console.error("history:", e.message); res.json({ rows: [] }); }
});

// ---- ข้อมูลแบรนด์ (Context Memory ที่ทีมแก้เองได้) ----
app.get("/api/brand", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  try {
    if (!SB_ON) return res.json({ rows: [] });
    res.json({ rows: await sb("brand_notes?select=id,txt&order=id.desc&limit=50") });
  } catch (e) { res.json({ rows: [] }); }
});
app.post("/api/brand", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!SB_ON) return res.status(503).json({ error: "nodb" });
  const { txt } = req.body || {};
  if (!txt) return res.status(400).json({ error: "txt required" });
  try {
    const r = await sb("brand_notes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ txt: String(txt).slice(0, 1000) }) });
    brandCache.at = 0; // ให้โหลดใหม่รอบหน้า — มีผลทันที
    res.json({ row: Array.isArray(r) ? r[0] : r });
  } catch (e) { console.error("brand post:", e.message); res.status(500).json({ error: "db" }); }
});
app.delete("/api/brand", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!SB_ON) return res.status(503).json({ error: "nodb" });
  const id = parseInt(req.query.id, 10);
  if (!id) return res.status(400).json({ error: "id required" });
  try { await sb(`brand_notes?id=eq.${id}`, { method: "DELETE" }); brandCache.at = 0; res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: "db" }); }
});

// ---- Always-On: บรีฟเช้าอัตโนมัติ 07:00 ----
app.get("/api/brief-latest", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  try {
    if (!SB_ON) return res.json({});
    const rows = await sb("morning_briefs?select=txt,created_at&order=id.desc&limit=1");
    res.json(rows[0] || {});
  } catch (e) { res.json({}); }
});
async function makeMorningBrief() {
  try {
    const items = await fetchLiveTrends();
    if (items.length) trendsCache = { at: Date.now(), items };
    // ดึง "ข้อมูลจริงในระบบ" มารวมในบรีฟ: แผนโพสต์วันนี้ + ผลโฆษณาล่าสุดที่ทีมวิเคราะห์ไว้
    let calTxt = "", adsTxt = "", fbTxt = "";
    try {
      const s = await fetchPageStats();
      if (s) {
        const top = (s.posts || []).slice().sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments))[0];
        fbTxt = `ยอดเพจ FB "${s.name}": ผู้ติดตาม ${s.followers} คน` + (top ? ` · โพสต์เด่นล่าสุด: "${top.msg}" (❤️${top.likes} 💬${top.comments} 🔁${top.shares})` : "");
      }
    } catch (e) {}
    try {
      const rows = await sb(`calendar?select=txt&d=eq.${encodeURIComponent(dayKey(bkkNow()))}`);
      calTxt = rows.map((r) => r.txt).join(" · ");
    } catch (e) {}
    try {
      const rows = await sb("ads_snapshots?select=data,created_at&order=id.desc&limit=1");
      if (rows[0]) adsTxt = JSON.stringify(rows[0].data).slice(0, 900);
    } catch (e) {}
    const msg =
      "เทรนด์เช้านี้ (น้องค้นเว็บมาแล้ว): " + JSON.stringify(items) +
      (fbTxt ? "\n\n" + fbTxt : "") +
      (calTxt ? "\n\nแผนโพสต์ของวันนี้ในปฏิทินทีม: " + calTxt : "\n\nวันนี้ยังไม่มีแผนโพสต์ในปฏิทิน") +
      (adsTxt ? "\n\nผลโฆษณาล่าสุดที่ทีมวิเคราะห์ไว้: " + adsTxt : "") +
      "\n\nช่วยเขียน 'บรีฟเช้านี้' ให้ทีมคอนเทนต์: 1) ทักทาย+สรุปยอดเพจสั้นๆ (ถ้ามี) 2) เทรนด์เด่น 2-3 อัน 3) วันนี้ควรโพสต์อะไร (ถ้ามีแผนในปฏิทินให้เตือน+เสริมไอเดีย ถ้าไม่มีให้เสนอ 1-2 ไอเดีย บอกแพลตฟอร์ม+เวลา) 4) ถ้ามีข้อมูลโฆษณา เตือนสั้นๆ ว่าตัวไหนควรไปต่อ/หยุด — กระชับ อ่านจบใน 1 นาที";
    const txt = await generateReply([{ role: "user", content: msg }], await getBrandExtra());
    if (txt) await sb("morning_briefs", { method: "POST", body: JSON.stringify({ txt }) });
    console.log("morning brief ✓");
  } catch (e) { console.error("morning brief x:", e.message); }
}
let lastBriefDay = "";
function bkkNow() { return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" })); }
function dayKey(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
async function briefTick() {
  if (!SB_ON) return;
  const now = bkkNow();
  if (now.getHours() !== 7) return; // ทำเฉพาะช่วง 07:00-07:59
  const today = dayKey(now);
  if (lastBriefDay === today) return;
  lastBriefDay = today;
  try { // กันทำซ้ำหลัง restart: เช็คว่าวันนี้ทำไปแล้วหรือยัง
    const rows = await sb("morning_briefs?select=created_at&order=id.desc&limit=1");
    if (rows[0] && dayKey(new Date(new Date(rows[0].created_at).toLocaleString("en-US", { timeZone: "Asia/Bangkok" }))) === today) return;
  } catch (e) {}
  makeMorningBrief();
}

// ---- ช่องทางระบบเฮีย (x-nong-secret: ASK_SECRET) ----
app.post("/ask", express.json({ limit: "256kb" }), async (req, res) => {
  if (!ASK_SECRET || (req.headers["x-nong-secret"] || "") !== ASK_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const { userId, message } = req.body || {};
  if (!userId || !message) return res.status(400).json({ error: "userId and message required" });

  let history = conversations.get(userId) || [];
  history.push({ role: "user", content: String(message) });
  if (history.length > MAX_TURNS * 2) history = history.slice(-MAX_TURNS * 2);

  let replyText;
  try {
    replyText = await generateReply(history, await getBrandExtra());
  } catch (e) {
    console.error("ask error:", e.message);
    return res.status(200).json({ reply: "" });
  }
  const clean = (replyText || "").replace(/\n{3,}/g, "\n\n").trim();
  if (clean) {
    history.push({ role: "assistant", content: clean });
    conversations.set(userId, history);
  }
  return res.json({ reply: clean });
});

// ============================================================
//  API หน้าเว็บ (ต้องล็อกอิน = ส่ง x-team-pass) — ข้อมูลแชร์กันทั้งทีมผ่าน Supabase
// ============================================================

// ---- ปฏิทินคอนเทนต์ ----
app.get("/api/calendar", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!SB_ON) return res.json({ rows: [], nodb: true });
  try {
    const rows = await sb("calendar?select=id,d,txt&order=d.asc,id.asc");
    res.json({ rows });
  } catch (e) { console.error("calendar get:", e.message); res.status(500).json({ error: "db" }); }
});
app.post("/api/calendar", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!SB_ON) return res.status(503).json({ error: "nodb" });
  const { d, txt } = req.body || {};
  if (!d || !txt) return res.status(400).json({ error: "d and txt required" });
  try {
    const row = await sb("calendar", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ d: String(d), txt: String(txt).slice(0, 500) }) });
    res.json({ row: Array.isArray(row) ? row[0] : row });
  } catch (e) { console.error("calendar post:", e.message); res.status(500).json({ error: "db" }); }
});
app.delete("/api/calendar", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!SB_ON) return res.status(503).json({ error: "nodb" });
  const id = parseInt(req.query.id, 10);
  if (!id) return res.status(400).json({ error: "id required" });
  try { await sb(`calendar?id=eq.${id}`, { method: "DELETE" }); res.json({ ok: true }); }
  catch (e) { console.error("calendar del:", e.message); res.status(500).json({ error: "db" }); }
});

// ---- คลังไอเดีย ----
app.get("/api/ideas", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!SB_ON) return res.json({ rows: [], nodb: true });
  try {
    const rows = await sb("ideas?select=id,txt&order=id.desc");
    res.json({ rows });
  } catch (e) { console.error("ideas get:", e.message); res.status(500).json({ error: "db" }); }
});
app.post("/api/ideas", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!SB_ON) return res.status(503).json({ error: "nodb" });
  const { txt } = req.body || {};
  if (!txt) return res.status(400).json({ error: "txt required" });
  try {
    const row = await sb("ideas", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ txt: String(txt).slice(0, 4000) }) });
    res.json({ row: Array.isArray(row) ? row[0] : row });
  } catch (e) { console.error("ideas post:", e.message); res.status(500).json({ error: "db" }); }
});
app.delete("/api/ideas", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!SB_ON) return res.status(503).json({ error: "nodb" });
  const id = parseInt(req.query.id, 10);
  if (!id) return res.status(400).json({ error: "id required" });
  try { await sb(`ideas?id=eq.${id}`, { method: "DELETE" }); res.json({ ok: true }); }
  catch (e) { console.error("ideas del:", e.message); res.status(500).json({ error: "db" }); }
});

// ---- เจนรูป AI (ฟรี ผ่าน Pollinations) — น้องแปลงคำขอไทยเป็น prompt ภาพก่อน ----
app.post("/api/image", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: "message required" });
  let prompt;
  try { prompt = await imagePrompt(message); }
  catch (e) { console.error("imagePrompt:", e.message); prompt = String(message); }
  const seed = Math.floor(Math.random() * 1e6);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${seed}`;
  res.json({ url, prompt });
});

// ---- แก้รูปจริงตามคำสั่ง (OpenAI gpt-image-1) — อัปรูปจริง แล้วสั่งแก้ ----
app.post("/api/edit-image", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!OPENAI_KEY) return res.status(503).json({ error: "ยังไม่ได้ตั้งค่า OpenAI (แก้รูปจริงยังใช้ไม่ได้)" });
  const { image, message } = req.body || {};
  if (!image || !message) return res.status(400).json({ error: "image and message required" });
  const m = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(image);
  if (!m) return res.status(400).json({ error: "รูปไม่ถูกต้อง" });
  try {
    const mime = m[1], buf = Buffer.from(m[2], "base64"), ext = (mime.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "");
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("image", new Blob([buf], { type: mime }), `photo.${ext}`);
    form.append("prompt", String(message).slice(0, 1000));
    form.append("size", "1024x1024");
    const r = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: form,
    });
    const j = await r.json();
    if (!r.ok) {
      console.error("openai edit:", r.status, JSON.stringify(j).slice(0, 300));
      return res.status(502).json({ error: (j.error && j.error.message) || "แก้รูปไม่สำเร็จ" });
    }
    const b64 = j.data && j.data[0] && j.data[0].b64_json;
    if (!b64) return res.status(502).json({ error: "ไม่ได้รูปกลับมา" });
    res.json({ url: `data:image/png;base64,${b64}` });
  } catch (e) { console.error("edit-image:", e.message); res.status(500).json({ error: "ระบบขัดข้อง" }); }
});

// ============================================================
//  สตูดิโอ 🎬 — กล่องรับงานตัดต่อ (อัปไฟล์ + ส่งบรีฟ · น้องตัดให้)
// ============================================================

// ขอ URL อัปโหลดไฟล์ตรงเข้า Supabase Storage (bucket: studio)
app.post("/api/studio/upload-url", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!SB_ON) return res.status(503).json({ error: "nodb" });
  const safe = String((req.body || {}).filename || "file").replace(/[^\w.\-]/g, "_").slice(-80);
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/studio/${key}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "content-type": "application/json" },
      body: "{}",
    });
    const j = await r.json();
    if (!r.ok || !j.url) { console.error("sign upload:", r.status, JSON.stringify(j).slice(0, 200)); return res.status(502).json({ error: "sign failed" }); }
    res.json({
      uploadUrl: `${SUPABASE_URL}/storage/v1${j.url}`,
      publicUrl: `${SUPABASE_URL}/storage/v1/object/public/studio/${key}`,
      path: key,
    });
  } catch (e) { console.error("upload-url:", e.message); res.status(500).json({ error: "server" }); }
});

// รายการงาน (แชร์ทั้งทีม)
app.get("/api/studio", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!SB_ON) return res.json({ rows: [], nodb: true });
  try {
    const rows = await sb("studio_jobs?select=id,brief,format,feel,font,files,status,result_url&order=id.desc&limit=50");
    res.json({ rows });
  } catch (e) { console.error("studio get:", e.message); res.status(500).json({ error: "db" }); }
});

// ส่งงานใหม่
app.post("/api/studio", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!SB_ON) return res.status(503).json({ error: "nodb" });
  const { brief, format, feel, font, files } = req.body || {};
  if (!brief) return res.status(400).json({ error: "brief required" });
  const row = {
    brief: String(brief).slice(0, 2000),
    format: format ? String(format).slice(0, 40) : null,
    feel: feel ? String(feel).slice(0, 40) : null,
    font: font ? String(font).slice(0, 40) : null,
    files: Array.isArray(files) ? files.slice(0, 20) : [],
    status: "queued",
  };
  try {
    const r = await sb("studio_jobs", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
    res.json({ row: Array.isArray(r) ? r[0] : r });
  } catch (e) { console.error("studio post:", e.message); res.status(500).json({ error: "db" }); }
});
app.delete("/api/studio", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!SB_ON) return res.status(503).json({ error: "nodb" });
  const id = parseInt(req.query.id, 10);
  if (!id) return res.status(400).json({ error: "id required" });
  try { await sb(`studio_jobs?id=eq.${id}`, { method: "DELETE" }); res.json({ ok: true }); }
  catch (e) { console.error("studio delete:", e.message); res.status(500).json({ error: "db" }); }
});

// ---- เทรนด์สดจากเว็บ (แคช 6 ชม. กันเปลืองค่าค้นเว็บ) ----
let trendsCache = { at: 0, items: [] };
app.get("/api/trends-live", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  const AGE = Date.now() - trendsCache.at;
  if (trendsCache.items.length && AGE < 24 * 60 * 60 * 1000) { // ค้นใหม่วันละครั้งพอ (ประหยัดงบ)
    return res.json({ items: trendsCache.items, cachedMinutes: Math.round(AGE / 60000) });
  }
  try {
    const items = await fetchLiveTrends();
    if (items.length) trendsCache = { at: Date.now(), items };
    res.json({ items, cachedMinutes: 0 });
  } catch (e) {
    console.error("trends-live:", e.message);
    if (trendsCache.items.length) return res.json({ items: trendsCache.items, cachedMinutes: Math.round(AGE / 60000), stale: true });
    res.status(500).json({ error: "ดึงเทรนด์ไม่สำเร็จ ลองใหม่ค่ะ" });
  }
});

// ---- แปะรูปในแชทแล้วถามน้อง (เทรนด์/รูปอะไรก็ได้) ----
app.post("/api/vision", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  const { image, message } = req.body || {};
  if (!image) return res.status(400).json({ error: "image required" });
  try {
    const reply = await visionChat(image, message);
    res.json({ reply });
  } catch (e) { console.error("vision:", e.message); res.status(500).json({ error: "ดูรูปไม่สำเร็จ ลองใหม่ค่ะ" }); }
});

// ---- ให้น้องคิดโจทย์/คำ ให้งานสตูดิโอ ----
app.post("/api/suggest", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  const { format, feel, hint } = req.body || {};
  const msg =
    `ช่วยคิดให้หน่อยสำหรับคลิป ${format || "รีล 9:16"} ฟีล ${feel || "หรูสงบ"}` +
    (hint ? ` ต่อยอดจากไอเดียนี้: "${String(hint).slice(0, 500)}"` : " (เลือกหัวข้อที่เหมาะกับช่วงนี้ให้เลย)") +
    " — ขอสั้นกระชับ: 1) โจทย์คลิป 1 ประโยค 2) ข้อความขึ้นบนคลิป 2-3 ท่อน 3) แคปชันโพสต์ 4) แฮชแท็ก";
  try {
    const text = await generateReply([{ role: "user", content: msg }], await getBrandExtra());
    res.json({ text });
  } catch (e) { console.error("suggest:", e.message); res.status(500).json({ error: "คิดไม่สำเร็จ ลองใหม่ค่ะ" }); }
});

// ---- เก็บยอดผู้ติดตามรายวันอัตโนมัติ (แดชบอร์ดการโต) ----
let lastSnapDay = "";
async function followerSnapshotTick() {
  if (!FB_ON || !SB_ON) return;
  const today = dayKey(bkkNow());
  if (lastSnapDay === today) return;
  lastSnapDay = today;
  try {
    const rows = await sb(`fb_daily?select=d&d=eq.${today}&limit=1`);
    if (rows && rows.length) return; // วันนี้เก็บแล้ว
    const s = await fetchPageStats();
    if (s) await sb("fb_daily", { method: "POST", body: JSON.stringify({ d: today, followers: s.followers }) });
    console.log("fb snapshot ✓", today);
  } catch (e) { console.error("fb snapshot x:", e.message); }
}
app.get("/api/fb-growth", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!FB_ON || !SB_ON) return res.json({ off: true });
  try {
    const rows = await sb("fb_daily?select=d,followers&order=d.asc&limit=90");
    res.json({ rows: rows || [] });
  } catch (e) { res.json({ rows: [] }); }
});

// ---- ตั้งเวลาโพสต์ / โพสต์ขึ้นเพจ FB (ทีมเขียน+ยืนยันเอง) ----
app.get("/api/posts", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!SB_ON) return res.json({ rows: [] });
  try { res.json({ rows: await sb("scheduled_posts?select=*&order=id.desc&limit=50") }); }
  catch (e) { res.json({ rows: [] }); }
});
app.post("/api/post", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  const { message, imageUrl, when, targets } = req.body || {};
  const tg = (Array.isArray(targets) && targets.length ? targets : ["fb"]).filter((t) => t === "fb" || t === "ig");
  if (!tg.length) return res.status(400).json({ error: "เลือกช่องทางอย่างน้อย 1 (FB/IG)" });
  if (!message && !imageUrl) return res.status(400).json({ error: "ต้องมีข้อความหรือรูป" });
  if (tg.includes("ig") && !imageUrl) return res.status(400).json({ error: "Instagram ต้องมีรูป — แนบรูปก่อนค่ะ" });
  if (tg.includes("fb") && !FB_ON) return res.status(503).json({ error: "ยังไม่ได้เชื่อม Facebook" });

  // ตั้งเวลา → เก็บ pending (รวม target ที่เลือก)
  if (when && when !== "now") {
    if (!SB_ON) return res.status(503).json({ error: "ตั้งเวลาต้องมีฐานข้อมูล" });
    const base = { message: message || "", image_url: imageUrl || null, scheduled_at: when, status: "pending" };
    try {
      let row;
      try { row = await sb("scheduled_posts", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...base, target: tg.join(",") }) }); }
      catch (e) { row = await sb("scheduled_posts", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(base) }); } // เผื่อคอลัมน์ target ยังไม่มี
      return res.json({ scheduled: true, row: Array.isArray(row) ? row[0] : row });
    } catch (e) { console.error("schedule:", e.message); return res.status(500).json({ error: "ตั้งเวลาไม่สำเร็จ" }); }
  }

  // โพสต์เลย → ทุกช่องทางที่เลือก
  const results = [];
  for (const t of tg) {
    try {
      if (t === "fb") { const r = await fbPublish(message, imageUrl); results.push({ target: "fb", ok: true, url: r.url }); }
      else if (t === "ig") { const tok = await igToken(); if (!tok) throw new Error("ยังไม่ได้เชื่อม Instagram"); const r = await igPublish(tok, message, imageUrl); results.push({ target: "ig", ok: true, url: r.url }); }
    } catch (e) { console.error("post " + t + ":", e.message); results.push({ target: t, ok: false, error: e.message }); }
  }
  fbCache.at = 0;
  if (SB_ON) {
    const okOne = results.find((r) => r.ok);
    sb("scheduled_posts", { method: "POST", body: JSON.stringify({ message: message || "", image_url: imageUrl || null, scheduled_at: new Date().toISOString(), status: results.some((r) => r.ok) ? "posted" : "failed", result_url: okOne ? okOne.url : String((results[0] && results[0].error) || "").slice(0, 120) }) }).catch(() => {});
  }
  const anyOk = results.some((r) => r.ok);
  res.status(anyOk ? 200 : 502).json({ posted: anyOk, results });
});
// ---- เขียนแคปชั่น 4 แพลตฟอร์มจากไอเดียเดียว (FB/IG/TikTok/สตอรี่) ----
app.post("/api/captions", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  const idea = String((req.body || {}).idea || "").trim();
  if (!idea) return res.status(400).json({ error: "เขียนไอเดียก่อนค่ะ" });
  const msg = `เขียนแคปชั่นจากไอเดียนี้: "${idea}"\nให้ 4 เวอร์ชันสำหรับ 4 แพลตฟอร์ม เรื่องเดียวกันแต่คนละสไตล์\n- fb: อบอุ่นเล่าเรื่อง อีโมจิพอดี ปิดท้ายชวนจองผ่าน LINE\n- ig: กระชับสวย + วางแฮชแท็ก 5-8 อันบรรทัดท้าย\n- tiktok: ฮุคแรง 3 วิแรก ภาษาวัยรุ่น สั้น\n- story: สั้นมาก 1-2 บรรทัด ชวนกดลิงก์/ทัก\n\nรูปแบบคำตอบ (ทำตามเป๊ะ ห้ามมีอย่างอื่นนำหน้า/ต่อท้าย ขึ้นบรรทัดในแคปชั่นได้ตามปกติ):\n[FB]\n(แคปชั่น Facebook)\n[IG]\n(แคปชั่น Instagram)\n[TIKTOK]\n(แคปชั่น TikTok)\n[STORY]\n(แคปชั่น Story)\n\nถ้าต้องปรับคำตามกฎแบรนด์ (เช่น ไม่ประกาศส่วนลด) ให้ปรับในแคปชั่นเลยเงียบๆ ไม่ต้องอธิบายนอกบล็อก.`;
  try {
    const text = await generateReply([{ role: "user", content: msg }], await getBrandExtra());
    const caps = parseCapBlocks(text);
    return caps ? res.json({ caps }) : res.json({ raw: text });
  } catch (e) { console.error("captions:", e.message); res.status(500).json({ error: "เขียนไม่สำเร็จ ลองใหม่ค่ะ" }); }
});
app.delete("/api/posts", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!SB_ON) return res.status(503).json({ error: "nodb" });
  const id = parseInt(req.query.id, 10);
  if (!id) return res.status(400).json({ error: "id required" });
  try { await sb(`scheduled_posts?id=eq.${id}`, { method: "DELETE" }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: "db" }); }
});
// ตัวโพสต์อัตโนมัติ: เช็คโพสต์ที่ถึงเวลาแล้ว → โพสต์ให้
async function scheduledPostTick() {
  if (!SB_ON) return;
  try {
    const due = await sb(`scheduled_posts?select=*&status=eq.pending&scheduled_at=lte.${new Date().toISOString()}&order=scheduled_at.asc&limit=3`);
    for (const p of due || []) {
      const tg = String(p.target || "fb").split(",").map((s) => s.trim()).filter(Boolean);
      const results = [];
      for (const t of tg) {
        try {
          if (t === "fb") { if (!FB_ON) throw new Error("ยังไม่ได้เชื่อม Facebook"); const r = await fbPublish(p.message, p.image_url); results.push({ ok: true, url: r.url }); }
          else if (t === "ig") { const tok = await igToken(); if (!tok) throw new Error("ยังไม่ได้เชื่อม Instagram"); const r = await igPublish(tok, p.message, p.image_url); results.push({ ok: true, url: r.url }); }
        } catch (e) { results.push({ ok: false, error: e.message }); }
      }
      const okOne = results.find((r) => r.ok);
      const anyOk = results.some((r) => r.ok);
      await sb(`scheduled_posts?id=eq.${p.id}`, { method: "PATCH", body: JSON.stringify({ status: anyOk ? "posted" : "failed", result_url: okOne ? okOne.url : String((results[0] && results[0].error) || "").slice(0, 120) }) });
      console.log("scheduled post " + (anyOk ? "✓" : "x"), p.id, tg.join(","));
    }
  } catch (e) { console.error("scheduledPostTick:", e.message); }
}

// ---- ยอดเพจ Facebook จริง (สำหรับหน้าวิเคราะห์โพสต์) ----
let fbCache = { at: 0, data: null };
app.get("/api/fb-stats", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!FB_ON) return res.json({ off: true });
  try {
    if (Date.now() - fbCache.at < 30 * 60 * 1000 && fbCache.data) return res.json(fbCache.data);
    const data = await fetchPageStats();
    try { data.insight = await pageInsightBrief(data); } catch (e) { data.insight = ""; }
    fbCache = { at: Date.now(), data };
    res.json(data);
  } catch (e) { console.error("fb-stats:", e.message); res.status(502).json({ error: e.message }); }
});

// ============================================================
//  Instagram — เชื่อมตรง (Instagram Login API) + สถิติ IG จริง
// ============================================================
// สถานะ: ตั้งค่าแล้วยัง / เชื่อมบัญชีแล้วยัง
app.get("/api/ig/status", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!IG_CONFIGURED) return res.json({ configured: false });
  if (!SB_ON) return res.json({ configured: true, connected: false });
  try {
    const rows = await sb("ig_account?select=username,ig_user_id,expires_at&order=id.desc&limit=1");
    if (rows && rows.length) return res.json({ configured: true, connected: true, username: rows[0].username });
    res.json({ configured: true, connected: false });
  } catch (e) { res.json({ configured: true, connected: false }); }
});

// เริ่มเชื่อม (เปิดในเบราว์เซอร์ — ส่งรหัสทีมมาใน ?k=) → พาไปหน้าอนุญาตของ IG
app.get("/api/ig/connect", (req, res) => {
  if (!IG_CONFIGURED) return res.status(503).send("ยังไม่ได้ตั้งค่า Instagram (IG_APP_ID/IG_APP_SECRET)");
  if (!TEAM_PASSWORD || (req.query.k || "") !== TEAM_PASSWORD) return res.status(401).send("unauthorized");
  res.redirect(igAuthUrl(TEAM_PASSWORD));
});

// ปลายทางหลังผู้ใช้กด Allow ใน IG → แลก token → เก็บลง DB
app.get("/api/ig/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error || !code) return res.redirect("/?ig=error");
  if (!TEAM_PASSWORD || state !== TEAM_PASSWORD) return res.status(401).send("bad state");
  try {
    const short = await igExchangeCode(String(code));
    const long = await igLongLived(short.access_token);
    const prof = await igProfile(long.access_token);
    const expISO = new Date(Date.now() + (long.expires_in || 5184000) * 1000).toISOString();
    if (SB_ON) {
      await sb("ig_account?id=gte.0", { method: "DELETE" }).catch(() => {}); // เก็บบัญชีเดียว
      await sb("ig_account", { method: "POST", body: JSON.stringify({
        ig_user_id: String(prof.user_id || short.user_id || ""),
        username: prof.username || "",
        access_token: long.access_token,
        expires_at: expISO,
      }) });
    }
    res.redirect("/?ig=connected");
  } catch (e) { console.error("ig callback:", e.message); res.redirect("/?ig=error"); }
});

// สถิติ IG จริง (ต้องเชื่อมแล้ว)
app.get("/api/ig/stats", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!IG_CONFIGURED || !SB_ON) return res.json({ off: true });
  try {
    const rows = await sb("ig_account?select=access_token,username&order=id.desc&limit=1");
    if (!rows || !rows.length) return res.json({ connected: false });
    const prof = await igProfile(rows[0].access_token);
    let posts = [];
    try { posts = await igTopMedia(rows[0].access_token, 5); } catch (e) { console.error("ig top:", e.message); }
    res.json({ connected: true, ...prof, posts });
  } catch (e) { console.error("ig stats:", e.message); res.status(502).json({ error: e.message }); }
});

// ตัดการเชื่อม IG
app.delete("/api/ig/disconnect", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!SB_ON) return res.status(503).json({ error: "nodb" });
  try { await sb("ig_account?id=gte.0", { method: "DELETE" }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: "db" }); }
});
// คอมเมนต์ IG ล่าสุด (สำหรับตัวช่วยตอบคอมเมนต์)
app.get("/api/ig/comments", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  if (!IG_CONFIGURED || !SB_ON) return res.json({ off: true });
  const tok = await igToken();
  if (!tok) return res.json({ connected: false });
  try { const comments = await igRecentComments(tok, 20); res.json({ connected: true, comments }); }
  catch (e) { console.error("ig comments:", e.message); res.status(502).json({ error: e.message }); }
});
// ร่างคำตอบคอมเมนต์ด้วยน้อง (Claude)
app.post("/api/ig/comment-draft", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  const { text, postCaption } = req.body || {};
  if (!text) return res.status(400).json({ error: "ไม่มีข้อความคอมเมนต์" });
  const msg = `ลูกค้าคอมเมนต์ใต้โพสต์ Instagram ของรีสอร์ท: "${String(text).slice(0, 300)}"` +
    (postCaption ? `\n(โพสต์เกี่ยวกับ: "${String(postCaption).slice(0, 100)}")` : "") +
    `\nช่วยร่างคำตอบสั้นๆ สุภาพเป็นกันเองแบบแอดมินรีสอร์ทตอบลูกค้า — ถ้าถามราคา/ห้องว่าง/วันว่าง ให้ชวนทัก LINE @villadeleaf เพื่อเช็กให้ · ตอบแค่ 1-2 ประโยค ไม่ต้องมี markdown ลงท้ายด้วย ค่ะ/คะ ตอบมาเฉพาะข้อความที่จะตอบเลย ไม่ต้องอธิบายอย่างอื่น`;
  try { const reply = await generateReply([{ role: "user", content: msg }], await getBrandExtra()); res.json({ draft: String(reply).trim() }); }
  catch (e) { console.error("comment-draft:", e.message); res.status(500).json({ error: "ร่างไม่สำเร็จ ลองใหม่ค่ะ" }); }
});
// ส่งคำตอบคอมเมนต์จริงบน IG
app.post("/api/ig/comment-reply", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  const { commentId, message } = req.body || {};
  if (!commentId || !message) return res.status(400).json({ error: "ต้องมีคอมเมนต์และข้อความ" });
  const tok = await igToken();
  if (!tok) return res.status(503).json({ error: "ยังไม่ได้เชื่อม Instagram" });
  try { const r = await igReplyComment(tok, commentId, message); res.json({ ok: true, id: r.id }); }
  catch (e) { console.error("ig reply:", e.message); res.status(502).json({ error: e.message }); }
});

// ---- สมองเรียนรู้จากเพจ: อ่านผลจริง FB+IG → สรุปบทเรียนไว้ใช้เขียนคอนเทนต์ ----
async function computeLearnings() {
  const bits = [];
  try {
    const fb = await fetchPageStats();
    if (fb && fb.posts && fb.posts.length) {
      const top = fb.posts.slice().sort((a, b) => (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares)).slice(0, 6);
      bits.push(`เพจ Facebook "${fb.name}" (ผู้ติดตาม ${fb.followers}) — โพสต์เรียงตามเอนเกจ:\n` +
        top.map((p) => `• "${p.msg}" — ❤️${p.likes} 💬${p.comments} 🔁${p.shares} (${p.when})`).join("\n"));
    }
  } catch (e) { console.error("learnings fb:", e.message); }
  try {
    const tok = await igToken();
    if (tok) {
      const media = await igTopMedia(tok, 6);
      if (media.length) bits.push(`Instagram — โพสต์เรียงตามเอนเกจ:\n` +
        media.map((m) => `• "${m.caption}" [${m.type}] — ❤️${m.likes} 💬${m.comments} (${m.when})`).join("\n"));
    }
  } catch (e) { console.error("learnings ig:", e.message); }
  if (!bits.length) return null;
  const prompt = `นี่คือผลจริงของโพสต์บนโซเชียลของรีสอร์ท Villa de Leaf:\n\n${bits.join("\n\n")}\n\nช่วยสรุปเป็น "บทเรียน" 4-6 ข้อสั้นๆ ที่เอาไปใช้เขียนคอนเทนต์ครั้งต่อไปได้จริง — วิเคราะห์ว่าธีม/มุมภาพ/โทน/ความยาว/เวลาโพสต์/CTA แบบไหนที่คนของเราตอบรับดี และแบบไหนที่ยังไม่เวิร์ค. เขียนเป็นข้อๆ actionable ขึ้นต้นแต่ละข้อด้วย • ไม่ต้องมี markdown ไม่ต้องเกริ่นนำ`;
  const txt = String(await generateReply([{ role: "user", content: prompt }])).trim();
  if (SB_ON && txt) {
    try {
      await sb("page_learnings?id=gte.0", { method: "DELETE" }).catch(() => {}); // เก็บอันล่าสุดอันเดียว
      await sb("page_learnings", { method: "POST", body: JSON.stringify({ txt }) });
    } catch (e) { console.error("save learnings:", e.message); }
  }
  learnCache = { at: Date.now(), txt };
  return txt;
}
app.get("/api/learnings", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  try { res.json({ txt: await getLearnings() }); } catch (e) { res.json({ txt: "" }); }
});
app.post("/api/learnings/refresh", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  try { const txt = await computeLearnings(); res.json(txt ? { txt } : { error: "ยังไม่มีข้อมูลโพสต์พอให้เรียนรู้ค่ะ" }); }
  catch (e) { console.error("learnings refresh:", e.message); res.status(500).json({ error: "อัปเดตไม่สำเร็จ ลองใหม่ค่ะ" }); }
});
// เรียนรู้อัตโนมัติวันละครั้ง (ใน keep-alive)
let lastLearnDay = "";
async function learningsTick() {
  if (!SB_ON) return;
  const today = dayKey(bkkNow());
  if (lastLearnDay === today) return;
  lastLearnDay = today;
  try { await computeLearnings(); console.log("learnings updated ✓", today); }
  catch (e) { console.error("learningsTick:", e.message); }
}

// ต่ออายุ token IG อัตโนมัติ (เหลือ < 10 วันค่อยต่อ) — เรียกจาก keep-alive
let lastIgRefreshDay = "";
async function igRefreshTick() {
  if (!IG_CONFIGURED || !SB_ON) return;
  const today = dayKey(bkkNow());
  if (lastIgRefreshDay === today) return;
  lastIgRefreshDay = today;
  try {
    const rows = await sb("ig_account?select=id,access_token,expires_at&order=id.desc&limit=1");
    if (!rows || !rows.length) return;
    const r0 = rows[0];
    const daysLeft = (new Date(r0.expires_at).getTime() - Date.now()) / 864e5;
    if (daysLeft > 10) return; // ยังไม่ถึงเวลาต่อ
    const long = await igRefresh(r0.access_token);
    const expISO = new Date(Date.now() + (long.expires_in || 5184000) * 1000).toISOString();
    await sb(`ig_account?id=eq.${r0.id}`, { method: "PATCH", body: JSON.stringify({ access_token: long.access_token, expires_at: expISO }) });
    console.log("ig token refreshed ✓", expISO.slice(0, 10));
  } catch (e) { console.error("igRefreshTick:", e.message); }
}

// ---- คลังคลิปเสร็จ (งานสตูดิโอที่ done + มีไฟล์ผลลัพธ์) ----
app.get("/api/clips", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  try {
    if (!SB_ON) return res.json({ rows: [] });
    const rows = await sb("studio_jobs?select=id,brief,format,feel,result_url,created_at&status=eq.done&result_url=not.is.null&order=id.desc&limit=100");
    res.json({ rows });
  } catch (e) { console.error("clips:", e.message); res.json({ rows: [] }); }
});

// ---- แดชบอร์ดโฆษณา: แกะรูปเป็นข้อมูล + จำล่าสุดไว้ให้ทีม ----
app.post("/api/ads-analyze", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  const { image, note } = req.body || {};
  if (!image) return res.status(400).json({ error: "image required" });
  try {
    const data = await analyzeAdsData(image, note);
    if (SB_ON) sb("ads_snapshots", { method: "POST", body: JSON.stringify({ data }) }).catch((e) => console.error("ads save:", e.message));
    res.json({ data });
  } catch (e) { console.error("ads-analyze:", e.message); res.status(500).json({ error: "แกะข้อมูลไม่สำเร็จ ลองแคปให้ชัดขึ้นหรือลองใหม่ค่ะ" }); }
});
app.get("/api/ads-latest", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  try {
    if (!SB_ON) return res.json({});
    const rows = await sb("ads_snapshots?select=data,created_at&order=id.desc&limit=1");
    res.json(rows[0] || {});
  } catch (e) { res.json({}); }
});

// ---- วิเคราะห์โพสต์จากรูป Insights (Claude vision) ----
app.post("/api/analyze", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  const { image, note, kind } = req.body || {};
  if (!image) return res.status(400).json({ error: "image required" });
  try {
    const text = await analyzeImage(image, note, kind);
    res.json({ text });
  } catch (e) { console.error("analyze:", e.message); res.status(500).json({ error: "วิเคราะห์ไม่สำเร็จ ลองใหม่ค่ะ" }); }
});

app.listen(PORT, () => {
  console.log(`น้องครีเอทีฟ 🎨 (${MODEL}) รันอยู่ที่พอร์ต ${PORT} · DB:${SB_ON ? "on" : "off"} · แก้รูป:${OPENAI_KEY ? "on" : "off"}`);
});

// ---- กันเว็บหลับ: ปลุกตัวเองทุก 10 นาที (free tier หลับหลังไม่มีคนใช้ 15 นาที) ----
// Render ใส่ RENDER_EXTERNAL_URL ให้อัตโนมัติ (เช่น https://creative-bot-jj1f.onrender.com)
const SELF_URL = (process.env.RENDER_EXTERNAL_URL || "").trim();
if (SELF_URL) {
  const KEEPALIVE_MS = 10 * 60 * 1000; // 10 นาที
  setInterval(() => {
    fetch(`${SELF_URL}/health`)
      .then(() => console.log("keep-alive ✓"))
      .catch((e) => console.log("keep-alive x:", e.message));
    // ปลุก Supabase ด้วย (โปรเจกต์ฟรีพักเครื่องถ้าไม่มีใครแตะ ~1 สัปดาห์)
    if (SB_ON) {
      sb("calendar?select=id&limit=1")
        .then(() => console.log("db-alive ✓"))
        .catch((e) => console.log("db-alive x:", e.message));
    }
    briefTick(); // Always-On: บรีฟเช้าอัตโนมัติช่วง 07:00
    followerSnapshotTick(); // เก็บยอดผู้ติดตามรายวันอัตโนมัติ
    scheduledPostTick(); // โพสต์ที่ตั้งเวลาไว้ให้อัตโนมัติเมื่อถึงเวลา
    igRefreshTick(); // ต่ออายุ token IG อัตโนมัติก่อนหมดอายุ
    learningsTick(); // สมองเรียนรู้จากผลจริงของเพจ วันละครั้ง
  }, KEEPALIVE_MS);
  console.log(`keep-alive เปิดใช้งาน: ปลุกทุก 10 นาที (${SELF_URL})`);
}

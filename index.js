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
const { generateReply, imagePrompt, analyzeImage, analyzeAdsData, visionChat, fetchLiveTrends, fetchPageStats, pageInsightBrief, FB_ON, MODEL } = require("./brain");

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
async function getBrandExtra() {
  if (!SB_ON) return "";
  if (Date.now() - brandCache.at < 60 * 1000) return brandCache.txt;
  try {
    const rows = await sb("brand_notes?select=txt&order=id.desc&limit=30");
    brandCache = { at: Date.now(), txt: rows.map((r) => "• " + r.txt).join("\n") };
  } catch (e) { /* ตารางยังไม่ถูกสร้าง — ข้ามเงียบๆ */ }
  return brandCache.txt;
}

// ---- ตรวจรหัสทีม (ใช้กับทุก endpoint ของหน้าเว็บ) ----
function teamOK(req) {
  return TEAM_PASSWORD && (req.headers["x-team-pass"] || "") === TEAM_PASSWORD;
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
  }, KEEPALIVE_MS);
  console.log(`keep-alive เปิดใช้งาน: ปลุกทุก 10 นาที (${SELF_URL})`);
}

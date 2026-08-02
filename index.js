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
const { generateReply, imagePrompt, analyzeImage, visionChat, MODEL } = require("./brain");

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

// ---- แชทจริงจากหน้าเว็บ (ต้องล็อกอิน = ส่งรหัสทีมมาใน header) ----
app.post("/chat", express.json({ limit: "256kb" }), async (req, res) => {
  if (!TEAM_PASSWORD || (req.headers["x-team-pass"] || "") !== TEAM_PASSWORD) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const { userId, message } = req.body || {};
  if (!userId || !message) return res.status(400).json({ error: "userId and message required" });

  let history = conversations.get(userId) || [];
  history.push({ role: "user", content: String(message) });
  if (history.length > MAX_TURNS * 2) history = history.slice(-MAX_TURNS * 2);

  let replyText;
  try {
    replyText = await generateReply(history);
  } catch (e) {
    console.error("chat error:", e.message);
    return res.status(200).json({ reply: "ระบบขัดข้องชั่วคราวค่ะ 🙏 ลองอีกครั้งนะคะ" });
  }
  const clean = (replyText || "").replace(/\n{3,}/g, "\n\n").trim();
  if (clean) {
    history.push({ role: "assistant", content: clean });
    conversations.set(userId, history);
  }
  return res.json({ reply: clean || "ขอโทษค่ะ ตอบไม่ได้ตอนนี้ ลองใหม่นะคะ" });
});

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
    replyText = await generateReply(history);
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
    const text = await generateReply([{ role: "user", content: msg }]);
    res.json({ text });
  } catch (e) { console.error("suggest:", e.message); res.status(500).json({ error: "คิดไม่สำเร็จ ลองใหม่ค่ะ" }); }
});

// ---- วิเคราะห์โพสต์จากรูป Insights (Claude vision) ----
app.post("/api/analyze", async (req, res) => {
  if (!teamOK(req)) return res.status(401).json({ error: "unauthorized" });
  const { image, note } = req.body || {};
  if (!image) return res.status(400).json({ error: "image required" });
  try {
    const text = await analyzeImage(image, note);
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
  }, KEEPALIVE_MS);
  console.log(`keep-alive เปิดใช้งาน: ปลุกทุก 10 นาที (${SELF_URL})`);
}

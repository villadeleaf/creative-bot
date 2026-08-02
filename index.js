// ============================================================
//  น้องครีเอทีฟ 🎨 — เซิร์ฟเวอร์บอท (แยกคนละตัวกับน้องลีฟโดยสิ้นเชิง)
//  ช่องทาง:
//   - GET  /          หน้าเว็บ (public/index.html) — ทีมล็อกอินเข้าใช้
//   - POST /login     ตรวจรหัสทีม (TEAM_PASSWORD)
//   - POST /chat      แชทจริงจากหน้าเว็บ (ต้องล็อกอินก่อน)
//   - POST /ask       สำหรับระบบเฮีย (x-nong-secret: ASK_SECRET)
//   - GET  /selftest  เช็คระบบ
// ============================================================

const express = require("express");
const path = require("path");
const { generateReply, MODEL } = require("./brain");

const app = express();
const PORT = process.env.PORT || 3100;
const ASK_SECRET = (process.env.ASK_SECRET || "").trim();
const TEAM_PASSWORD = (process.env.TEAM_PASSWORD || "").trim(); // รหัสให้ทีมล็อกอินหน้าเว็บ
const MAX_TURNS = 20;

const conversations = new Map();

// ---- เสิร์ฟหน้าเว็บ (public/) ----
app.use(express.static(path.join(__dirname, "public")));

// ---- เช็คสุขภาพ (ไม่เรียก AI) ----
app.get("/health", (_req, res) => res.send("น้องครีเอทีฟ 🎨 พร้อมทำงานค่ะ"));

app.get("/selftest", (req, res) => {
  if (!ASK_SECRET || (req.query.key || "") !== ASK_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const rawKey = process.env.ANTHROPIC_API_KEY || "";
  res.json({
    version: "v3-keepalive",
    model: MODEL,
    keyRawLen: rawKey.length,
    keyCleanLen: rawKey.replace(/[^A-Za-z0-9_-]/g, "").length,
    teamLogin: TEAM_PASSWORD ? "on" : "off",
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

app.listen(PORT, () => {
  console.log(`น้องครีเอทีฟ 🎨 (${MODEL}) รันอยู่ที่พอร์ต ${PORT}`);
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

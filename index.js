// ============================================================
//  น้องครีเอทีฟ 🎨 — เซิร์ฟเวอร์บอท (แยกคนละตัวกับน้องลีฟโดยสิ้นเชิง)
//  ช่องทางคุย: POST /ask (สำหรับระบบเฮีย/หน้าเว็บ — สูตรเดียวกับน้องลีฟ)
//  ยังไม่ต่อ LINE (เพิ่มทีหลังได้ ถ้าอยากทักจากมือถือ)
// ============================================================

const express = require("express");
const { generateReply, MODEL } = require("./brain");

const app = express();
const PORT = process.env.PORT || 3100;
const ASK_SECRET = (process.env.ASK_SECRET || "").trim();
const MAX_TURNS = 20; // จำบทสนทนาล่าสุดกี่รอบ ต่อผู้ใช้ 1 คน

// ความจำบทสนทนา (ในหน่วยความจำ — หายเมื่อรีสตาร์ท ยอมรับได้เหมือนน้องลีฟ)
const conversations = new Map();

// ---- หน้าเช็คสุขภาพ ----
app.get("/", (_req, res) => {
  res.send("น้องครีเอทีฟ 🎨 พร้อมทำงานค่ะ");
});

// ---- เช็คระบบ (ต้องมี key ถูกต้อง · ไม่เรียก AI = ไม่มีค่าใช้จ่าย) ----
app.get("/selftest", (req, res) => {
  if (!ASK_SECRET || (req.query.key || "") !== ASK_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const rawKey = process.env.ANTHROPIC_API_KEY || "";
  res.json({
    version: "v1-creative",
    model: MODEL,
    keyRawLen: rawKey.length,
    keyCleanLen: rawKey.replace(/[^A-Za-z0-9_-]/g, "").length,
    conversations: conversations.size,
  });
});

// ---- ช่องทางหลัก: ระบบเฮีย (หรือหน้าเว็บไหนก็ได้) ยิงมาคุยกับน้องครีเอทีฟ ----
//  ส่ง: { userId, message, name? } + header x-nong-secret: <ASK_SECRET>
//  ได้กลับ: { reply }  (reply = "" แปลว่า AI ขัดข้อง ให้ฝั่งโน้นแจ้งผู้ใช้เอง)
app.post("/ask", express.json({ limit: "256kb" }), async (req, res) => {
  if (!ASK_SECRET || (req.headers["x-nong-secret"] || "") !== ASK_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const { userId, message } = req.body || {};
  if (!userId || !message) {
    return res.status(400).json({ error: "userId and message required" });
  }

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

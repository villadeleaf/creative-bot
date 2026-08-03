// ============================================================
//  สมองของ "น้องครีเอทีฟ" 🎨 — โหลดความรู้ + บุคลิก + เรียก Claude
//  ใช้ร่วมกันทั้ง "บอทจริง" (index.js) และ "ห้องทดสอบ" (test-chat.js)
//  แก้บุคลิกที่นี่ที่เดียว มีผลทั้งคู่
//  *** แยกคนละตัวกับน้องลีฟ (line-bot) โดยสิ้นเชิง ***
// ============================================================

const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");

// ---- เลือกรุ่น AI ----
//  claude-sonnet-5  = เก่งภาษาไทย/ครีเอทีฟ คุ้มราคา (มาตรฐานเดียวกับน้องลีฟ)
//  claude-opus-4-8  = ครีเอทีฟสุด แต่แพงกว่า (เปลี่ยนได้ที่บรรทัดนี้บรรทัดเดียว)
const MODEL = process.env.CREATIVE_MODEL || "claude-sonnet-5";

// ---- โหลด "คลังความรู้รีสอร์ท" ----
const knowledge = fs.readFileSync(
  path.join(__dirname, "data", "knowledge.md"),
  "utf8"
);

// ---- บุคลิกและวิธีทำงาน ----
const SYSTEM_PROMPT = `คุณคือ "น้องครีเอทีฟ" 🎨 ครีเอทีฟสาวสายคอนเทนต์ประจำรีสอร์ท Villa De Leaf River Kaeng Krachan — สดใส เป็นกันเอง ไฟแรง ช่วยเจ้าของรีสอร์ทและทีมงานคิดและผลิตคอนเทนต์การตลาดทุกแพลตฟอร์ม (Facebook / Instagram / TikTok / LINE)

ตัวตน & น้ำเสียง:
- ชื่อ "น้องครีเอทีฟ" เรียกแทนตัวเองว่า "น้อง" ลงท้าย "ค่ะ/คะ" สม่ำเสมอ ห้ามใช้ "ครับ/ผม"
- โทน = สดใส กระตือรือร้น เป็นกันเองแบบเพื่อนร่วมทีม (ต่างจากน้องลีฟที่คุยกับลูกค้า — น้องครีเอทีฟคุยกับ "ทีมงานภายใน" คุยสบายๆ ได้)
- อิโมจิใช้ได้ แต่พอดีๆ ไม่รก
- ตอบกระชับ ตรงประเด็น ใช้งานได้จริงทันที — ไม่ต้องเกริ่นยาว

รูปแบบข้อความ (สำคัญ):
- ตอบเป็นข้อความธรรมดา (plain text) — ห้ามใช้สัญลักษณ์ markdown เช่น **ตัวหนา** ## หัวข้อ หรือตาราง | เพราะหน้าจอแชทจะโชว์สัญลักษณ์ดิบๆ
- จัดหน้าด้วยบรรทัดว่าง + อิโมจินำหัวข้อ + เครื่องหมาย • สำหรับลิสต์แทน

หน้าที่หลัก (ทำได้ทั้งหมดนี้):
1. 💡 คิดไอเดียคอนเทนต์ — เสนอหลายไอเดียให้เลือก พร้อมเหตุผลสั้นๆ ว่าทำไมน่าจะเวิร์กกับกลุ่มเป้าหมายไหน
2. 📅 วางแผนโพสต์ราย สัปดาห์/เดือน — ระบุ วัน+แพลตฟอร์ม+ประเภทโพสต์+หัวข้อ อิงฤดูกาล/วันสำคัญ/กิจกรรมประจำสัปดาห์ของรีสอร์ท
3. ✍️ เขียนแคปชัน — เขียนให้ 2-3 เวอร์ชันต่างสไตล์ให้เลือก (เช่น อบอุ่น/กวนๆ/ขายตรง) + แฮชแท็กไทย-อังกฤษที่เหมาะ 8-15 แท็ก
4. 🎬 เขียนสคริปต์คลิปสั้น (TikTok/Reels) — โครง Hook (3 วิแรกดึงคนหยุดดู) → เนื้อหา → CTA พร้อมบอกฉากที่ต้องถ่าย มุมกล้อง ข้อความขึ้นจอ เพลงแนวไหน ความยาวรวม
5. 🎞️ เป็น "ผู้กำกับตัดต่อ CapCut" — สอนทีละขั้นแบบมือใหม่ทำตามได้: ลำดับคลิป จุดตัด ใส่ซับไทยอัตโนมัติ เทมเพลต ขนาด 9:16 การใส่เพลง
6. 🖌️ แนะนำทำภาพโพสต์ด้วย Canva — บอกเลย์เอาต์ ฟอนต์ไทยที่เหมาะ โทนสี ข้อความบนภาพ โดยใช้รูปจริงของรีสอร์ท
7. 🔍 ช่วยคิดมุมตอบเทรนด์ — ถ้าทีมเล่าเทรนด์/เพลง/มีมที่กำลังดัง ช่วยดัดให้เข้ากับรีสอร์ทแบบไม่ฝืน

ความจริงใจเรื่องขีดจำกัด (ห้ามโม้):
- น้อง "เจนรูป AI ได้แล้ว" — ให้ทีมกดปุ่ม 🎨 วาดรูป ใต้ช่องแชท แล้วพิมพ์บอกว่าอยากได้ภาพแบบไหน (ใช้ทำภาพ mood/ไอเดีย/ภาพประกอบโพสต์)
- น้องยัง "ตัดวิดีโอเองในแชทไม่ได้" — สอนวิธีทำด้วย CapCut/มือถือแทน
- หลักคิดที่ต้องแนะนำทีมเสมอ: รูป/คลิปถ่ายจริงจากมือถือ ชนะรูป AI สำหรับ "ภาพห้อง/ราคา/รีวิว" เพราะลูกค้าจองจากความเชื่อใจว่าของจริงเป็นแบบนี้ — ส่วนรูป AI เหมาะกับภาพ mood/ไอเดีย/แบ็กกราวด์

กติกาข้อมูล (สำคัญมาก — ห้ามพลาด):
- ใช้ข้อมูลจริงจากคลังความรู้ด้านล่างเท่านั้น: ชื่อห้อง ราคา กิจกรรม เมนู ระยะทาง — ห้ามแต่งตัวเลข/เมนู/รีวิว/สถิติเองเด็ดขาด
- ไม่แน่ใจข้อมูลไหน ให้บอกตรงๆ ว่า "อันนี้ขอให้เช็คกับทีมงานก่อนนะคะ" แล้วเว้นช่องให้เติม เช่น (ราคา: ___)
- ราคาในคอนเทนต์ให้ใช้คำว่า "เริ่มต้น" + ชวนทักแชทเช็ควันที่ — ห้ามการันตีราคา/ห้ามประกาศส่วนลด (รีสอร์ทไม่มีนโยบายลดราคา)
- CTA มาตรฐานของทุกคอนเทนต์: ทัก LINE @villadeleaf หรือโทร 092 619 7799
- จำบริบทการคุยตลอดบทสนทนา — ทีมแก้/เลือกไอเดียไหนไว้ ให้ทำต่อจากตรงนั้น ไม่เริ่มใหม่

จังหวะการทำงานที่ดี:
- ถ้าโจทย์กว้าง (เช่น "คิดคอนเทนต์ให้หน่อย") → ถามสั้นๆ 1 คำถามให้แคบลง (แพลตฟอร์มไหน/โปรโมทอะไร) หรือเสนอ 3 ไอเดียเด่นให้เลือกเลย
- ถ้าโจทย์ชัด → ลงมือทำให้จบในข้อความเดียว ไม่ถามวน
- ปิดท้ายด้วยก้าวถัดไปที่ทำได้จริง เช่น "เลือกเวอร์ชันไหน เดี๋ยวน้องขยายต่อให้เลยค่ะ"

═══════ คลังความรู้รีสอร์ท (ข้อมูลจริง) ═══════
${knowledge}`;

// ---- บริบทวันเวลาปัจจุบัน (ให้รู้ฤดูกาล/วันสำคัญ ใช้วางแผนคอนเทนต์) ----
function currentContext() {
  const now = new Date();
  const bkk = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const days = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
  const months = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];
  const m = bkk.getMonth() + 1;
  const season = m >= 5 && m <= 9 ? "Low season (พ.ค.–ก.ย.)" : "High season (ต.ค.–เม.ย.)";
  return `(บริบทปัจจุบัน: วัน${days[bkk.getDay()]}ที่ ${bkk.getDate()} ${months[bkk.getMonth()]} ค.ศ. ${bkk.getFullYear()} · ตอนนี้รีสอร์ทอยู่ช่วง ${season} — ใช้วางแผนคอนเทนต์ตามฤดูกาล/วันสำคัญที่ใกล้จะถึง)`;
}

// ---- เรียก Claude ----
const API_KEY = (process.env.ANTHROPIC_API_KEY || "").replace(/[^A-Za-z0-9_-]/g, "");
const client = new Anthropic({ apiKey: API_KEY, maxRetries: 4 });

async function generateReply(history, extra) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: currentContext() + (extra ? "\n\n═══ ข้อมูลแบรนด์อัปเดตจากทีม (ล่าสุด — ถ้าขัดกับข้อมูลเก่า ให้ยึดอันนี้) ═══\n" + extra : "") },
    ],
    messages: history,
  });
  const block = res.content.find((b) => b.type === "text");
  return block ? block.text.trim() : "";
}

// ---- แปลงคำขอภาษาไทย → prompt ภาพภาษาอังกฤษ (สำหรับเจนรูป AI) ----
async function imagePrompt(thaiRequest) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 250,
    system:
      "Turn the user's Thai content/marketing request into ONE concise English text-to-image prompt. " +
      "Output ONLY the prompt — no explanation, no quotes, no Thai. " +
      "Default subject = Villa de Leaf River, a riverside tropical resort near Kaeng Krachan (nature, river, pool villas, warm cozy vibe) unless the user clearly wants something else. " +
      "Always append style words: photorealistic, cinematic lighting, high detail, professional photography, vibrant. Keep it under 55 words.",
    messages: [{ role: "user", content: String(thaiRequest || "") }],
  });
  const block = res.content.find((b) => b.type === "text");
  return block ? block.text.trim().replace(/^["']+|["']+$/g, "") : String(thaiRequest || "");
}

// ---- วิเคราะห์รูปหน้า Insights / โฆษณา (Claude vision) ----
const ANALYZE_SYSTEM = {
  post:
    "คุณคือ 'น้องครีเอทีฟ' นักการตลาดคอนเทนต์รีสอร์ท Villa de Leaf ช่วยอ่านภาพหน้า Insights/สถิติโซเชียล (IG/FB/TikTok) ที่ทีมแคปมา แล้ววิเคราะห์ให้ทีมงานภายในเข้าใจง่าย " +
    "ภาษาไทย ลงท้าย ค่ะ/คะ ห้ามใช้ markdown — เขียนข้อความธรรมดา จัดหัวข้อด้วยอิโมจินำ + บรรทัดว่าง. " +
    "โครง: 📊 สรุปตัวเลขเด่นที่เห็น · 🔥 โพสต์/คอนเทนต์ไหนปังหรือแป้ก · 💡 ควรทำอะไรต่อ (แนวคอนเทนต์/เวลาโพสต์/สิ่งที่ควรปรับ) ให้ตรงประเด็น ใช้ได้จริงทันที. " +
    "ถ้าตัวเลขในรูปอ่านไม่ชัด บอกตรงๆ ว่าอ่านไม่ชัดตรงไหน ห้ามเดาตัวเลขเอง.",
  ads:
    "คุณคือ 'น้องครีเอทีฟ' ผู้ช่วยดูโฆษณา Facebook/Instagram ของรีสอร์ท Villa de Leaf ช่วยอ่านภาพหน้า Ads Manager/ผลบูสต์โพสต์ที่ทีมแคปมา แล้ววิเคราะห์ให้เข้าใจง่าย " +
    "ภาษาไทย ลงท้าย ค่ะ/คะ ห้ามใช้ markdown — ข้อความธรรมดา อิโมจินำหัวข้อ + บรรทัดว่าง. " +
    "โครง: 💰 สรุปตัวเลขเด่น (งบที่ใช้ ผลที่ได้ ต้นทุนต่อผลลัพธ์/ข้อความ) · ✅ ตัวไหนคุ้ม ควรไปต่อ/เพิ่มงบ · ⛔ ตัวไหนไม่คุ้ม ควรหยุดหรือปรับ · 💡 คำแนะนำ (กลุ่มเป้าหมาย/รูปคลิปที่ใช้/ช่วงเวลา) แบบทำตามได้ทันที. " +
    "เกณฑ์ช่วยตัดสิน: ต้นทุนต่อข้อความทัก/ต่อการจองยิ่งต่ำยิ่งดี เทียบกันเองในรูป. ห้ามเดาตัวเลขที่อ่านไม่ชัด บอกตรงๆ. " +
    "ย้ำเสมอว่า การกดเพิ่ม/ลดงบจริง ทีมเป็นคนกดเองในแอปโฆษณา (น้องแนะนำได้ แต่ไม่แตะเงินจริง).",
};
async function analyzeImage(dataUrl, note, kind) {
  const m = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m) throw new Error("bad image");
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: ANALYZE_SYSTEM[kind === "ads" ? "ads" : "post"],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
          { type: "text", text: (note ? "คำถามเพิ่มเติมจากทีม: " + note + "\n\n" : "") + (kind === "ads" ? "ช่วยวิเคราะห์หน้าโฆษณานี้ให้หน่อยค่ะ" : "ช่วยวิเคราะห์หน้า Insights นี้ให้หน่อยค่ะ") },
        ],
      },
    ],
  });
  const block = res.content.find((b) => b.type === "text");
  return block ? block.text.trim() : "";
}

// ---- ดูรูปแล้วคุย (persona น้องครีเอทีฟ) — ใช้ตอนทีมแปะรูปเทรนด์/รูปอะไรก็ได้ในแชท ----
async function visionChat(dataUrl, question) {
  const m = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m) throw new Error("bad image");
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2500,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: currentContext() },
    ],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
          { type: "text", text: String(question || "ช่วยดูรูปนี้ให้หน่อยค่ะ") },
        ],
      },
    ],
  });
  const block = res.content.find((b) => b.type === "text");
  return block ? block.text.trim() : "";
}

// ---- ดึงเทรนด์สดจากเว็บ (Claude + web search) — คืน [{em,t,d}] ----
async function fetchLiveTrends() {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
    messages: [
      {
        role: "user",
        content:
          "ค้นเว็บหาเทรนด์โซเชียล/ท่องเที่ยว/ไลฟ์สไตล์ของไทยที่กำลังฮิต 'ช่วงสัปดาห์นี้' (" + currentContext() + ") " +
          "แล้วคัดเฉพาะอันที่รีสอร์ทริมน้ำแก่งกระจานเอามาทำคอนเทนต์ได้จริง 4-6 อัน " +
          'ตอบกลับเป็น JSON array อย่างเดียว ห้ามมีข้อความอื่น รูปแบบ: [{"em":"อิโมจิ 1 ตัว","t":"ชื่อเทรนด์สั้นๆ","d":"เทรนด์คืออะไร + ไอเดียดัดเข้ารีสอร์ท 1 ประโยค"}]',
      },
    ],
  });
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const m = text.match(/\[[\s\S]*\]/) || text.match(/\[[\s\S]*/); // เผื่อโดนตัดท้าย
  if (!m) { console.error("trends: no JSON in reply:", text.slice(0, 150)); return []; }
  const tryParse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
  let arr = tryParse(m[0]);
  if (!arr) { // โดนตัดกลาง object สุดท้าย → ตัดถึง } ตัวสุดท้ายแล้วปิด ]
    const cut = m[0].lastIndexOf("}");
    if (cut > 0) arr = tryParse(m[0].slice(0, cut + 1) + "]");
  }
  if (!arr) { console.error("trends: JSON parse fail:", m[0].slice(0, 150)); return []; }
  return Array.isArray(arr) ? arr.filter((x) => x && x.t && x.d).slice(0, 6) : [];
}

// ---- แกะหน้าโฆษณาเป็นแดชบอร์ด (JSON: การ์ดตัวเลข + ตารางแคมเปญ + คำแนะนำ) ----
function robustJSON(text) {
  const m = text.match(/\{[\s\S]*\}/) || text.match(/\{[\s\S]*/);
  if (!m) return null;
  const tryP = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
  let o = tryP(m[0]);
  if (!o) { const cut = m[0].lastIndexOf("}"); if (cut > 0) o = tryP(m[0].slice(0, cut + 1)); }
  return o;
}
async function analyzeAdsData(dataUrl, note) {
  const m = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m) throw new Error("bad image");
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2500,
    system:
      "คุณคือนักการตลาดโฆษณาของรีสอร์ท อ่านภาพหน้า Ads Manager/ผลบูสต์โพสต์ แล้วแกะข้อมูลเป็น JSON เท่านั้น ห้ามมีข้อความอื่น. รูปแบบ: " +
      '{"cards":[{"label":"ชื่อตัวเลข เช่น งบที่ใช้","value":"เลขพร้อมหน่วย","sub":"หมายเหตุสั้น"}],' +
      '"rows":[{"name":"ชื่อแคมเปญ/แอด","spend":"งบ","result":"ผลที่ได้ เช่น 24 ข้อความ","cost":"ต้นทุนต่อผล","score":"good หรือ mid หรือ bad"}],' +
      '"advice":"คำแนะนำภาษาไทย 2-4 ประโยค ลงท้าย ค่ะ บอกชัดว่าตัวไหนควรไปต่อ ตัวไหนควรหยุด/ปรับ"} ' +
      "กติกา: cards 2-4 อัน เอาเฉพาะเลขเด่นที่เห็นจริงในรูป · rows เอาเท่าที่เห็น (ไม่มีตารางก็ให้ []) · score: good=คุ้ม bad=แพง/ไม่คุ้ม เทียบกันเองในรูป · ห้ามแต่งเลขที่มองไม่เห็น.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
          { type: "text", text: (note ? "โจทย์จากทีม: " + note + "\n" : "") + "แกะข้อมูลหน้าโฆษณานี้เป็น JSON ตามรูปแบบที่กำหนดค่ะ" },
        ],
      },
    ],
  });
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const o = robustJSON(text);
  if (!o || (!Array.isArray(o.cards) && !o.advice)) throw new Error("parse fail: " + text.slice(0, 120));
  return { cards: Array.isArray(o.cards) ? o.cards.slice(0, 4) : [], rows: Array.isArray(o.rows) ? o.rows.slice(0, 10) : [], advice: String(o.advice || "") };
}

// ---- ดึงข้อมูลเพจ Facebook จริง (ยอด + โพสต์เด่น) ----
const FB_TOKEN = (process.env.FB_PAGE_TOKEN || "").trim();
const FB_PAGE_ID = (process.env.FB_PAGE_ID || "").trim();
const FB_ON = !!(FB_TOKEN && FB_PAGE_ID);
async function fbGet(pathq) {
  const sep = pathq.includes("?") ? "&" : "?";
  const r = await fetch(`https://graph.facebook.com/v21.0/${pathq}${sep}access_token=${FB_TOKEN}`);
  const j = await r.json();
  if (j.error) throw new Error("fb " + j.error.code + ": " + j.error.message);
  return j;
}
async function fetchPageStats() {
  if (!FB_ON) return null;
  const me = await fbGet(`${FB_PAGE_ID}?fields=name,followers_count,fan_count`);
  let posts = [];
  try {
    const p = await fbGet(`${FB_PAGE_ID}/posts?fields=message,created_time,permalink_url,shares,reactions.summary(total_count),comments.summary(total_count)&limit=12`);
    posts = (p.data || []).map((x) => ({
      msg: (x.message || "(รูป/ไม่มีข้อความ)").replace(/\s+/g, " ").slice(0, 60),
      when: (x.created_time || "").slice(0, 10),
      url: x.permalink_url || "",
      likes: (x.reactions && x.reactions.summary && x.reactions.summary.total_count) || 0,
      comments: (x.comments && x.comments.summary && x.comments.summary.total_count) || 0,
      shares: (x.shares && x.shares.count) || 0,
    }));
  } catch (e) {}
  // การ์ดสรุป 7 วัน
  const now = Date.now();
  const recent = posts.filter((p) => p.when && now - new Date(p.when).getTime() < 7 * 864e5);
  const eng = (arr) => arr.reduce((s, p) => s + p.likes + p.comments + p.shares, 0);
  const summary = {
    postCount7: recent.length,
    eng7: eng(recent),
    avgEng7: recent.length ? Math.round(eng(recent) / recent.length) : 0,
  };
  return { name: me.name, followers: me.followers_count || me.fan_count || 0, posts, summary };
}

// น้องอ่านยอดโพสต์จริงแล้วสรุป+แนะนำ (auto)
async function pageInsightBrief(stats) {
  if (!stats) return "";
  const top = stats.posts.slice().sort((a, b) => (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares)).slice(0, 5);
  const msg =
    `นี่คือข้อมูลจริงจากเพจ Facebook "${stats.name}" (ผู้ติดตาม ${stats.followers}):\n` +
    `7 วันล่าสุด: โพสต์ ${stats.summary.postCount7} ชิ้น · engagement รวม ${stats.summary.eng7} · เฉลี่ย ${stats.summary.avgEng7}/โพสต์\n` +
    `โพสต์เด่น: ` + top.map((p) => `"${p.msg}" (❤️${p.likes} 💬${p.comments} 🔁${p.shares})`).join(" | ") +
    `\n\nช่วยวิเคราะห์สั้นๆ ให้ทีม: 1) โพสต์แนวไหน/ธีมไหนที่คนตอบรับดีสุด (ดูจากยอด) 2) ควรทำคอนเทนต์แบบไหนเพิ่ม 3) 1 คำแนะนำที่ทำได้ทันที — กระชับ 3-4 บรรทัด ห้าม markdown ลงท้าย ค่ะ`;
  return await generateReply([{ role: "user", content: msg }]);
}

module.exports = { generateReply, imagePrompt, analyzeImage, analyzeAdsData, visionChat, fetchLiveTrends, fetchPageStats, pageInsightBrief, FB_ON, MODEL };

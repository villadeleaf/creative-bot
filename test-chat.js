// ============================================================
//  ห้องทดสอบส่วนตัว — คุยกับน้องครีเอทีฟจริงในเครื่อง (ไม่มีใครเห็น)
//  ใช้สมองตัวเดียวกับบอทจริง (brain.js) ทุกอย่าง
//
//  วิธีใช้:
//    node --env-file=.env test-chat.js "ข้อความ 1" "ข้อความ 2" ...
// ============================================================

const { generateReply, MODEL } = require("./brain");

async function main() {
  const messages = process.argv.slice(2);
  if (messages.length === 0) {
    console.log('ตัวอย่าง: node --env-file=.env test-chat.js "คิดแคปชันโปรโมทห้อง Pool Villa หน่อย"');
    return;
  }

  console.log(`🎨 ห้องทดสอบน้องครีเอทีฟ (รุ่น ${MODEL})\n`);
  const history = [];
  for (const msg of messages) {
    history.push({ role: "user", content: msg });
    console.log("🧑 ทีมงาน: " + msg);
    const reply = await generateReply(history);
    history.push({ role: "assistant", content: reply });
    console.log("🎨 น้องครีเอทีฟ: " + reply + "\n");
  }
}

main().catch((err) => {
  console.error("เกิดข้อผิดพลาด:", err.message);
  process.exit(1);
});

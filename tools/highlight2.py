#!/usr/bin/env python3
# ตัดโหด 60-90 วิ: ร้อยท่อนเด็ดจาก 2 เทค + ซับไทย (PNG overlay ผ่านฟอนต์ Mac)
import subprocess, os

T2 = "/Users/greece/Downloads/807078053.923696.mp4"  # input 0 (เนื้อหลัก)
T1 = "/Users/greece/Downloads/807078053.869864.mp4"  # input 1 (ปิดท้าย)
SCRATCH = "/private/tmp/claude-501/-Users-greece-----adv/3d55cd3d-3091-46a0-9c4c-841b1cf85a3c/scratchpad"
OUT = "/Users/greece/Desktop/คลิปสั้น-ซับไทย.mp4"

# (input, start, end, ซับ — ใช้ | คั่นบรรทัด)
SEGS = [
    (0,  23.40,  34.40, "ใครยังตามข่าวคุณณัฐภัทรอยู่|เดี๋ยวผมสรุปให้ฟังก่อนครับ"),
    (0,  34.40,  48.00, "มีคนเอาคลิปศิลปินดาราไปทำเพลง|ข้อมูลใหม่คือ... จริงๆ เขารู้จักกัน!"),
    (0,  48.00,  57.00, "และผมเพิ่งรู้ข่าวมาว่า|เขาเซ็นสัญญากับค่ายดังในอเมริกา"),
    (0,  63.00,  75.00, "คนที่ฟ้อง ไม่ใช่เจ้าตัวนะครับ|แต่เป็นฝั่งฮอลลีวูด ฟ้องวัยรุ่นไทย"),
    (0, 116.00, 128.00, "ผมโทรคุยกับฝั่งฮอลลีวูดแล้ว|เขาจะมาออกรายการ แต่เด็กไทยยังไม่กล้า"),
    (0, 128.00, 138.00, "ผมพยายามคุยอยู่ อาจไม่ต้องจ่ายเงิน|แค่ออกมาขอโทษก็ได้"),
    (0, 165.00, 176.00, "แล้วมันจะเป็นปัญหาใหญ่ไหม?|ใหญ่ครับ! ติดตามต่อคลิปหน้าครับ"),
    (1,  93.50,  99.40, "วันนี้ก็ประมาณนี้ครับ|ขอบคุณที่รับชมครับ"),
]

# ---- 1) สร้างภาพซับ ----
for i, (_, _, _, text) in enumerate(SEGS):
    subprocess.run(["swift", "subimg.swift", f"sub{i}.png", text],
                   check=True, cwd=SCRATCH, capture_output=True)
print("สร้างภาพซับครบ", len(SEGS), "ภาพ")

# ---- 2) ตัด + ต่อ + แปะซับ ----
inputs = ["-i", T2, "-i", T1]
for i in range(len(SEGS)):
    inputs += ["-i", f"{SCRATCH}/sub{i}.png"]  # input 2..9

fc, vs = [], []
for i, (inp, a, b, _) in enumerate(SEGS):
    fc.append(f"[{inp}:v]trim=start={a}:end={b},setpts=PTS-STARTPTS[v{i}];")
    fc.append(f"[{inp}:a]atrim=start={a}:end={b},asetpts=PTS-STARTPTS[a{i}];")
    vs.append(f"[v{i}][a{i}]")
fc.append("".join(vs) + f"concat=n={len(SEGS)}:v=1:a=1[cv][outa];")

cur, t = "cv", 0.0
for i, (_, a, b, _) in enumerate(SEGS):
    d = b - a
    nxt = f"o{i}"
    # ภาพจาก Retina ใหญ่ 2 เท่า → ย่อกลับเหลือกว้าง 540 ก่อนแปะ
    fc.append(f"[{i+2}:v]scale=540:-1[s{i}];")
    fc.append(f"[{cur}][s{i}]overlay=x=(W-w)/2:y=H-h-58:"
              f"enable='between(t,{t+0.15:.2f},{t+d-0.15:.2f})'[{nxt}];")
    cur, t = nxt, t + d
fc[-1] = fc[-1].rstrip(";")
print(f"ความยาวรวม {t:.1f} วิ")

subprocess.run(["ffmpeg", "-y", "-v", "error"] + inputs +
               ["-filter_complex", "".join(fc),
                "-map", f"[{cur}]", "-map", "[outa]",
                "-c:v", "libx264", "-crf", "20", "-preset", "medium",
                "-c:a", "aac", "-b:a", "128k", OUT], check=True)
print("เสร็จ:", OUT)

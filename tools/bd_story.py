#!/usr/bin/env python3
# IG Story วันเกิดแฟน — สไตล์อบอุ่นโรแมนติก (Ken Burns + เฟดขาวนุ่มๆ)
# 1080x1920 · รูปละ 2.8 วิ · รวม ~22 วิ
import subprocess, os

SCRATCH = "/private/tmp/claude-501/-Users-greece-----adv/3d55cd3d-3091-46a0-9c4c-841b1cf85a3c/scratchpad"
DL = os.path.expanduser("~/Downloads")
OUT = "/Users/greece/Desktop/สตอรี่วันเกิดแฟน.mp4"
DUR, FADE = 2.8, 0.45

# ลำดับเล่าเรื่อง: เที่ยวกลางวัน → มื้ออร่อย → น่ารักๆ → จบด้วยพลุไฟเย็น
ORDER = ["S__15278085_0", "S__15278086_0", "S__15278087_0", "S__15278089_0",
         "S__15278092_0", "S__15278088_0", "S__15278090_0", "S__15278091_0"]

# ข้อความ (index รูป → (ไฟล์ png, ตำแหน่ง y จากบน))
TITLE = ("bd_title.png", 300)     # รูปแรก
CLOSE = ("bd_close.png", None)    # รูปสุดท้าย (None = ล่าง)
subprocess.run(["swift", "subimg.swift", "bd_title.png",
                "Happy Birthday 🎂|ที่รักของเรา", "40"],
               check=True, cwd=SCRATCH, capture_output=True)
subprocess.run(["swift", "subimg.swift", "bd_close.png",
                "สุขสันต์วันเกิดนะที่รัก 🎂|ขอบคุณที่มีกันทุกโมเมนต์ 💕", "28"],
               check=True, cwd=SCRATCH, capture_output=True)
print("สร้างข้อความเสร็จ")

segs = []
for i, name in enumerate(ORDER):
    photo = f"{DL}/{name}.jpg"
    seg = f"{SCRATCH}/bdseg{i}.mp4"
    segs.append(seg)
    text = TITLE if i == 0 else (CLOSE if i == len(ORDER) - 1 else None)

    fc = ("[0:v]split[a][b];"
          "[a]scale=1080:1920:force_original_aspect_ratio=increase,"
          "crop=1080:1920,boxblur=28[bg];"
          "[b]scale=1080:-2[fg];"
          "[bg][fg]overlay=(W-w)/2:(H-h)/2[base];"
          "[base]zoompan=z='zoom+0.0006':d=1:"
          "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30[kb];")
    inputs = ["-loop", "1", "-framerate", "30", "-t", str(DUR), "-i", photo]
    if text:
        png, y = text
        inputs += ["-i", f"{SCRATCH}/{png}"]
        ypos = str(y) if y is not None else "H-h-380"
        fc += f"[kb][1:v]overlay=(W-w)/2:{ypos}[kb];"
    fc += (f"[kb]fade=t=in:st=0:d={FADE}:color=white,"
           f"fade=t=out:st={DUR - FADE}:d={FADE}:color=white,format=yuv420p[out]")

    subprocess.run(["ffmpeg", "-y", "-v", "error"] + inputs +
                   ["-filter_complex", fc, "-map", "[out]",
                    "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                    "-r", "30", "-an", seg], check=True)
    print(f"ท่อน {i+1}/{len(ORDER)} เสร็จ ({name})")

with open(f"{SCRATCH}/bdlist.txt", "w") as f:
    for s in segs:
        f.write(f"file '{s}'\n")
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
                "-i", f"{SCRATCH}/bdlist.txt", "-c", "copy", OUT], check=True)
print("เสร็จ:", OUT)

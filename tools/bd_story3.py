#!/usr/bin/env python3
# IG Story วันเกิด v3 — "กองโพลารอยด์": การ์ดร่อนลงมาซ้อนกันทีละใบ
# พื้นหลังเบลอซูมช้าๆ + เกรนฟิล์ม + จบที่รูปพลุไฟบนสุด
import subprocess, os

SCRATCH = "/private/tmp/claude-501/-Users-greece-----adv/3d55cd3d-3091-46a0-9c4c-841b1cf85a3c/scratchpad"
DL = os.path.expanduser("~/Downloads")
OUT = "/Users/greece/Desktop/สตอรี่วันเกิดแฟน-v3.mp4"

STEP, FLY, HOLD = 1.55, 0.5, 2.2      # ใบใหม่ทุก 1.55 วิ · ร่อน 0.5 วิ · ค้างท้าย
ORDER = [("S__15278085_0", -3.0), ("S__15278086_0", 2.6), ("S__15278087_0", -2.2),
         ("S__15278089_0", 3.0), ("S__15278092_0", -2.6), ("S__15278088_0", 2.2),
         ("S__15278090_0", -1.8), ("S__15278091_0", 1.5)]
# จุดวางกลางการ์ด (บนจอ 1080x1920) — กระจายเป็นกอง ใบสุดท้ายกลางจอ
CENTERS = [(480, 700), (610, 820), (470, 940), (600, 1080),
           (450, 1180), (620, 960), (510, 880), (540, 960)]

TOTAL = STEP * (len(ORDER) - 1) + FLY + HOLD

cards = []
for i, (name, ang) in enumerate(ORDER):
    p = f"{SCRATCH}/pc{i}.png"
    r = subprocess.run(["swift", "polacard.swift", f"{DL}/{name}.jpg", p, str(ang)],
                       check=True, cwd=SCRATCH, capture_output=True, text=True)
    cards.append(p)
print("การ์ดครบ 8 ใบ:", r.stdout.strip())

# ขนาดการ์ดจริง (Retina 2x)
probe = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", cards[0]],
                       capture_output=True, text=True).stdout
pw = int([l for l in probe.splitlines() if "pixelWidth" in l][0].split()[-1])
ph = int([l for l in probe.splitlines() if "pixelHeight" in l][0].split()[-1])
print(f"ขนาดการ์ด {pw}x{ph}")

inputs = ["-loop", "1", "-framerate", "30", "-t", str(TOTAL), "-i",
          f"{DL}/{ORDER[0][0]}.jpg"]
for c in cards:
    inputs += ["-loop", "1", "-framerate", "30", "-t", str(TOTAL), "-i", c]

# พื้นหลัง: รูปแรกเบลอ + มืดลง + ซูมช้าๆ
fc = ("[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
      "boxblur=32,eq=brightness=-0.08:saturation=1.05,"
      "zoompan=z='zoom+0.0002':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
      "s=1080x1920:fps=30[bg];")

cur = "bg"
for i, ((_, _), (cx, cy)) in enumerate(zip(ORDER, CENTERS)):
    ti = i * STEP
    # ความคืบหน้าการร่อน 0→1 แบบ ease-out
    prog = f"min(max((t-{ti:.2f})/{FLY},0),1)"
    ease = f"(1-pow(1-{prog},3))"
    # หมุนคลี่ตัวนิดๆ ระหว่างร่อน (เริ่มเอียงเพิ่ม ~9 องศา แล้วคลายเป็น 0)
    fc += (f"[{i+1}:v]format=rgba,rotate=a='0.16*pow(1-{prog},3)':"
           f"c=black@0:ow=iw:oh=ih[r{i}];")
    x = cx - pw // 2
    yf = cy - ph // 2
    fc += (f"[{cur}][r{i}]overlay=x={x}:"
           f"y='-{ph + 50}+({yf}+{ph + 50})*{ease}'[o{i}];")
    cur = f"o{i}"

fc += (f"[{cur}]eq=saturation=1.05:contrast=1.03,vignette=PI/4.5,"
       "noise=alls=6:allf=t+u,"
       "fade=t=in:st=0:d=0.3:color=white,"
       f"fade=t=out:st={TOTAL - 0.4:.2f}:d=0.4:color=white,format=yuv420p[out]")

subprocess.run(["ffmpeg", "-y", "-v", "error"] + inputs +
               ["-filter_complex", fc, "-map", "[out]",
                "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                "-r", "30", "-an", OUT], check=True)
print(f"เสร็จ: {OUT} ({TOTAL:.1f} วิ)")

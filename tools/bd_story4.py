#!/usr/bin/env python3
# IG Story วันเกิด FINAL — กองโพลารอยด์ 13 ใบ + ลูกเล่นเซ็ต 1,3,4,5,9
#  1 ร่อนคนละทิศ · 3 เด้งนุ่ม (easeOutBack) · 4 จังหวะเร่ง ช้า→รัว→ช้า
#  5 แฟลชกล้องตอนใบสุดท้ายลง · 9 ซูมจบเข้ารูปพลุไฟเต็มจอ
import subprocess, os

SCRATCH = "/private/tmp/claude-501/-Users-greece-----adv/3d55cd3d-3091-46a0-9c4c-841b1cf85a3c/scratchpad"
DL = os.path.expanduser("~/Downloads")
OUT = "/Users/greece/Desktop/สตอรี่วันเกิดแฟน-final.mp4"

# (ไฟล์, องศาเอียง, ทิศที่ร่อนเข้า, จุดวางกลางการ์ด cx,cy)
PLAN = [
    ("S__15278085_0.jpg",            -3.0, "top",    (470, 720)),
    ("S__15278086_0.jpg",             2.6, "left",   (620, 850)),
    ("S__15278087_0.jpg",            -2.2, "right",  (460, 980)),
    ("S__15278089_0.jpg",             3.0, "top",    (600, 1120)),
    ("S__15278092_0.jpg",            -2.6, "bottom", (480, 1220)),
    ("LINE_ALBUM_🐷_260730_1.jpg",    2.2, "right",  (630, 760)),
    ("LINE_ALBUM_🐷_260730_2.jpg",   -2.8, "left",   (450, 860)),
    ("LINE_ALBUM_🐷_260730_3.jpg",    2.4, "top",    (610, 1000)),
    ("LINE_ALBUM_Meepooh_260730_2.jpg", -2.0, "right", (500, 1120)),
    ("S__15278088_0.jpg",             2.8, "left",   (620, 880)),
    ("LINE_ALBUM_Meepooh_260730_1.jpg", -2.4, "top", (470, 780)),
    ("S__15278090_0.jpg",             1.8, "right",  (560, 1040)),
    ("S__15278091_0.jpg",             0.0, "top",    (540, 960)),   # ← ไคลแม็กซ์
]
# จังหวะเร่ง: ช่องว่างระหว่างใบ (วิ) — ช้า → รัว → หยุดหายใจ → ใบสุดท้าย
GAPS  = [0, 1.7, 1.5, 1.3, 1.1, 0.95, 0.8, 0.7, 0.6, 0.55, 0.5, 0.5, 1.5]
FLY_N, FLY_F = 0.55, 0.9   # เวลาร่อน ใบปกติ / ใบสุดท้าย (ช้าเน้นๆ)

starts, t = [], 0.0
for g in GAPS:
    t += g
    starts.append(round(t, 2))
FINALE_LAND = starts[-1] + FLY_F
FLASH_T = FINALE_LAND + 0.05
ZOOM_T = FLASH_T + 0.55
TOTAL = round(ZOOM_T + 1.4 + 0.9, 2)   # ซูม 1.4 วิ + ค้าง
print(f"ไทม์ไลน์: ใบสุดท้ายลง {FINALE_LAND:.2f} · แฟลช {FLASH_T:.2f} · ซูม {ZOOM_T:.2f} · รวม {TOTAL:.2f} วิ")

# ---- สร้างการ์ด + วัดขนาดจริง ----
sizes = []
for i, (name, ang, _, _) in enumerate(PLAN):
    p = f"{SCRATCH}/fc{i}.png"
    subprocess.run(["swift", "polacard.swift", f"{DL}/{name}", p, str(ang)],
                   check=True, cwd=SCRATCH, capture_output=True)
    probe = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", p],
                           capture_output=True, text=True).stdout
    w = int([l for l in probe.splitlines() if "pixelWidth" in l][0].split()[-1])
    h = int([l for l in probe.splitlines() if "pixelHeight" in l][0].split()[-1])
    sizes.append((w, h))
print("การ์ดครบ", len(PLAN), "ใบ")

# ---- แฟลชขาว (ไฟล์ PPM ขาวล้วน เขียนเองตรงๆ) ----
with open(f"{SCRATCH}/white.ppm", "wb") as f:
    f.write(b"P6\n1080 1920\n255\n" + b"\xff" * (1080 * 1920 * 3))

inputs = ["-loop", "1", "-framerate", "30", "-t", str(TOTAL), "-i",
          f"{DL}/{PLAN[0][0]}"]
for i in range(len(PLAN)):
    inputs += ["-loop", "1", "-framerate", "30", "-t", str(TOTAL), "-i", f"{SCRATCH}/fc{i}.png"]
inputs += ["-loop", "1", "-framerate", "30", "-t", str(TOTAL), "-i", f"{SCRATCH}/white.ppm"]
FLASH_IN = len(PLAN) + 1

fc = ("[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
      "boxblur=32,eq=brightness=-0.08:saturation=1.05,"
      "zoompan=z='zoom+0.0002':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
      "s=1080x1920:fps=30[bg];")

cur = "bg"
for i, ((name, ang, dr, (cx, cy)), (w, h)) in enumerate(zip(PLAN, sizes)):
    ti, fly = starts[i], (FLY_F if i == len(PLAN) - 1 else FLY_N)
    xf, yf = cx - w // 2, cy - h // 2
    if dr == "top":      xs, ys = xf, -(h + 80)
    elif dr == "bottom": xs, ys = xf, 1920 + 80
    elif dr == "left":   xs, ys = -(w + 80), yf
    else:                xs, ys = 1080 + 80, yf
    P = f"min(max((t-{ti})/{fly},0),1)"
    E = f"(1+2.70158*pow({P}-1,3)+1.70158*pow({P}-1,2))"   # easeOutBack = เด้งนุ่ม
    sign = "-" if i % 2 else ""
    fc += (f"[{i+1}:v]format=rgba,rotate=a='{sign}0.14*pow(1-{P},3)':"
           f"c=black@0[r{i}];")
    fc += (f"[{cur}][r{i}]overlay="
           f"x='{xs}+({xf}-{xs})*{E}':y='{ys}+({yf}-{ys})*{E}'[o{i}];")
    cur = f"o{i}"

# แฟลชกล้อง 0.12 วิ
fc += (f"[{cur}][{FLASH_IN}:v]overlay=enable='between(t,{FLASH_T},{FLASH_T + 0.12})'[fl];")
# ซูมดิ่งเข้ารูปพลุไฟ (กลางจอ)
fc += (f"[fl]zoompan=z='if(lt(in_time,{ZOOM_T}),1.001,min(1.001+(in_time-{ZOOM_T})*0.78,2.0))':"
       "d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,"
       "eq=saturation=1.05:contrast=1.03,vignette=PI/4.5,noise=alls=6:allf=t+u,"
       "fade=t=in:st=0:d=0.3:color=white,"
       f"fade=t=out:st={TOTAL - 0.45}:d=0.45:color=white,format=yuv420p[out]")

subprocess.run(["ffmpeg", "-y", "-v", "error"] + inputs +
               ["-filter_complex", fc, "-map", "[out]",
                "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                "-r", "30", "-an", OUT], check=True)
print("เสร็จ:", OUT)

#!/usr/bin/env python3
# Sunny Day Edition ☀️ — ตัดฉับแบบ "สลับกล้อง" + โทนแดดใส + แสงทองวูบ + สติกเกอร์แฮปปี้
import subprocess, os

SCRATCH = "/private/tmp/claude-501/-Users-greece-----adv/3d55cd3d-3091-46a0-9c4c-841b1cf85a3c/scratchpad"
DL = os.path.expanduser("~/Downloads")
OUT = "/Users/greece/Desktop/สตอรี่วันเกิดแฟน-sunny.mp4"

PHOTOS = ["S__15278085_0.jpg", "S__15278086_0.jpg", "S__15278087_0.jpg",
          "S__15278089_0.jpg", "S__15278092_0.jpg",
          "LINE_ALBUM_🐷_260730_1.jpg", "LINE_ALBUM_🐷_260730_2.jpg",
          "LINE_ALBUM_🐷_260730_3.jpg", "LINE_ALBUM_Meepooh_260730_2.jpg",
          "S__15278088_0.jpg", "LINE_ALBUM_Meepooh_260730_1.jpg",
          "S__15278090_0.jpg", "S__15278091_0.jpg"]
FIRST, MID, LAST = 1.5, 1.15, 2.2

subprocess.run(["swift", "sunny_assets.swift", SCRATCH],
               check=True, cwd=SCRATCH, capture_output=True)
print("ของตกแต่ง Sunny ครบ")

FILL = ("scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,setsar=1")
# H1 โทนแดดใส: สว่างอุ่น สดชื่น ไม่จัดเกิน
SUNNY = ("eq=brightness=0.055:saturation=1.15:contrast=1.05,"
         "colorbalance=rm=0.05:bm=-0.05:rh=0.04:bh=-0.06")

# ---- ท่อนรูป: สลับ "กล้องกว้าง" / "กล้องซูม" = ฟีลสลับกล้อง ----
segs = []
for i, name in enumerate(PHOTOS):
    d = FIRST if i == 0 else (LAST if i == len(PHOTOS) - 1 else MID)
    seg = f"{SCRATCH}/sn{i}.mp4"
    segs.append((seg, d))
    if i % 2 == 0:   # กล้อง A: มุมกว้าง ซูมเข้าช้า
        z = "zoom+0.0006"
    else:            # กล้อง B: มุมซูมใกล้ (เริ่มที่ 1.2 เท่า) ถอยออกช้า
        z = "if(eq(on,0),1.22,max(zoom-0.0006,1.16))"
    fc = (f"[0:v]{FILL},zoompan=z='{z}':d=1:"
          "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,"
          f"{SUNNY},format=yuv420p[out]")
    subprocess.run(["ffmpeg", "-y", "-v", "error",
                    "-loop", "1", "-framerate", "30", "-t", str(d), "-i", f"{DL}/{name}",
                    "-filter_complex", fc, "-map", "[out]",
                    "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                    "-r", "30", "-an", seg], check=True)
    print(f"รูป {i+1}/{len(PHOTOS)}")

# ---- ตัดฉับต่อกันตรงๆ (แบบสลับกล้อง ไม่มีทรานสิชัน) ----
with open(f"{SCRATCH}/snlist.txt", "w") as f:
    for s, _ in segs:
        f.write(f"file '{s}'\n")
joined = f"{SCRATCH}/snjoined.mp4"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
                "-i", f"{SCRATCH}/snlist.txt", "-c", "copy", joined], check=True)

# ---- เลเยอร์: H2 แสงทองวูบผ่าน + H4 สติกเกอร์ ----
tt, times = 0.0, []
for i in range(len(PHOTOS)):
    d = FIRST if i == 0 else (LAST if i == len(PHOTOS) - 1 else MID)
    times.append((tt, tt + d))
    tt += d
TOTAL = tt

inputs = ["-i", joined]
for n in ["sunbeam.png", "stick0.png", "stick1.png", "stick2.png"]:
    inputs += ["-loop", "1", "-framerate", "30", "-t", f"{TOTAL:.2f}", "-i", f"{SCRATCH}/{n}"]

fc = ("[1:v]format=rgba[beam];"
      "[2:v]format=rgba,scale=1080:1920[st0];"
      "[3:v]format=rgba,scale=1080:1920[st1];"
      "[4:v]format=rgba,scale=1080:1920[st2];")

# แสงทองวูบผ่าน 4 ช่วง (กวาดซ้าย→ขวา ~1.4 วิ)
cur = "0:v"
for k, T in enumerate([1.6, 5.4, 9.2, 13.4]):
    fc += (f"[{cur}][beam]overlay="
           f"x='-1100+(t-{T})*1800':y=-260:"
           f"enable='between(t,{T},{T + 1.4})'[b{k}];")
    cur = f"b{k}"

# สติกเกอร์สลับ 3 ชุด รูปเว้นรูป
for i, (a, b) in enumerate(times):
    if i % 2 == 0:
        continue
    st = f"st{(i // 2) % 3}"
    fc += f"[{cur}][{st}]overlay=enable='between(t,{a:.2f},{b:.2f})'[s{i}];"
    cur = f"s{i}"

fc += (f"[{cur}]vignette=PI/5.5,noise=alls=4:allf=t+u,"
       "fade=t=in:st=0:d=0.25:color=white,"
       f"fade=t=out:st={TOTAL - 0.45:.2f}:d=0.45:color=white,format=yuv420p[out]")

subprocess.run(["ffmpeg", "-y", "-v", "error"] + inputs +
               ["-filter_complex", fc, "-map", "[out]",
                "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                "-r", "30", "-an", OUT], check=True)
print(f"เสร็จ: {OUT} ({TOTAL:.1f} วิ)")

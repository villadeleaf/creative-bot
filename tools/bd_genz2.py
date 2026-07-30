#!/usr/bin/env python3
# Y2K Digicam v2 — รอยต่อมิกซ์ 6 ท่า + เปิดคลิปแฟลชรัวแบบปาปารัสซี่
import subprocess, os

SCRATCH = "/private/tmp/claude-501/-Users-greece-----adv/3d55cd3d-3091-46a0-9c4c-841b1cf85a3c/scratchpad"
DL = os.path.expanduser("~/Downloads")
OUT = "/Users/greece/Desktop/สตอรี่วันเกิดแฟน-genz2.mp4"

PHOTOS = ["S__15278085_0.jpg", "S__15278086_0.jpg", "S__15278087_0.jpg",
          "S__15278089_0.jpg", "S__15278092_0.jpg",
          "LINE_ALBUM_🐷_260730_1.jpg", "LINE_ALBUM_🐷_260730_2.jpg",
          "LINE_ALBUM_🐷_260730_3.jpg", "LINE_ALBUM_Meepooh_260730_2.jpg",
          "S__15278088_0.jpg", "LINE_ALBUM_Meepooh_260730_1.jpg",
          "S__15278090_0.jpg", "S__15278091_0.jpg"]
# มิกซ์ท่าเปลี่ยนฉาก 12 รอยต่อ (เข้ารูปพลุ = ซูมพันช์)
TRANS = ["zoomin", "hblur", "pixelize", "circlecrop", "slideleft", "zoomin",
         "hblur", "slideright", "circleopen", "pixelize", "hblur", "zoomin"]
DUR, FIRST, LAST, TD = 1.15, 1.5, 2.2, 0.35

FILL = ("scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,setsar=1")
DIGI = "eq=contrast=1.17:saturation=1.28:brightness=0.03"

segs = []
for i, name in enumerate(PHOTOS):
    d = FIRST if i == 0 else (LAST if i == len(PHOTOS) - 1 else DUR)
    seg = f"{SCRATCH}/g2_{i}.mp4"
    segs.append((seg, d))
    fc = (f"[0:v]{FILL},zoompan=z='zoom+0.0014':d=1:"
          "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,"
          f"{DIGI},format=yuv420p[out]")
    subprocess.run(["ffmpeg", "-y", "-v", "error",
                    "-loop", "1", "-framerate", "30", "-t", str(d), "-i", f"{DL}/{name}",
                    "-filter_complex", fc, "-map", "[out]",
                    "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                    "-r", "30", "-an", seg], check=True)
    print(f"รูป {i+1}/{len(PHOTOS)}")

# ---- xfade มิกซ์ท่า ----
inputs = []
for seg, _ in segs:
    inputs += ["-i", seg]
fc, cur, off = "", "0:v", 0.0
joints = []
for i in range(1, len(segs)):
    off += segs[i - 1][1] - TD
    joints.append(off)
    fc += (f"[{cur}][{i}:v]xfade=transition={TRANS[i - 1]}:"
           f"duration={TD}:offset={off:.2f}[x{i}];")
    cur = f"x{i}"
TOTAL = off + segs[-1][1]

# ---- เลเยอร์ digicam: สแกนไลน์ / ดูเดิล / REC / แฟลชรัวเปิดคลิป ----
ASSETS = ["scan0.png", "scan1.png", "recdate.png",
          "doodle0.png", "doodle1.png", "doodle2.png", "doodle3.png"]
base = len(segs)
for n in ASSETS:
    inputs += ["-loop", "1", "-framerate", "30", "-t", f"{TOTAL:.2f}", "-i", f"{SCRATCH}/{n}"]
inputs += ["-loop", "1", "-framerate", "30", "-t", f"{TOTAL:.2f}", "-i", f"{SCRATCH}/white.ppm"]
WHITE = base + len(ASSETS)

for k in range(len(ASSETS)):
    fc += f"[{base + k}:v]format=rgba,scale=1080:1920[L{k}];"
fc += f"[{cur}][L0]overlay=enable='lt(mod(n,4),2)'[s1];"
fc += "[s1][L1]overlay=enable='gte(mod(n,4),2)'[s2];"

# ดูเดิลรูปเว้นรูป (ช่วงโชว์เดี่ยวระหว่างรอยต่อ)
cur = "s2"
windows = []
for i in range(len(PHOTOS)):
    a = 0.0 if i == 0 else joints[i - 1] + TD
    b = joints[i] if i < len(joints) else TOTAL
    windows.append((a, b))
for i, (a, b) in enumerate(windows):
    if i % 2 == 0:
        continue
    dd = 3 + ((i // 2) % 4)
    fc += (f"[{cur}][L{dd}]overlay="
           f"enable='between(t,{a + 0.05:.2f},{b:.2f})*lt(mod(n,8),7)'[d{i}];")
    cur = f"d{i}"

# แฟลชรัวปาปารัสซี่ตอนเปิด 3 วาบ
fc += (f"[{cur}][{WHITE}:v]overlay=enable='between(t,0.02,0.10)+"
       "between(t,0.24,0.32)+between(t,0.48,0.58)'[flsh];")

fc += (f"[flsh][L2]overlay[rec];"
       "[rec]noise=alls=11:allf=t+u,"
       f"fade=t=out:st={TOTAL - 0.12:.2f}:d=0.12:color=black,format=yuv420p[out]")

subprocess.run(["ffmpeg", "-y", "-v", "error"] + inputs +
               ["-filter_complex", fc, "-map", "[out]",
                "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                "-r", "30", "-an", OUT], check=True)
print(f"เสร็จ: {OUT} ({TOTAL:.1f} วิ)")

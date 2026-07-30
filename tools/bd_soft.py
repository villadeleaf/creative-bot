#!/usr/bin/env python3
# IG Story วันเกิด — Soft Film Edition: หวานกำลังดี
# รูปเต็มจอพื้นเบลอ + Ken Burns สลับทิศ + รอยต่อสลับ 5 ท่านุ่มๆ (xfade)
import subprocess, os

SCRATCH = "/private/tmp/claude-501/-Users-greece-----adv/3d55cd3d-3091-46a0-9c4c-841b1cf85a3c/scratchpad"
DL = os.path.expanduser("~/Downloads")
OUT = "/Users/greece/Desktop/สตอรี่วันเกิดแฟน-soft.mp4"

PHOTOS = ["S__15278085_0.jpg", "S__15278086_0.jpg", "S__15278087_0.jpg",
          "S__15278089_0.jpg", "S__15278092_0.jpg",
          "LINE_ALBUM_🐷_260730_1.jpg", "LINE_ALBUM_🐷_260730_2.jpg",
          "LINE_ALBUM_🐷_260730_3.jpg", "LINE_ALBUM_Meepooh_260730_2.jpg",
          "S__15278088_0.jpg", "LINE_ALBUM_Meepooh_260730_1.jpg",
          "S__15278090_0.jpg", "S__15278091_0.jpg"]
# ท่าเปลี่ยนฉาก 12 รอยต่อ — สลับไม่ให้ซ้ำติดกัน · เข้ารูปพลุ = วาบขาว
TRANS = ["fade", "hblur", "circleopen", "smoothleft", "fade", "hblur",
         "slideup", "circleopen", "fade", "hblur", "smoothright", "fadewhite"]
DUR, LAST, TD = 1.6, 2.4, 0.5

# ---- ท่อนรูป (ไม่มีเฟดในตัว ให้ xfade จัดการ) ----
segs = []
for i, name in enumerate(PHOTOS):
    d = LAST if i == len(PHOTOS) - 1 else DUR
    seg = f"{SCRATCH}/sf{i}.mp4"
    segs.append((seg, d))
    z = "zoom+0.0007" if i % 2 == 0 else "if(eq(on,0),1.06,max(zoom-0.0007,1.0))"
    fc = ("[0:v]split[a][b];"
          "[a]scale=1080:1920:force_original_aspect_ratio=increase,"
          "crop=1080:1920,boxblur=30,eq=brightness=-0.05[bg];"
          "[b]scale=1080:-2[fg];"
          "[bg][fg]overlay=(W-w)/2:(H-h)/2[base];"
          f"[base]zoompan=z='{z}':d=1:"
          "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,"
          "eq=saturation=1.08:contrast=1.03:brightness=0.01,"
          "format=yuv420p[out]")
    subprocess.run(["ffmpeg", "-y", "-v", "error",
                    "-loop", "1", "-framerate", "30", "-t", str(d), "-i", f"{DL}/{name}",
                    "-filter_complex", fc, "-map", "[out]",
                    "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                    "-r", "30", "-an", seg], check=True)
    print(f"รูป {i+1}/{len(PHOTOS)} เสร็จ")

# ---- ต่อด้วย xfade สลับท่า ----
inputs = []
for seg, _ in segs:
    inputs += ["-i", seg]

fc, cur, off = "", "0:v", 0.0
for i in range(1, len(segs)):
    off += segs[i - 1][1] - TD
    nxt = f"x{i}"
    fc += (f"[{cur}][{i}:v]xfade=transition={TRANS[i - 1]}:"
           f"duration={TD}:offset={off:.2f}[{nxt}];")
    cur = nxt
TOTAL = off + segs[-1][1]

fc += (f"[{cur}]vignette=PI/5,noise=alls=5:allf=t+u,"
       "fade=t=in:st=0:d=0.3:color=white,"
       f"fade=t=out:st={TOTAL - 0.5:.2f}:d=0.5:color=white,format=yuv420p[out]")

subprocess.run(["ffmpeg", "-y", "-v", "error"] + inputs +
               ["-filter_complex", fc, "-map", "[out]",
                "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                "-r", "30", "-an", OUT], check=True)
print(f"เสร็จ: {OUT} ({TOTAL:.1f} วิ)")

#!/usr/bin/env python3
# IG Story วันเกิด v2 — โพลารอยด์ฟิล์ม: กรอบขาวเอียงบนพื้นเบลอ + เกรนฟิล์ม + โทนอุ่น
# ไม่มีข้อความ (ไปใส่สติกเกอร์/เพลงในแอป IG เอง)
import subprocess, os

SCRATCH = "/private/tmp/claude-501/-Users-greece-----adv/3d55cd3d-3091-46a0-9c4c-841b1cf85a3c/scratchpad"
DL = os.path.expanduser("~/Downloads")
OUT = "/Users/greece/Desktop/สตอรี่วันเกิดแฟน-v2.mp4"
DUR, FADE = 1.9, 0.3

# ลำดับเล่าเรื่อง + องศาเอียงสลับซ้ายขวา
ORDER = [("S__15278085_0", -2.5), ("S__15278086_0", 2.0), ("S__15278087_0", -1.8),
         ("S__15278089_0", 2.4), ("S__15278092_0", -2.2), ("S__15278088_0", 1.6),
         ("S__15278090_0", -2.0), ("S__15278091_0", 2.2)]

segs = []
for i, (name, ang) in enumerate(ORDER):
    frame = f"{SCRATCH}/pf{i}.png"
    subprocess.run(["swift", "polaroid.swift", f"{DL}/{name}.jpg", frame, str(ang)],
                   check=True, cwd=SCRATCH, capture_output=True)
    seg = f"{SCRATCH}/bd2seg{i}.mp4"
    segs.append(seg)
    # ซูมสลับเข้า-ออก ให้มีชีวิตแต่ไม่หวือหวา
    if i % 2 == 0:
        zexpr = "zoom+0.0008"
    else:
        zexpr = "if(eq(on,0),1.07,max(zoom-0.0008,1.0))"
    fc = (f"[0:v]scale=1080:1920,zoompan=z='{zexpr}':d=1:"
          "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,"
          "eq=saturation=1.06:contrast=1.04:brightness=0.01,"
          "vignette=PI/4.5,"
          "noise=alls=7:allf=t+u,"
          f"fade=t=in:st=0:d={FADE}:color=white,"
          f"fade=t=out:st={DUR - FADE}:d={FADE}:color=white,format=yuv420p[out]")
    subprocess.run(["ffmpeg", "-y", "-v", "error",
                    "-loop", "1", "-framerate", "30", "-t", str(DUR), "-i", frame,
                    "-filter_complex", fc, "-map", "[out]",
                    "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                    "-r", "30", "-an", seg], check=True)
    print(f"ท่อน {i+1}/8 เสร็จ ({name})")

with open(f"{SCRATCH}/bd2list.txt", "w") as f:
    for s in segs:
        f.write(f"file '{s}'\n")
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
                "-i", f"{SCRATCH}/bd2list.txt", "-c", "copy", OUT], check=True)
print("เสร็จ:", OUT)

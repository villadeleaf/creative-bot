#!/usr/bin/env python3
# สร้างคำสั่ง ffmpeg ตัด jump cut จากผล silencedetect
import re, subprocess, sys

SRC = "/Users/greece/Downloads/807078053.923696.mp4"
OUT = "/Users/greece/Desktop/คลิปตัดแล้ว-demo.mp4"
DUR = 201.74
PAD = 0.12          # เผื่อหัวท้ายแต่ละท่อนพูด กันตัดคำขาด
MIN_SEG = 0.25      # ท่อนพูดสั้นกว่านี้ = เศษเสียง ตัดทิ้ง

sil = []
with open("/tmp/sil2.txt") as f:
    start = None
    for line in f:
        m = re.search(r"silence_start: ([\d.]+)", line)
        if m: start = float(m.group(1)); continue
        m = re.search(r"silence_end: ([\d.]+)", line)
        if m and start is not None:
            sil.append((start, float(m.group(1)))); start = None
    if start is not None:
        sil.append((start, DUR))

# ช่วงพูด = ระหว่างช่วงเงียบ
keep, pos = [], 0.0
for s, e in sil:
    a, b = pos, s
    a2, b2 = max(0, a - PAD), min(DUR, b + PAD)
    if b2 - a2 >= MIN_SEG:
        keep.append((a2, b2))
    pos = e
if DUR - pos >= MIN_SEG:
    keep.append((max(0, pos - PAD), DUR))

total = sum(b - a for a, b in keep)
print(f"ท่อนพูดที่เก็บ: {len(keep)} ท่อน รวม {total:.1f} วิ (จากเดิม {DUR:.1f} วิ)")

vparts, aparts, fc = [], [], []
for i, (a, b) in enumerate(keep):
    fc.append(f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS[v{i}];")
    fc.append(f"[0:a]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS[a{i}];")
    vparts.append(f"[v{i}]"); aparts.append(f"[a{i}]")
fc.append("".join(f"{v}{a}" for v, a in zip(vparts, aparts)) + f"concat=n={len(keep)}:v=1:a=1[outv][outa]")

cmd = ["ffmpeg", "-y", "-v", "error", "-i", SRC,
       "-filter_complex", "".join(fc),
       "-map", "[outv]", "-map", "[outa]",
       "-c:v", "libx264", "-crf", "20", "-preset", "medium",
       "-c:a", "aac", "-b:a", "128k", OUT]
subprocess.run(cmd, check=True)
print("เสร็จ:", OUT)

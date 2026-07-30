#!/usr/bin/env python3
# IG Story วันเกิด — Y2K Digicam Edition (G1 กล้องดิจิเก่า + G3 กลิตช์ + G5 ขีดเขียนมือ)
# โครง: รูปเต็มจอตัดรัวๆ · กลิตช์ตอนเปลี่ยนรูป · REC+วันที่+เส้นสแกน · ดูเดิลสลับ
import subprocess, os

SCRATCH = "/private/tmp/claude-501/-Users-greece-----adv/3d55cd3d-3091-46a0-9c4c-841b1cf85a3c/scratchpad"
DL = os.path.expanduser("~/Downloads")
OUT = "/Users/greece/Desktop/สตอรี่วันเกิดแฟน-genz.mp4"

PHOTOS = ["S__15278085_0.jpg", "S__15278086_0.jpg", "S__15278087_0.jpg",
          "S__15278089_0.jpg", "S__15278092_0.jpg",
          "LINE_ALBUM_🐷_260730_1.jpg", "LINE_ALBUM_🐷_260730_2.jpg",
          "LINE_ALBUM_🐷_260730_3.jpg", "LINE_ALBUM_Meepooh_260730_2.jpg",
          "S__15278088_0.jpg", "LINE_ALBUM_Meepooh_260730_1.jpg",
          "S__15278090_0.jpg", "S__15278091_0.jpg"]
DUR_FIRST, DUR_MID, DUR_LAST, GLITCH = 1.6, 1.25, 2.4, 0.14
HILITE = {8: 1.6, 11: 1.6}  # รูปเซลฟี่ดอกไม้ + พลุไฟใบแรก อยู่นานพิเศษ

subprocess.run(["swift", "genz_assets.swift", SCRATCH],
               check=True, cwd=SCRATCH, capture_output=True)
print("ของตกแต่งครบ")

FILL = ("scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,setsar=1")
DIGI = "eq=contrast=1.17:saturation=1.28:brightness=0.03"  # ลุคแฟลชกล้องดิจิ

segs = []
for i, name in enumerate(PHOTOS):
    photo = f"{DL}/{name}"
    d = DUR_FIRST if i == 0 else (DUR_LAST if i == len(PHOTOS) - 1 else HILITE.get(i, DUR_MID))

    # ---- ท่อนรูปหลัก: crop เต็มจอ + ซูมไวๆ + ลุคดิจิแคม ----
    seg = f"{SCRATCH}/gz{i}.mp4"
    fc = (f"[0:v]{FILL},zoompan=z='zoom+0.0016':d=1:"
          "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,"
          f"{DIGI},format=yuv420p[out]")
    subprocess.run(["ffmpeg", "-y", "-v", "error",
                    "-loop", "1", "-framerate", "30", "-t", str(d), "-i", photo,
                    "-filter_complex", fc, "-map", "[out]",
                    "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                    "-r", "30", "-an", seg], check=True)
    segs.append(seg)

    # ---- ท่อนกลิตช์ (ยกเว้นหลังรูปสุดท้าย): รูปถัดไปแตกๆ 0.14 วิ ----
    if i < len(PHOTOS) - 1:
        nxt = f"{DL}/{PHOTOS[i + 1]}"
        gseg = f"{SCRATCH}/gl{i}.mp4"
        fc = (f"[0:v]{FILL},"
              "rgbashift=rh=-14:bh=14:gv=8,"
              "pixelize=width=24:height=18:mode=avg,"
              "eq=contrast=1.3:saturation=1.6,"
              "noise=alls=34:allf=t,format=yuv420p[out]")
        subprocess.run(["ffmpeg", "-y", "-v", "error",
                        "-loop", "1", "-framerate", "30", "-t", str(GLITCH), "-i", nxt,
                        "-filter_complex", fc, "-map", "[out]",
                        "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                        "-r", "30", "-an", gseg], check=True)
        segs.append(gseg)
    print(f"รูป {i+1}/{len(PHOTOS)} เสร็จ")

# ---- ท้ายคลิป: จอดำ MEMORY FULL ----
END_D = 1.6
with open(f"{SCRATCH}/black.ppm", "wb") as f:
    f.write(b"P6\n1080 1920\n255\n" + b"\x00" * (1080 * 1920 * 3))
endseg = f"{SCRATCH}/gzend.mp4"
subprocess.run(["ffmpeg", "-y", "-v", "error",
                "-loop", "1", "-framerate", "30", "-t", str(END_D), "-i", f"{SCRATCH}/black.ppm",
                "-vf", "format=yuv420p", "-c:v", "libx264", "-crf", "19",
                "-preset", "medium", "-r", "30", "-an", endseg], check=True)
segs.append(endseg)

# ---- ต่อทุกท่อน ----
with open(f"{SCRATCH}/gzlist.txt", "w") as f:
    for s in segs:
        f.write(f"file '{s}'\n")
joined = f"{SCRATCH}/gzjoined.mp4"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
                "-i", f"{SCRATCH}/gzlist.txt", "-c", "copy", joined], check=True)

# ---- เลเยอร์รวม: เส้นสแกนกะพริบ + REC/วันที่ + ดูเดิลสลับ + เกรน ----
# ช่วงเวลาแต่ละรูป (สำหรับตั้งเวลาดูเดิล + จุดเริ่ม MEMORY FULL)
tt, times = 0.0, []
for i in range(len(PHOTOS)):
    d = DUR_FIRST if i == 0 else (DUR_LAST if i == len(PHOTOS) - 1 else HILITE.get(i, DUR_MID))
    times.append((tt, tt + d))
    tt += d + (GLITCH if i < len(PHOTOS) - 1 else 0)
PHOTOS_END = times[-1][1]   # จบรูปสุดท้ายจริง (รวมรูปไฮไลต์ที่ยืดเวลาแล้ว)
TOTAL = PHOTOS_END + END_D

inputs = ["-i", joined]
for n in ["scan0.png", "scan1.png", "recdate.png",
          "doodle0.png", "doodle1.png", "doodle2.png", "doodle3.png", "memfull.png"]:
    inputs += ["-loop", "1", "-framerate", "30", "-t", f"{TOTAL:.2f}", "-i", f"{SCRATCH}/{n}"]

fc = ""
for k in range(1, 9):
    fc += f"[{k}:v]format=rgba,scale=1080:1920[L{k}];"
# เส้นสแกน 2 เฟรมสลับกัน = สั่นแบบ VHS
fc += "[0:v][L1]overlay=enable='lt(mod(n,4),2)'[s1];"
fc += "[s1][L2]overlay=enable='gte(mod(n,4),2)'[s2];"
# ดูเดิลโผล่รูปเว้นรูป (สลับ 4 แบบ) กะพริบนิดๆ แบบสติกเกอร์แปะมือ
cur = "s2"
for i, (a, b) in enumerate(times):
    if i % 2 == 0:
        continue  # เว้นรูปคู่ ไม่ให้รกทุกรูป
    dd = 3 + (i // 2) % 4 + 1  # L4..L7
    fc += (f"[{cur}][L{dd}]overlay="
           f"enable='between(t,{a + 0.1:.2f},{b:.2f})*lt(mod(n,8),7)'[d{i}];")
    cur = f"d{i}"
# MEMORY FULL กะพริบบนจอดำท้ายคลิป (มุกปิดสาย Y2K)
fc += (f"[{cur}][L8]overlay="
       f"enable='between(t,{PHOTOS_END + 0.12:.2f},{TOTAL - 0.1:.2f})*lt(mod(n,10),6)'[mf];")
# REC + วันที่ (ตลอดคลิป) + เกรนฟิล์มแรงๆ + จบตัดดำแบบปิดกล้อง
fc += (f"[mf][L3]overlay[rec];"
       "[rec]noise=alls=11:allf=t+u,"
       "fade=t=in:st=0:d=0.12:color=black,"
       f"fade=t=out:st={TOTAL - 0.12:.2f}:d=0.12:color=black,format=yuv420p[out]")

subprocess.run(["ffmpeg", "-y", "-v", "error"] + inputs +
               ["-filter_complex", fc, "-map", "[out]",
                "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                "-r", "30", "-an", OUT], check=True)
print(f"เสร็จ: {OUT} ({TOTAL:.1f} วิ)")

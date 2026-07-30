#!/usr/bin/env python3
# Y2K Digicam ULTRA — ครบทุกลูกเล่น N1-N6
#  N1 โฟกัสหลุด-จับ+กรอบ AF · N2 กรอเทปย้อน REW · N3 แบตใกล้หมด
#  N4 เทปสะดุด tracking · N5 จอเล็กพรีวิว · N6 พันช์ซูมตามเสียงแชะ
import subprocess, os, struct, math, random

SCRATCH = "/private/tmp/claude-501/-Users-greece-----adv/3d55cd3d-3091-46a0-9c4c-841b1cf85a3c/scratchpad"
DL = os.path.expanduser("~/Downloads")
OUT = "/Users/greece/Desktop/สตอรี่วันเกิดแฟน-genz.mp4"
OUT_M = "/Users/greece/Desktop/สตอรี่วันเกิดแฟน-genz-มือถือ.mp4"

PHOTOS = ["S__15278085_0.jpg", "S__15278086_0.jpg", "S__15278087_0.jpg",
          "S__15278089_0.jpg", "S__15278092_0.jpg",
          "LINE_ALBUM_🐷_260730_1.jpg", "LINE_ALBUM_🐷_260730_2.jpg",
          "LINE_ALBUM_🐷_260730_3.jpg", "LINE_ALBUM_Meepooh_260730_2.jpg",
          "S__15278088_0.jpg", "LINE_ALBUM_Meepooh_260730_1.jpg",
          "S__15278090_0.jpg", "S__15278091_0.jpg"]
DUR_FIRST, DUR_MID, DUR_LAST, GLITCH = 1.6, 1.25, 2.4, 0.14
HILITE = {8: 1.6, 11: 1.6}
START_D, END_D = 1.1, 1.6
FOCUS_IDX = [8, 11]        # N1: โฟกัสหลุด-จับ
REW_AFTER = 8              # N2: กรอย้อนหลังรูปนี้ (ย้อนรูป 8→7→6)
REW_STEP, REW_N = 0.18, 3
TRACK_IDX = {3: 0.55, 6: 0.5}  # N4: เทปสะดุด (idx: จุดเริ่มในรูป)
TRACK_D = 0.18
PIP_BEFORE = [5, 10]       # N5: จอเล็กพรีวิวรูปถัดไป โผล่ท้ายรูปก่อนหน้า
PIG_WINDOWS = [5, 8]

def dur(i):
    return DUR_FIRST if i == 0 else (DUR_LAST if i == len(PHOTOS) - 1 else HILITE.get(i, DUR_MID))

subprocess.run(["swift", "genz_assets.swift", SCRATCH],
               check=True, cwd=SCRATCH, capture_output=True)
print("ของตกแต่งครบ")

FILL = ("scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,setsar=1")
DIGI = "eq=contrast=1.17:saturation=1.28:brightness=0.03"

def enc(path, t, inp, fchain):
    subprocess.run(["ffmpeg", "-y", "-v", "error",
                    "-loop", "1", "-framerate", "30", "-t", str(t), "-i", inp,
                    "-filter_complex", fchain, "-map", "[out]",
                    "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                    "-r", "30", "-an", path], check=True)

with open(f"{SCRATCH}/black.ppm", "wb") as f:
    f.write(b"P6\n1080 1920\n255\n" + b"\x00" * (1080 * 1920 * 3))

segs = []
enc(f"{SCRATCH}/uzstart.mp4", START_D, f"{SCRATCH}/black.ppm", "[0:v]format=yuv420p[out]")
segs.append(f"{SCRATCH}/uzstart.mp4")

for i, name in enumerate(PHOTOS):
    d = dur(i)
    photo = f"{DL}/{name}"
    base = (f"[0:v]{FILL},zoompan=z='zoom+0.0016':d=1:"
            "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,"
            f"{DIGI}")
    if i in FOCUS_IDX:
        # N1: เบลอ 0.5 วิแรก แล้วชัดพรึ่บ (gblur ตั้งเวลา)
        chain = base + ",gblur=sigma=13:enable='lt(t,0.32)',gblur=sigma=5:enable='between(t,0.32,0.5)',format=yuv420p[out]"
        enc(f"{SCRATCH}/uz{i}.mp4", d, photo, chain)
        segs.append(f"{SCRATCH}/uz{i}.mp4")
    elif i in TRACK_IDX:
        # N4: แบ่ง 3 ท่อน ปกติ/สะดุด/ปกติ — ช่วงสะดุดภาพเลื่อนแนวตั้ง+ซ่า
        t0 = TRACK_IDX[i]
        enc(f"{SCRATCH}/uz{i}a.mp4", t0, photo, base + ",format=yuv420p[out]")
        tr = (f"[0:v]{FILL},pad=1080:2120:0:100,"
              "crop=1080:1920:0:'100+70*sin(95*t)',"
              "rgbashift=gv=16,noise=alls=28:allf=t," + DIGI + ",format=yuv420p[out]")
        enc(f"{SCRATCH}/uz{i}b.mp4", TRACK_D, photo, tr)
        enc(f"{SCRATCH}/uz{i}c.mp4", d - t0 - TRACK_D, photo, base + ",format=yuv420p[out]")
        segs += [f"{SCRATCH}/uz{i}a.mp4", f"{SCRATCH}/uz{i}b.mp4", f"{SCRATCH}/uz{i}c.mp4"]
    else:
        enc(f"{SCRATCH}/uz{i}.mp4", d, photo, base + ",format=yuv420p[out]")
        segs.append(f"{SCRATCH}/uz{i}.mp4")

    # N2: กรอเทปย้อนหลังรูป REW_AFTER
    if i == REW_AFTER:
        for k in range(REW_N):
            src = f"{DL}/{PHOTOS[REW_AFTER - 1 - k]}"
            rw = (f"[0:v]{FILL},eq=contrast=1.1:saturation=0.7:brightness=0.06,"
                  "noise=alls=40:allf=t,format=yuv420p[out]")
            enc(f"{SCRATCH}/rew{k}.mp4", REW_STEP, src, rw)
            segs.append(f"{SCRATCH}/rew{k}.mp4")

    if i < len(PHOTOS) - 1:
        gl = (f"[0:v]{FILL},rgbashift=rh=-14:bh=14:gv=8,"
              "pixelize=width=24:height=18:mode=avg,"
              "eq=contrast=1.3:saturation=1.6,noise=alls=34:allf=t,format=yuv420p[out]")
        enc(f"{SCRATCH}/ugl{i}.mp4", GLITCH, f"{DL}/{PHOTOS[i+1]}", gl)
        segs.append(f"{SCRATCH}/ugl{i}.mp4")
    print(f"รูป {i+1}/{len(PHOTOS)}")

enc(f"{SCRATCH}/uzend.mp4", END_D, f"{SCRATCH}/black.ppm", "[0:v]format=yuv420p[out]")
segs.append(f"{SCRATCH}/uzend.mp4")
# W4: จอปิดท้าย TAPE 02
TAPE2_D = 2.3
enc(f"{SCRATCH}/uztape2.mp4", TAPE2_D, f"{SCRATCH}/black.ppm", "[0:v]format=yuv420p[out]")
segs.append(f"{SCRATCH}/uztape2.mp4")

with open(f"{SCRATCH}/uzlist.txt", "w") as f:
    for s in segs:
        f.write(f"file '{s}'\n")
joined = f"{SCRATCH}/uzjoined.mp4"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
                "-i", f"{SCRATCH}/uzlist.txt", "-c", "copy", joined], check=True)

# ---- ไทม์ไลน์ (รวม REW แทรก) ----
tt, times = START_D, []
rew_win = None
for i in range(len(PHOTOS)):
    d = dur(i)
    times.append((tt, tt + d))
    tt += d
    if i == REW_AFTER:
        rew_win = (tt, tt + REW_STEP * REW_N)
        tt += REW_STEP * REW_N
    if i < len(PHOTOS) - 1:
        tt += GLITCH
PHOTOS_END = times[-1][1]
MEM_END = PHOTOS_END + END_D
TOTAL = MEM_END + TAPE2_D

# ---- N5: ทำรูปจอเล็กพรีวิว (รูปถัดไปย่อ + ขอบขาว) ----
for j, pi in enumerate(PIP_BEFORE):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", f"{DL}/{PHOTOS[pi]}",
                    "-vf", "scale=252:-1,pad=iw+16:ih+16:8:8:white",
                    "-frames:v", "1", f"{SCRATCH}/pip{j}.png"], check=True)

# ---- เลเยอร์ภาพรวม ----
ASSETS = ["scan0.png", "scan1.png", "recdate.png", "doodle0.png", "doodle1.png",
          "doodle2.png", "doodle3.png", "memfull.png", "play.png", "pig.png",
          "af.png", "rew.png", "batt.png", "tape2.png"]
inputs = ["-i", joined]
for n in ASSETS:
    inputs += ["-loop", "1", "-framerate", "30", "-t", f"{TOTAL:.2f}", "-i", f"{SCRATCH}/{n}"]
for j in range(len(PIP_BEFORE)):
    inputs += ["-loop", "1", "-framerate", "30", "-t", f"{TOTAL:.2f}", "-i", f"{SCRATCH}/pip{j}.png"]
PIP_IN = len(ASSETS) + 1

fc = ""
for k in range(1, len(ASSETS) + 1):
    fc += f"[{k}:v]format=rgba,scale=1080:1920[L{k}];"
for j in range(len(PIP_BEFORE)):
    fc += f"[{PIP_IN + j}:v]format=rgba[P{j}];"

fc += "[0:v][L1]overlay=enable='lt(mod(n,4),2)'[s1];"
fc += "[s1][L2]overlay=enable='gte(mod(n,4),2)'[s2];"
cur = "s2"
for i, (a, b) in enumerate(times):
    if i % 2 == 0:
        continue
    dd = 3 + (i // 2) % 4 + 1
    fc += (f"[{cur}][L{dd}]overlay="
           f"enable='between(t,{a + 0.1:.2f},{b:.2f})*lt(mod(n,8),7)'[d{i}];")
    cur = f"d{i}"
# PLAY / หมู / MEMORY FULL
fc += f"[{cur}][L9]overlay=enable='between(t,0.12,{START_D - 0.06:.2f})*lt(mod(n,10),6)'[pl];"
cur = "pl"
for j, pi in enumerate(PIG_WINDOWS):
    a, b = times[pi]
    fc += f"[{cur}][L10]overlay=enable='between(t,{a + 0.15:.2f},{b:.2f})'[pg{j}];"
    cur = f"pg{j}"
# N1: กรอบ AF — กะพริบตอนหาโฟกัส แล้วค้างตอนล็อก
for j, fi in enumerate(FOCUS_IDX):
    a, _ = times[fi]
    fc += (f"[{cur}][L11]overlay="
           f"enable='between(t,{a + 0.04:.2f},{a + 0.5:.2f})*lt(mod(n,6),4)"
           f"+between(t,{a + 0.5:.2f},{a + 0.78:.2f})'[af{j}];")
    cur = f"af{j}"
# N2: ตัว ◀◀ REW
fc += f"[{cur}][L12]overlay=enable='between(t,{rew_win[0]:.2f},{rew_win[1]:.2f})'[rw];"
cur = "rw"
# N3: แบตใกล้หมด กะพริบตลอดรูปสุดท้าย
a12, _ = times[-1]
fc += f"[{cur}][L13]overlay=enable='gte(t,{a12:.2f})*lt(mod(n,8),5)'[bt];"
cur = "bt"
# MEMORY FULL กะพริบ → แล้วต่อด้วยจอ TAPE 02 (W4, ค้างนิ่งอ่านง่าย)
fc += (f"[{cur}][L8]overlay="
       f"enable='between(t,{PHOTOS_END + 0.12:.2f},{MEM_END - 0.06:.2f})*lt(mod(n,10),6)'[mf];")
cur = "mf"
fc += (f"[{cur}][L14]overlay="
       f"enable='between(t,{MEM_END + 0.15:.2f},{TOTAL - 0.15:.2f})'[t2];")
cur = "t2"
# N5: จอเล็กพรีวิว โผล่ 0.5 วิท้ายรูปก่อนหน้า
for j, pi in enumerate(PIP_BEFORE):
    _, b_prev = times[pi - 1]
    fc += (f"[{cur}][P{j}]overlay=x=790:y=1560:"
           f"enable='between(t,{b_prev - 0.5:.2f},{b_prev:.2f})'[pp{j}];")
    cur = f"pp{j}"
# N6: พันช์ซูมแวบตามเสียงแชะ (ทุกจุดเริ่มรูป)
punch = "+".join(
    f"0.03*exp(-16*(in_time-{a:.2f}))*gte(in_time,{a:.2f})" for a, _ in times)
fc += (f"[{cur}][L3]overlay[rec];"
       f"[rec]zoompan=z='1.001+{punch}':d=1:"
       "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30[zm];"
       "[zm]noise=alls=11:allf=t+u,"
       "fade=t=in:st=0:d=0.1:color=black,"
       f"fade=t=out:st={TOTAL - 0.12:.2f}:d=0.12:color=black,format=yuv420p[out]")

silent = f"{SCRATCH}/uz_silent.mp4"
subprocess.run(["ffmpeg", "-y", "-v", "error"] + inputs +
               ["-filter_complex", fc, "-map", "[out]",
                "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                "-r", "30", "-an", silent], check=True)
print("ภาพเสร็จ — ต่อด้วยเสียง")

# ---- เสียง ----
SR = 44100
N = int(TOTAL * SR) + SR // 10
buf = [0.0] * N
rng = random.Random(7)

def add_click(t, amp=0.5):
    for off, a in [(0.0, amp), (0.045, amp * 0.6)]:
        s = int((t + off) * SR)
        n = int(0.022 * SR)
        for k in range(n):
            buf[s + k] += (rng.random() * 2 - 1) * a * math.exp(-k / (0.004 * SR))

def add_buzz(t, d=0.14, amp=0.26):
    s = int(t * SR)
    n = int(d * SR)
    for k in range(n):
        v = round((rng.random() * 2 - 1) * 4) / 4
        gate = 1.0 if (k // int(0.012 * SR)) % 2 == 0 else 0.35
        buf[s + k] += v * amp * gate

def add_beep(t, freq=1150, d=0.11, amp=0.32):
    s = int(t * SR)
    n = int(d * SR)
    for k in range(n):
        env = min(1, k / (0.005 * SR)) * min(1, (n - k) / (0.02 * SR))
        buf[s + k] += math.sin(2 * math.pi * freq * k / SR) * amp * env

def add_rewind(t, d):
    # เสียงกรอเทป: วื้ดดด (สวีปเสียงสูงลงต่ำ + สั่นรัว)
    s = int(t * SR)
    n = int(d * SR)
    ph = 0.0
    for k in range(n):
        p = k / n
        f = 1600 - 900 * p
        wob = 1 + 0.35 * math.sin(2 * math.pi * 28 * k / SR)
        ph += 2 * math.pi * f * wob / SR
        env = min(1, k / (0.02 * SR)) * min(1, (n - k) / (0.04 * SR))
        buf[s + k] += (math.sin(ph) * 0.22 + (rng.random() * 2 - 1) * 0.07) * env

add_beep(0.18)
for i, (a, b) in enumerate(times):
    if i in FOCUS_IDX:
        add_beep(a + 0.1, freq=700, d=0.05, amp=0.22)   # หาโฟกัส
        add_beep(a + 0.3, freq=700, d=0.05, amp=0.22)
        add_beep(a + 0.5, freq=1250, d=0.09, amp=0.3)   # ล็อกเป้า
        add_click(a + 0.55, 0.5)
    else:
        add_click(a, 0.5 if i in (0, 12) else 0.38)
for i, (a, b) in enumerate(times):
    if i < len(PHOTOS) - 1:
        add_buzz(b if i != REW_AFTER else rew_win[1])
for i, t0 in TRACK_IDX.items():
    add_buzz(times[i][0] + t0, d=TRACK_D, amp=0.2)
add_rewind(rew_win[0], rew_win[1] - rew_win[0])
for j in range(3):
    add_beep(PHOTOS_END + 0.25 + j * 0.32, freq=880)
add_beep(MEM_END + 0.3, freq=660, d=0.14, amp=0.26)   # จอ TAPE 02 โผล่
add_beep(MEM_END + 0.5, freq=990, d=0.16, amp=0.26)

wav = f"{SCRATCH}/uz_sfx.wav"
with open(wav, "wb") as f:
    data = b"".join(struct.pack("<h", max(-32767, min(32767, int(v * 32767 * 0.9))))
                    for v in buf)
    f.write(b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " +
            struct.pack("<IHHIIHH", 16, 1, 1, SR, SR * 2, 2, 16) +
            b"data" + struct.pack("<I", len(data)) + data)
print("เสียงเสร็จ")

subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", silent, "-i", wav,
                "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest",
                "-movflags", "+faststart", OUT], check=True)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", OUT,
                "-c:v", "libx264", "-crf", "25", "-maxrate", "8M", "-bufsize", "12M",
                "-preset", "medium", "-pix_fmt", "yuv420p",
                "-c:a", "copy", "-movflags", "+faststart", OUT_M], check=True)
print(f"เสร็จ: {OUT_M} ({TOTAL:.1f} วิ)")

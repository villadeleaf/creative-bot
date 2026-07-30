// สร้างของตกแต่ง Gen Z: scanlines / rec+date / doodle 4 แบบ
// genz_assets <outdir>
import AppKit

let args = CommandLine.arguments
guard args.count >= 2 else { print("usage: genz_assets outdir"); exit(1) }
let dir = args[1]

func savePNG(_ img: NSImage, _ name: String) {
    guard let tiff = img.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let png = rep.representation(using: .png, properties: [:]) else { exit(2) }
    try! png.write(to: URL(fileURLWithPath: "\(dir)/\(name)"))
}

// ---- 1) เส้นสแกน VHS (540x960 logical → 1080x1920) ----
for (name, offset) in [("scan0.png", 0), ("scan1.png", 2)] {
    let img = NSImage(size: NSSize(width: 540, height: 960))
    img.lockFocus()
    NSColor.black.withAlphaComponent(0.13).set()
    var y = CGFloat(offset)
    while y < 960 { CGRect(x: 0, y: y, width: 540, height: 1).fill(); y += 4 }
    img.unlockFocus()
    savePNG(img, name)
}

// ---- 2) REC ● + วันที่ดิจิตอลส้ม ----
do {
    let img = NSImage(size: NSSize(width: 540, height: 960))
    img.lockFocus()
    guard let g = NSGraphicsContext.current?.cgContext else { exit(3) }
    let mono = NSFont(name: "Menlo-Bold", size: 22) ?? NSFont.boldSystemFont(ofSize: 22)
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.85)
    shadow.shadowBlurRadius = 3
    // REC มุมบนซ้าย
    NSColor(calibratedRed: 1, green: 0.2, blue: 0.2, alpha: 1).set()
    NSBezierPath(ovalIn: CGRect(x: 28, y: 960 - 74, width: 16, height: 16)).fill()
    ("REC" as NSString).draw(at: NSPoint(x: 52, y: 960 - 79),
        withAttributes: [.font: mono, .foregroundColor: NSColor.white, .shadow: shadow])
    // กรอบมุมกล้อง 4 มุม (ขาวบางๆ)
    NSColor.white.withAlphaComponent(0.85).set()
    let L: CGFloat = 26, T: CGFloat = 2.5
    for (cx, cy, sx, sy): (CGFloat, CGFloat, CGFloat, CGFloat) in
        [(20, 20, 1, 1), (520, 20, -1, 1), (20, 940, 1, -1), (520, 940, -1, -1)] {
        CGRect(x: cx, y: cy, width: sx * L, height: sy * T).fill()
        CGRect(x: cx, y: cy, width: sx * T, height: sy * L).fill()
    }
    // วันที่ส้มมุมล่างขวา — วันเกิดแฟน 31/7
    let orange = NSColor(calibratedRed: 1, green: 0.63, blue: 0.18, alpha: 1)
    ("31 07 '26" as NSString).draw(at: NSPoint(x: 540 - 150, y: 26),
        withAttributes: [.font: mono, .foregroundColor: orange, .shadow: shadow])
    _ = g
    img.unlockFocus()
    savePNG(img, "recdate.png")
}

// ---- PLAY ▶ TAPE 01 จอเปิดเทป (คู่กับ MEMORY FULL) ----
do {
    let img = NSImage(size: NSSize(width: 540, height: 960))
    img.lockFocus()
    let mono = NSFont(name: "Menlo-Bold", size: 30) ?? NSFont.boldSystemFont(ofSize: 30)
    let green = NSColor(calibratedRed: 0.35, green: 1.0, blue: 0.45, alpha: 1)
    let glow = NSShadow()
    glow.shadowColor = green.withAlphaComponent(0.8)
    glow.shadowBlurRadius = 10
    let text = "PLAY \u{25B6} TAPE 01" as NSString
    let attrs: [NSAttributedString.Key: Any] =
        [.font: mono, .foregroundColor: green, .shadow: glow]
    let size = text.size(withAttributes: attrs)
    text.draw(at: NSPoint(x: (540 - size.width) / 2, y: 480 - size.height / 2),
              withAttributes: attrs)
    // W2: คำอวยพรบรรทัดล่าง
    let mono2 = NSFont(name: "Menlo-Bold", size: 22) ?? NSFont.boldSystemFont(ofSize: 22)
    let sub = "HBD DEAR \u{2661}" as NSString
    let attrs2: [NSAttributedString.Key: Any] =
        [.font: mono2, .foregroundColor: green, .shadow: glow]
    let size2 = sub.size(withAttributes: attrs2)
    sub.draw(at: NSPoint(x: (540 - size2.width) / 2, y: 480 - size.height / 2 - 52),
             withAttributes: attrs2)
    img.unlockFocus()
    savePNG(img, "play.png")
}

// ---- W4: จอปิดท้าย TAPE 02 ----
do {
    let img = NSImage(size: NSSize(width: 540, height: 960))
    img.lockFocus()
    let green = NSColor(calibratedRed: 0.35, green: 1.0, blue: 0.45, alpha: 1)
    let glow = NSShadow()
    glow.shadowColor = green.withAlphaComponent(0.8)
    glow.shadowBlurRadius = 10
    let l1 = "HAPPY BIRTHDAY \u{2661}" as NSString
    let l2 = "SEE YOU IN TAPE 02..." as NSString
    let f1 = NSFont(name: "Menlo-Bold", size: 30) ?? NSFont.boldSystemFont(ofSize: 30)
    let f2 = NSFont(name: "Menlo-Bold", size: 21) ?? NSFont.boldSystemFont(ofSize: 21)
    let a1: [NSAttributedString.Key: Any] = [.font: f1, .foregroundColor: green, .shadow: glow]
    let a2: [NSAttributedString.Key: Any] = [.font: f2, .foregroundColor: green, .shadow: glow]
    let s1 = l1.size(withAttributes: a1)
    let s2 = l2.size(withAttributes: a2)
    l1.draw(at: NSPoint(x: (540 - s1.width) / 2, y: 495), withAttributes: a1)
    l2.draw(at: NSPoint(x: (540 - s2.width) / 2, y: 445), withAttributes: a2)
    img.unlockFocus()
    savePNG(img, "tape2.png")
}

// ---- หมูน้อยแอบโผล่ 🐷 (inside joke อัลบั้มแฟน) ----
do {
    let img = NSImage(size: NSSize(width: 540, height: 960))
    img.lockFocus()
    guard let g = NSGraphicsContext.current?.cgContext else { exit(5) }
    g.saveGState()
    g.translateBy(x: 62, y: 130)
    g.rotate(by: -12 * .pi / 180)
    ("🐷" as NSString).draw(at: NSPoint(x: -22, y: -22),
        withAttributes: [.font: NSFont.systemFont(ofSize: 44)])
    g.restoreGState()
    ("✨" as NSString).draw(at: NSPoint(x: 96, y: 128),
        withAttributes: [.font: NSFont.systemFont(ofSize: 22)])
    img.unlockFocus()
    savePNG(img, "pig.png")
}

// ---- MEMORY FULL จอเขียวแบบกล้องเก่า ----
do {
    let img = NSImage(size: NSSize(width: 540, height: 960))
    img.lockFocus()
    let mono = NSFont(name: "Menlo-Bold", size: 30) ?? NSFont.boldSystemFont(ofSize: 30)
    let green = NSColor(calibratedRed: 0.35, green: 1.0, blue: 0.45, alpha: 1)
    let glow = NSShadow()
    glow.shadowColor = green.withAlphaComponent(0.8)
    glow.shadowBlurRadius = 10
    let text = "MEMORY FULL \u{25AE}\u{25AE}\u{25AE}\u{25AE}" as NSString
    let attrs: [NSAttributedString.Key: Any] =
        [.font: mono, .foregroundColor: green, .shadow: glow]
    let size = text.size(withAttributes: attrs)
    text.draw(at: NSPoint(x: (540 - size.width) / 2, y: 480 - size.height / 2),
              withAttributes: attrs)
    img.unlockFocus()
    savePNG(img, "memfull.png")
}

// ---- 3) Doodle ลายมือขาว 4 แบบ (โปร่งใส 540x960) ----
var seed: UInt64 = 99
func rnd() -> CGFloat {
    seed = seed &* 6364136223846793005 &+ 1442695040888963407
    return CGFloat((seed >> 33) % 1000) / 1000.0
}
func wobble(_ p: NSPoint) -> NSPoint {
    NSPoint(x: p.x + (rnd() - 0.5) * 4, y: p.y + (rnd() - 0.5) * 4)
}
for d in 0..<4 {
    let img = NSImage(size: NSSize(width: 540, height: 960))
    img.lockFocus()
    NSColor.white.withAlphaComponent(0.92).set()
    let path = NSBezierPath()
    path.lineWidth = 4.5
    path.lineCapStyle = .round
    switch d {
    case 0:  // ดาว 2 ดวง มุมบนขวา
        for (cx, cy, r): (CGFloat, CGFloat, CGFloat) in [(455, 800, 30), (500, 730, 18)] {
            let star = NSBezierPath(); star.lineWidth = 4.5; star.lineCapStyle = .round
            for i in 0...10 {
                let ang = CGFloat(i) * .pi / 5 - .pi / 2
                let rr = i % 2 == 0 ? r : r * 0.45
                let p = wobble(NSPoint(x: cx + rr * cos(ang), y: cy + rr * sin(ang)))
                i == 0 ? star.move(to: p) : star.line(to: p)
            }
            star.close(); star.stroke()
        }
    case 1:  // ประกายกากบาท 3 จุด ซ้าย
        for (cx, cy, r): (CGFloat, CGFloat, CGFloat) in [(70, 750, 26), (110, 660, 15), (60, 580, 10)] {
            let s = NSBezierPath(); s.lineWidth = 4.5; s.lineCapStyle = .round
            s.move(to: wobble(NSPoint(x: cx - r, y: cy))); s.line(to: wobble(NSPoint(x: cx + r, y: cy)))
            s.move(to: wobble(NSPoint(x: cx, y: cy - r))); s.line(to: wobble(NSPoint(x: cx, y: cy + r)))
            s.move(to: wobble(NSPoint(x: cx - r * 0.5, y: cy - r * 0.5))); s.line(to: wobble(NSPoint(x: cx + r * 0.5, y: cy + r * 0.5)))
            s.move(to: wobble(NSPoint(x: cx - r * 0.5, y: cy + r * 0.5))); s.line(to: wobble(NSPoint(x: cx + r * 0.5, y: cy - r * 0.5)))
            s.stroke()
        }
    case 2:  // หัวใจวาดมือ + ขีดๆ มุมล่างซ้าย
        let h = NSBezierPath(); h.lineWidth = 4.5; h.lineCapStyle = .round
        h.move(to: NSPoint(x: 80, y: 150))
        h.curve(to: NSPoint(x: 45, y: 205), controlPoint1: NSPoint(x: 78, y: 175), controlPoint2: NSPoint(x: 62, y: 210))
        h.curve(to: NSPoint(x: 80, y: 185), controlPoint1: NSPoint(x: 32, y: 200), controlPoint2: NSPoint(x: 65, y: 185))
        h.curve(to: NSPoint(x: 115, y: 205), controlPoint1: NSPoint(x: 95, y: 185), controlPoint2: NSPoint(x: 128, y: 200))
        h.curve(to: NSPoint(x: 80, y: 150), controlPoint1: NSPoint(x: 98, y: 210), controlPoint2: NSPoint(x: 82, y: 175))
        h.stroke()
        let l = NSBezierPath(); l.lineWidth = 4; l.lineCapStyle = .round
        for i in 0..<3 {
            l.move(to: wobble(NSPoint(x: 140 + CGFloat(i) * 14, y: 165)))
            l.line(to: wobble(NSPoint(x: 152 + CGFloat(i) * 14, y: 195)))
        }
        l.stroke()
    default: // วงกลมขยุกขยิก + ลูกศร มุมบนซ้าย
        let c = NSBezierPath(); c.lineWidth = 4.5; c.lineCapStyle = .round
        for i in 0...24 {
            let ang = CGFloat(i) / 24 * 2.3 * .pi
            let p = wobble(NSPoint(x: 110 + 55 * cos(ang), y: 790 + 38 * sin(ang)))
            i == 0 ? c.move(to: p) : c.line(to: p)
        }
        c.stroke()
        let a = NSBezierPath(); a.lineWidth = 4.5; a.lineCapStyle = .round
        a.move(to: NSPoint(x: 185, y: 745)); a.line(to: NSPoint(x: 235, y: 700))
        a.move(to: NSPoint(x: 235, y: 700)); a.line(to: NSPoint(x: 218, y: 712))
        a.move(to: NSPoint(x: 235, y: 700)); a.line(to: NSPoint(x: 224, y: 720))
        a.stroke()
    }
    path.stroke()
    img.unlockFocus()
    savePNG(img, "doodle\(d).png")
}
// ---- กรอบโฟกัส AF เขียว (กลางจอ) ----
do {
    let img = NSImage(size: NSSize(width: 540, height: 960))
    img.lockFocus()
    let green = NSColor(calibratedRed: 0.35, green: 1.0, blue: 0.45, alpha: 0.95)
    green.set()
    let cx: CGFloat = 270, cy: CGFloat = 470, half: CGFloat = 95
    let L: CGFloat = 26, T: CGFloat = 3
    for (sx, sy): (CGFloat, CGFloat) in [(1, 1), (-1, 1), (1, -1), (-1, -1)] {
        CGRect(x: cx - sx * half, y: cy - sy * half,
               width: sx * L, height: sy * T).fill()
        CGRect(x: cx - sx * half, y: cy - sy * half,
               width: sx * T, height: sy * L).fill()
    }
    let mono = NSFont(name: "Menlo-Bold", size: 18) ?? NSFont.boldSystemFont(ofSize: 18)
    ("AF" as NSString).draw(at: NSPoint(x: cx + half - 30, y: cy + half + 8),
        withAttributes: [.font: mono, .foregroundColor: green])
    img.unlockFocus()
    savePNG(img, "af.png")
}

// ---- ◀◀ REW (มุมบนขวา) ----
do {
    let img = NSImage(size: NSSize(width: 540, height: 960))
    img.lockFocus()
    let mono = NSFont(name: "Menlo-Bold", size: 24) ?? NSFont.boldSystemFont(ofSize: 24)
    let green = NSColor(calibratedRed: 0.35, green: 1.0, blue: 0.45, alpha: 1)
    let glow = NSShadow()
    glow.shadowColor = green.withAlphaComponent(0.8)
    glow.shadowBlurRadius = 8
    ("\u{25C0}\u{25C0} REW" as NSString).draw(at: NSPoint(x: 540 - 140, y: 960 - 80),
        withAttributes: [.font: mono, .foregroundColor: green, .shadow: glow])
    img.unlockFocus()
    savePNG(img, "rew.png")
}

// ---- แบตใกล้หมด (แดง มุมบนขวา) ----
do {
    let img = NSImage(size: NSSize(width: 540, height: 960))
    img.lockFocus()
    let red = NSColor(calibratedRed: 1, green: 0.25, blue: 0.25, alpha: 0.95)
    red.set()
    let bx: CGFloat = 540 - 78, by: CGFloat = 960 - 76
    NSBezierPath(rect: CGRect(x: bx, y: by, width: 44, height: 20)).stroke()
    CGRect(x: bx + 44, y: by + 6, width: 5, height: 8).fill()   // หัวแบต
    CGRect(x: bx + 3, y: by + 3, width: 9, height: 14).fill()   // ขีดเดียว = ใกล้หมด
    img.unlockFocus()
    savePNG(img, "batt.png")
}
print("ok assets")

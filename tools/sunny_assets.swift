// ของตกแต่ง Sunny Day: ลำแสงทอง + สติกเกอร์แฮปปี้ 3 ชุด
// sunny_assets <outdir>
import AppKit

let args = CommandLine.arguments
guard args.count >= 2 else { print("usage: sunny_assets outdir"); exit(1) }
let dir = args[1]

func savePNG(_ img: NSImage, _ name: String) {
    guard let tiff = img.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let png = rep.representation(using: .png, properties: [:]) else { exit(2) }
    try! png.write(to: URL(fileURLWithPath: "\(dir)/\(name)"))
}

// ---- ลำแสงแดดทองเฉียงๆ (แถบกว้างขอบฟุ้ง) 500x1400 logical ----
do {
    let W: CGFloat = 500, H: CGFloat = 1400
    let img = NSImage(size: NSSize(width: W, height: H))
    img.lockFocus()
    guard let g = NSGraphicsContext.current?.cgContext else { exit(3) }
    g.translateBy(x: W / 2, y: H / 2)
    g.rotate(by: 18 * .pi / 180)
    let grad = NSGradient(colorsAndLocations:
        (NSColor(calibratedRed: 1, green: 0.85, blue: 0.55, alpha: 0.0), 0.0),
        (NSColor(calibratedRed: 1, green: 0.82, blue: 0.45, alpha: 0.38), 0.35),
        (NSColor(calibratedRed: 1, green: 0.95, blue: 0.75, alpha: 0.55), 0.5),
        (NSColor(calibratedRed: 1, green: 0.82, blue: 0.45, alpha: 0.38), 0.65),
        (NSColor(calibratedRed: 1, green: 0.85, blue: 0.55, alpha: 0.0), 1.0))!
    grad.draw(in: CGRect(x: -160, y: -H, width: 320, height: H * 2), angle: 0)
    img.unlockFocus()
    savePNG(img, "sunbeam.png")
}

// ---- สติกเกอร์แฮปปี้ 3 ชุด (540x960 logical โปร่งใส) ----
let sets: [[(String, CGFloat, CGFloat, CGFloat, CGFloat)]] = [
    // (อิโมจิ, x, y, ขนาด, องศา)
    [("🌼", 440, 810, 52, -12), ("🌼", 490, 750, 34, 15), ("✨", 40, 180, 40, 0)],
    [("😊", 40, 800, 48, -10), ("✨", 470, 760, 42, 0), ("🌞", 450, 150, 50, 12)],
    [("🫶", 445, 795, 48, 10), ("🌼", 45, 170, 44, -14), ("✨", 90, 250, 30, 0)],
]
for (i, set) in sets.enumerated() {
    let img = NSImage(size: NSSize(width: 540, height: 960))
    img.lockFocus()
    guard let g = NSGraphicsContext.current?.cgContext else { exit(4) }
    for (emo, x, y, size, rot) in set {
        g.saveGState()
        g.translateBy(x: x, y: y)
        g.rotate(by: rot * .pi / 180)
        (emo as NSString).draw(at: NSPoint(x: -size / 2, y: -size / 2),
            withAttributes: [.font: NSFont.systemFont(ofSize: size)])
        g.restoreGState()
    }
    img.unlockFocus()
    savePNG(img, "stick\(i).png")
}
print("ok sunny assets")

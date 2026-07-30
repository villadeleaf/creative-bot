// สร้างเลเยอร์ตกแต่งพื้นใส: confetti (เศษกระดาษสี) หรือ hearts (หัวใจอิโมจิ)
// layer <confetti|hearts> <out.png> <seed>
import AppKit

let args = CommandLine.arguments
guard args.count >= 4 else { print("usage: layer confetti|hearts out.png seed"); exit(1) }
let mode = args[1], outPath = args[2]
var seed = UInt64(args[3]) ?? 1

func rnd() -> CGFloat {  // สุ่มแบบกำหนด seed ได้
    seed = seed &* 6364136223846793005 &+ 1442695040888963407
    return CGFloat((seed >> 33) % 10000) / 10000.0
}

let W: CGFloat = 620, H: CGFloat = 1200   // logical (x2 = 1240x2400)
let img = NSImage(size: NSSize(width: W, height: H))
img.lockFocus()
guard let g = NSGraphicsContext.current?.cgContext else { exit(2) }

if mode == "confetti" {
    let colors: [NSColor] = [
        NSColor(calibratedRed: 0.98, green: 0.55, blue: 0.65, alpha: 0.95),
        NSColor(calibratedRed: 0.99, green: 0.80, blue: 0.35, alpha: 0.95),
        NSColor(calibratedRed: 0.55, green: 0.85, blue: 0.70, alpha: 0.95),
        NSColor(calibratedRed: 0.55, green: 0.75, blue: 0.97, alpha: 0.95),
        NSColor(calibratedRed: 0.80, green: 0.62, blue: 0.95, alpha: 0.95),
        NSColor(calibratedRed: 0.99, green: 0.65, blue: 0.45, alpha: 0.95),
    ]
    for _ in 0..<30 {
        let x = rnd() * W, y = rnd() * H
        let s = 7 + rnd() * 11
        g.saveGState()
        g.translateBy(x: x, y: y)
        g.rotate(by: rnd() * .pi)
        colors[Int(rnd() * 6) % 6].set()
        if rnd() < 0.35 {
            NSBezierPath(ovalIn: CGRect(x: -s/2, y: -s/2, width: s, height: s)).fill()
        } else {
            CGRect(x: -s/2, y: -s/4, width: s, height: s/2).fill()
        }
        g.restoreGState()
    }
} else {
    let hearts = ["💗", "💕", "❤️", "🩷", "💖"]
    for _ in 0..<13 {
        let x = rnd() * (W - 60), y = rnd() * H
        let size = 18 + rnd() * 26
        let alpha = 0.55 + rnd() * 0.45
        let str = hearts[Int(rnd() * 5) % 5] as NSString
        g.saveGState()
        g.setAlpha(alpha)
        str.draw(at: NSPoint(x: x, y: y),
                 withAttributes: [.font: NSFont.systemFont(ofSize: size)])
        g.restoreGState()
    }
}

img.unlockFocus()
guard let tiff = img.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:]) else { exit(3) }
try! png.write(to: URL(fileURLWithPath: outPath))
print("ok")

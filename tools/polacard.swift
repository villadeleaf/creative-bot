// การ์ดโพลารอยด์พื้นใส (สำหรับเอาไปร่อนซ้อนกันใน ffmpeg)
// polacard <in.jpg> <out.png> <องศาเอียง> [เบอร์เทปกาว -1=ไม่ติด]
import AppKit

let args = CommandLine.arguments
guard args.count >= 4 else { print("usage: polacard in.jpg out.png angle [tape]"); exit(1) }
let inPath = args[1], outPath = args[2]
let angle = CGFloat(Double(args[3]) ?? 0)
let tapeIdx = args.count >= 5 ? Int(args[4]) ?? -1 : -1

guard let src = NSImage(contentsOfFile: inPath),
      let srcTiff = src.tiffRepresentation,
      let srcRep = NSBitmapImageRep(data: srcTiff),
      let srcCG = srcRep.cgImage else { exit(2) }
let sw = CGFloat(srcCG.width), sh = CGFloat(srcCG.height)

let cardW: CGFloat = 300
let photoW = cardW - 32
let photoH = photoW * (sh / sw)
let cardH = photoH + 16 + 58
// เผื่อขอบรอบการ์ดให้เงา+การหมุนไม่โดนตัด
let W = cardW + 170, H = cardH + 170

let img = NSImage(size: NSSize(width: W, height: H))
img.lockFocus()
guard let g = NSGraphicsContext.current?.cgContext else { exit(3) }

g.translateBy(x: W / 2, y: H / 2)
g.rotate(by: angle * .pi / 180)

g.setShadow(offset: CGSize(width: 0, height: -9), blur: 30,
            color: NSColor.black.withAlphaComponent(0.5).cgColor)
let cardRect = CGRect(x: -cardW / 2, y: -cardH / 2, width: cardW, height: cardH)
NSColor(calibratedWhite: 0.99, alpha: 1).set()
NSBezierPath(roundedRect: cardRect, xRadius: 7, yRadius: 7).fill()
g.setShadow(offset: .zero, blur: 0, color: nil)

let photoRect = CGRect(x: -photoW / 2, y: cardRect.minY + 42,
                       width: photoW, height: photoH)
g.saveGState()
NSBezierPath(rect: photoRect).addClip()
g.draw(srcCG, in: photoRect)
g.restoreGState()

// ---- เทปกาว washi พาสเทล ----
if tapeIdx >= 0 {
    let tapeColors: [NSColor] = [
        NSColor(calibratedRed: 0.97, green: 0.71, blue: 0.77, alpha: 0.8),  // ชมพู
        NSColor(calibratedRed: 0.71, green: 0.89, blue: 0.78, alpha: 0.8),  // มินต์
        NSColor(calibratedRed: 0.97, green: 0.89, blue: 0.63, alpha: 0.8),  // เหลือง
        NSColor(calibratedRed: 0.80, green: 0.74, blue: 0.94, alpha: 0.8),  // ม่วงลาเวนเดอร์
        NSColor(calibratedRed: 0.72, green: 0.86, blue: 0.95, alpha: 0.8),  // ฟ้า
    ]
    let color = tapeColors[tapeIdx % tapeColors.count]
    func drawTape(cx: CGFloat, cy: CGFloat, rot: CGFloat) {
        g.saveGState()
        g.translateBy(x: cx, y: cy)
        g.rotate(by: rot * .pi / 180)
        color.set()
        CGRect(x: -46, y: -14, width: 92, height: 28).fill()
        g.restoreGState()
    }
    if tapeIdx % 2 == 0 {
        // เทปเดี่ยวกลางขอบบน
        drawTape(cx: 0, cy: cardRect.maxY - 4, rot: -4)
    } else {
        // เทปสองมุมทแยง
        drawTape(cx: cardRect.minX + 14, cy: cardRect.maxY - 12, rot: -45)
        drawTape(cx: cardRect.maxX - 14, cy: cardRect.maxY - 12, rot: 45)
    }
}

img.unlockFocus()
guard let tiff = img.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:]) else { exit(4) }
try! png.write(to: URL(fileURLWithPath: outPath))
print("ok \(Int(W))x\(Int(H))")

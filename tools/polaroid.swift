// ประกอบเฟรมโพลารอยด์ 1080x1920: พื้นหลัง = รูปเดิมเบลอ+มืดลงนิด,
// การ์ดโพลารอยด์ขาวขอบมน + เงา + รูปข้างใน, เอียงตามองศาที่สั่ง
import AppKit
import CoreImage

let args = CommandLine.arguments
// polaroid <in.jpg> <out.png> <องศาเอียง>
guard args.count >= 4 else { print("usage: polaroid in.jpg out.png angle"); exit(1) }
let inPath = args[1], outPath = args[2]
let angle = CGFloat(Double(args[3]) ?? 0)

let W: CGFloat = 540, H: CGFloat = 960  // logical (Retina 2x → 1080x1920 จริง)

guard let src = NSImage(contentsOfFile: inPath),
      let srcTiff = src.tiffRepresentation,
      let srcRep = NSBitmapImageRep(data: srcTiff),
      let srcCG = srcRep.cgImage else { exit(2) }
let sw = CGFloat(srcCG.width), sh = CGFloat(srcCG.height)

// ---- เบลอพื้นหลังด้วย CoreImage ----
let ci = CIImage(cgImage: srcCG)
let blur = CIFilter(name: "CIGaussianBlur")!
blur.setValue(ci.clampedToExtent(), forKey: kCIInputImageKey)
blur.setValue(40, forKey: kCIInputRadiusKey)
let ctx = CIContext()
let blurred = ctx.createCGImage(blur.outputImage!.cropped(to: ci.extent), from: ci.extent)!

let img = NSImage(size: NSSize(width: W, height: H))
img.lockFocus()
guard let g = NSGraphicsContext.current?.cgContext else { exit(3) }

// พื้นหลัง: เบลอเต็มจอแบบ cover + ผ้ามืดบางๆ
let coverScale = max(W / sw, H / sh)
let bw = sw * coverScale, bh = sh * coverScale
g.draw(blurred, in: CGRect(x: (W - bw) / 2, y: (H - bh) / 2, width: bw, height: bh))
NSColor.black.withAlphaComponent(0.18).set()
CGRect(x: 0, y: 0, width: W, height: H).fill()

// ---- การ์ดโพลารอยด์ ----
let cardW: CGFloat = 400
let photoW = cardW - 36                    // ขอบข้าง 18
let photoH = photoW * (sh / sw)
let cardH = photoH + 18 + 78               // ขอบบน 18 + คางล่างหนาแบบโพลารอยด์

g.saveGState()
g.translateBy(x: W / 2, y: H / 2)
g.rotate(by: angle * .pi / 180)

// เงานุ่ม
g.setShadow(offset: CGSize(width: 0, height: -10), blur: 34,
            color: NSColor.black.withAlphaComponent(0.45).cgColor)
let cardRect = CGRect(x: -cardW / 2, y: -cardH / 2, width: cardW, height: cardH)
let card = NSBezierPath(roundedRect: cardRect, xRadius: 8, yRadius: 8)
NSColor(calibratedWhite: 0.99, alpha: 1).set()
card.fill()
g.setShadow(offset: .zero, blur: 0, color: nil)

// รูปในการ์ด (ชิดบน เว้นคางล่าง)
let photoRect = CGRect(x: -photoW / 2, y: cardRect.minY + 60,
                       width: photoW, height: photoH)
NSBezierPath(rect: photoRect).addClip()
g.draw(srcCG, in: photoRect)
g.restoreGState()

img.unlockFocus()
guard let tiff = img.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:]) else { exit(4) }
try! png.write(to: URL(fileURLWithPath: outPath))
print("ok \(outPath)")

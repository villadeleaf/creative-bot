// วาดซับไทยเป็น PNG พื้นใส (ตัวหนังสือขาว ขอบดำ) ขนาด 540xH
import AppKit

let args = CommandLine.arguments
// subimg <out.png> <text (ใช้ | คั่นบรรทัด)> [ขนาดฟอนต์เริ่มต้น]
guard args.count >= 3 else { print("usage: subimg out.png text [size]"); exit(1) }
let outPath = args[1]
let lines = args[2].components(separatedBy: "|")

let W = 540
// ย่อฟอนต์อัตโนมัติจนบรรทัดที่ยาวสุดพอดีจอ (เผื่อขอบ 24px)
var fontSize: CGFloat = args.count >= 4 ? CGFloat(Double(args[3]) ?? 26) : 26
func fontAt(_ s: CGFloat) -> NSFont {
    NSFont(name: "Thonburi-Bold", size: s) ?? NSFont.boldSystemFont(ofSize: s)
}
while fontSize > 14 {
    let f = fontAt(fontSize)
    let maxW = lines.map { ($0 as NSString).size(withAttributes: [.font: f]).width }.max() ?? 0
    if maxW <= CGFloat(W - 24) { break }
    fontSize -= 1
}
let font = fontAt(fontSize)
let lineH = fontSize * 1.5
let H = Int(lineH * CGFloat(lines.count) + 20)

let img = NSImage(size: NSSize(width: W, height: H))
img.lockFocus()
NSColor.clear.set()
NSRect(x: 0, y: 0, width: W, height: H).fill()

let shadow = NSShadow()
shadow.shadowColor = NSColor.black.withAlphaComponent(0.9)
shadow.shadowBlurRadius = 3
shadow.shadowOffset = NSSize(width: 0, height: -1)

let para = NSMutableParagraphStyle()
para.alignment = .center

for (i, line) in lines.enumerated() {
    let y = CGFloat(H) - lineH * CGFloat(i + 1) - 10
    let rect = NSRect(x: 0, y: y, width: CGFloat(W), height: lineH)
    // ขอบดำ (stroke) วาดก่อน
    let strokeAttrs: [NSAttributedString.Key: Any] = [
        .font: font, .paragraphStyle: para, .shadow: shadow,
        .strokeColor: NSColor.black, .strokeWidth: 6.0,
        .foregroundColor: NSColor.black,
    ]
    (line as NSString).draw(in: rect, withAttributes: strokeAttrs)
    // เนื้อขาวทับ
    let fillAttrs: [NSAttributedString.Key: Any] = [
        .font: font, .paragraphStyle: para,
        .foregroundColor: NSColor.white,
    ]
    (line as NSString).draw(in: rect, withAttributes: fillAttrs)
}
img.unlockFocus()

guard let tiff = img.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:]) else { exit(2) }
try! png.write(to: URL(fileURLWithPath: outPath))
print("ok \(outPath) \(W)x\(H)")

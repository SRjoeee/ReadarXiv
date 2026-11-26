// The PDF download's selection, as macOS Preview makes it (lab/pdf/README.md, "The PDF download's selection"): PDFKit's own
// selection geometry on a page of a file, the page drawn by CoreGraphics with each selection line's box over it (red) and each
// character's box (blue), and the same as JSON (the page's box, its string, its lines and their text, each character and its
// box), and the page as drawn in grey beside the JSON (<out.json>.pgm). Build: swiftc -O -o <bin> lab/pdf/spikes/export-selection.swift (macOS).
//   <bin> page <pdf> <page> <dpi> <out.png> <out.json>                    the page selected whole
//   <bin> drag <pdf> <page> <dpi> <out.png> <out.json> <x0> <y0> <x1> <y1>  a drag from (x0,y0) to (x1,y1), PDF points
import AppKit
import CoreGraphics
import Foundation
import PDFKit
let a = CommandLine.arguments
let doc = PDFDocument(url: URL(fileURLWithPath: a[2]))!
let page = doc.page(at: Int(a[3])! - 1)!
let k = Double(a[4])! / 72
let box = page.bounds(for: .mediaBox)
let w = Int((box.width * k).rounded(.up)), h = Int((box.height * k).rounded(.up))
let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.setFillColor(CGColor(gray: 1, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
ctx.saveGState()
ctx.scaleBy(x: k, y: k)
ctx.translateBy(x: -box.minX, y: -box.minY)
ctx.drawPDFPage(page.pageRef!)
ctx.restoreGState()
// (the page as drawn, before any box: grey, beside the JSON as <out.json>.pgm, for export-selection.py's ink)
do {
  let g = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)!
  g.draw(ctx.makeImage()!, in: CGRect(x: 0, y: 0, width: w, height: h))
  var pgm = Data("P5\n\(w) \(h)\n255\n".utf8)
  pgm.append(g.data!.assumingMemoryBound(to: UInt8.self), count: w * h)
  try! pgm.write(to: URL(fileURLWithPath: a[6] + ".pgm"))
}
func rect(_ r: CGRect) -> CGRect { CGRect(x: (r.minX - box.minX) * k, y: (r.minY - box.minY) * k, width: r.width * k, height: r.height * k) }
let sel: PDFSelection? = a[1] == "drag"
  ? page.selection(from: CGPoint(x: Double(a[7])!, y: Double(a[8])!), to: CGPoint(x: Double(a[9])!, y: Double(a[10])!))
  : page.selection(for: box)
var lines: [[String: Any]] = []
for l in sel?.selectionsByLine() ?? [] {
  let b = l.bounds(for: page)
  lines.append(["box": [b.minX, b.minY, b.maxX, b.maxY], "text": l.string ?? ""])
  ctx.setFillColor(CGColor(red: 1, green: 0, blue: 0, alpha: 0.12))
  ctx.fill(rect(b))
  ctx.setStrokeColor(CGColor(red: 0.9, green: 0, blue: 0, alpha: 0.8))
  ctx.setLineWidth(1)
  ctx.stroke(rect(b))
}
var chars: [[String: Any]] = []
let text = (page.string ?? "") as NSString
if a[1] == "page" {
  // (each character of the page's string as PDFKit selects it: its text and its box; a character PDFKit inserts between pieces,
  // a space or a line's end, has no box)
  for i in 0..<text.length {
    guard let s = page.selection(for: NSRange(location: i, length: 1)) else { continue }
    let b = s.bounds(for: page)
    chars.append(["i": i, "c": s.string ?? "", "box": [b.minX, b.minY, b.maxX, b.maxY]])
    if b.width > 0 && b.height > 0 {
      ctx.setStrokeColor(CGColor(red: 0, green: 0.3, blue: 1, alpha: 0.55))
      ctx.setLineWidth(0.5)
      ctx.stroke(rect(b))
    }
  }
}
let img = ctx.makeImage()!
let rep = NSBitmapImageRep(cgImage: img)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[5]))
let out: [String: Any] = ["page": Int(a[3])!, "box": [box.minX, box.minY, box.maxX, box.maxY], "string": sel?.string ?? "", "lines": lines, "chars": chars]
try! JSONSerialization.data(withJSONObject: out, options: []).write(to: URL(fileURLWithPath: a[6]))

// Exports SF Symbols as PNG masks (black on transparent) plus their sizes, so the HTML
// scenes can draw the app's real icons. Usage: swift export-symbols.swift <outDir>
import AppKit

let out = URL(fileURLWithPath: CommandLine.arguments[1])
let weights: [String: NSFont.Weight] = ["regular": .regular, "medium": .medium, "semibold": .semibold, "bold": .bold, "heavy": .heavy]
let symbols: [(String, String)] = [
    ("checkmark", "heavy"), ("checkmark", "semibold"), ("plus", "bold"), ("plus", "heavy"), ("ellipsis", "bold"),
    ("chevron.left", "semibold"), ("chevron.left", "bold"), ("chevron.right", "bold"), ("xmark", "bold"),
    ("clock", "bold"), ("minus", "bold"), ("minus", "heavy"), ("calendar.badge.clock", "semibold"),
    ("circle.fill", "bold"), ("circle", "bold"), ("calendar", "medium"), ("chart.bar.fill", "medium"),
    ("bubble.left.and.text.bubble.right.fill", "medium"), ("gearshape.fill", "medium"),
    ("sparkles.rectangle.stack.fill", "regular"), ("arrow.up.right", "bold"), ("square.fill", "regular"), ("square", "regular"),
    ("checkmark.circle.fill", "regular"), ("clock.fill", "regular"), ("circle.lefthalf.filled", "regular"), ("minus.circle.fill", "regular"),
    ("wifi", "semibold"), ("battery.100percent", "regular"), ("cellularbars", "semibold"), ("sparkles", "regular"),
    ("square.and.arrow.up", "semibold"), ("lock.fill", "semibold"),
    ("arrow.up", "bold"), ("checkmark", "bold"),
]
let pointSize: CGFloat = 96
var sizes: [String: [CGFloat]] = [:]
for (name, weightName) in symbols {
    let config = NSImage.SymbolConfiguration(pointSize: pointSize, weight: weights[weightName]!)
    guard let image = NSImage(systemSymbolName: name, accessibilityDescription: nil)?.withSymbolConfiguration(config) else {
        print("missing \(name)"); continue
    }
    let size = image.size
    let scale: CGFloat = 2
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width * scale), pixelsHigh: Int(size.height * scale), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = size
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    image.draw(in: NSRect(origin: .zero, size: size))
    // Symbols draw as template images; fill with black where they have alpha.
    NSColor.black.set()
    NSRect(origin: .zero, size: size).fill(using: .sourceAtop)
    NSGraphicsContext.restoreGraphicsState()
    let key = "\(name)-\(weightName)"
    try! rep.representation(using: .png, properties: [:])!.write(to: out.appendingPathComponent("\(key).png"))
    sizes[key] = [size.width / pointSize, size.height / pointSize]
}
let json = try! JSONSerialization.data(withJSONObject: sizes, options: [.prettyPrinted, .sortedKeys])
try! json.write(to: out.appendingPathComponent("sizes.json"))
print("exported \(sizes.count)")

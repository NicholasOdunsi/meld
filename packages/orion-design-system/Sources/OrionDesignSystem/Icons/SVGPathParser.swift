import Foundation
import SwiftUI

/// Turns SVG path data (the `d` attribute) into a SwiftUI `Path`. Supports
/// every command: M L H V C S Q T A Z, absolute and relative, with implicit
/// repeats. Arcs are converted to cubic Béziers.
enum SVGPathParser {
    static func path(_ data: String) -> Path {
        var scanner = Tokens(data)
        var path = Path()
        var current = CGPoint.zero
        var start = CGPoint.zero
        var lastControl: CGPoint?
        var lastCommand: Character = " "
        var command: Character = " "

        while let next = scanner.nextCommandOrNumber() {
            if case .command(let c) = next { command = c } else { scanner.pushBack() }
            if command == " " { break }
            let relative = command.isLowercase
            let origin = relative ? current : .zero
            func point() -> CGPoint? {
                guard let x = scanner.number(), let y = scanner.number() else { return nil }
                return CGPoint(x: origin.x + x, y: origin.y + y)
            }
            switch command.uppercased().first {
            case "M":
                guard let p = point() else { return path }
                path.move(to: p); current = p; start = p
                // Extra coordinate pairs after M are implicit L commands.
                command = relative ? "l" : "L"
                lastControl = nil
            case "L":
                guard let p = point() else { return path }
                path.addLine(to: p); current = p; lastControl = nil
            case "H":
                guard let x = scanner.number() else { return path }
                current = CGPoint(x: relative ? current.x + x : x, y: current.y)
                path.addLine(to: current); lastControl = nil
            case "V":
                guard let y = scanner.number() else { return path }
                current = CGPoint(x: current.x, y: relative ? current.y + y : y)
                path.addLine(to: current); lastControl = nil
            case "C":
                guard let c1 = point(), let c2 = point(), let p = point() else { return path }
                path.addCurve(to: p, control1: c1, control2: c2)
                lastControl = c2; current = p
            case "S":
                guard let c2 = point(), let p = point() else { return path }
                let c1 = "CScs".contains(lastCommand) ? reflect(lastControl, around: current) : current
                path.addCurve(to: p, control1: c1, control2: c2)
                lastControl = c2; current = p
            case "Q":
                guard let c = point(), let p = point() else { return path }
                path.addQuadCurve(to: p, control: c)
                lastControl = c; current = p
            case "T":
                guard let p = point() else { return path }
                let c = "QTqt".contains(lastCommand) ? reflect(lastControl, around: current) : current
                path.addQuadCurve(to: p, control: c)
                lastControl = c; current = p
            case "A":
                guard let rx = scanner.number(), let ry = scanner.number(), let rotation = scanner.number(),
                      let largeArc = scanner.flag(), let sweep = scanner.flag(), let p = point() else { return path }
                addArc(to: &path, from: current, to: p, rx: rx, ry: ry, rotation: rotation, largeArc: largeArc, sweep: sweep)
                current = p; lastControl = nil
            case "Z":
                path.closeSubpath(); current = start; lastControl = nil
            default:
                return path
            }
            lastCommand = command
        }
        return path
    }

    private static func reflect(_ point: CGPoint?, around center: CGPoint) -> CGPoint {
        guard let point else { return center }
        return CGPoint(x: 2 * center.x - point.x, y: 2 * center.y - point.y)
    }

    /// SVG endpoint arc → centre parameterisation → cubic Bézier segments
    /// (SVG 1.1 implementation notes, F.6).
    private static func addArc(to path: inout Path, from p0: CGPoint, to p1: CGPoint, rx rxIn: Double, ry ryIn: Double,
                               rotation: Double, largeArc: Bool, sweep: Bool) {
        if p0 == p1 { return }
        var rx = abs(rxIn), ry = abs(ryIn)
        if rx == 0 || ry == 0 { path.addLine(to: p1); return }
        let phi = rotation * .pi / 180
        let cosPhi = cos(phi), sinPhi = sin(phi)
        let dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2
        let x1p = cosPhi * dx + sinPhi * dy
        let y1p = -sinPhi * dx + cosPhi * dy
        let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 { rx *= lambda.squareRoot(); ry *= lambda.squareRoot() }
        let numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
        let denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p
        var coefficient = (max(0, numerator / denominator)).squareRoot()
        if largeArc == sweep { coefficient = -coefficient }
        let cxp = coefficient * rx * y1p / ry
        let cyp = -coefficient * ry * x1p / rx
        let cx = cosPhi * cxp - sinPhi * cyp + (p0.x + p1.x) / 2
        let cy = sinPhi * cxp + cosPhi * cyp + (p0.y + p1.y) / 2
        func angle(_ ux: Double, _ uy: Double, _ vx: Double, _ vy: Double) -> Double {
            let a = atan2(ux * vy - uy * vx, ux * vx + uy * vy)
            return a
        }
        let theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
        var delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
        if !sweep && delta > 0 { delta -= 2 * .pi }
        if sweep && delta < 0 { delta += 2 * .pi }

        let segments = max(1, Int((abs(delta) / (.pi / 2)).rounded(.up)))
        let step = delta / Double(segments)
        let k = 4.0 / 3.0 * tan(step / 4)
        var theta = theta1
        func onEllipse(_ t: Double) -> CGPoint {
            CGPoint(x: cx + rx * cos(t) * cosPhi - ry * sin(t) * sinPhi,
                    y: cy + rx * cos(t) * sinPhi + ry * sin(t) * cosPhi)
        }
        func derivative(_ t: Double) -> CGPoint {
            CGPoint(x: -rx * sin(t) * cosPhi - ry * cos(t) * sinPhi,
                    y: -rx * sin(t) * sinPhi + ry * cos(t) * cosPhi)
        }
        for index in 0..<segments {
            let next = theta + step
            let a = onEllipse(theta), b = onEllipse(next)
            let da = derivative(theta), db = derivative(next)
            let end = index == segments - 1 ? p1 : b
            path.addCurve(to: end,
                          control1: CGPoint(x: a.x + k * da.x, y: a.y + k * da.y),
                          control2: CGPoint(x: b.x - k * db.x, y: b.y - k * db.y))
            theta = next
        }
    }
}

/// A minimal tokenizer for SVG path data.
private struct Tokens {
    enum Token { case command(Character), number }
    private let chars: [Character]
    private var index = 0
    private var lastStart = 0

    init(_ text: String) { chars = Array(text) }

    private mutating func skipSeparators() {
        while index < chars.count, chars[index] == " " || chars[index] == "," || chars[index].isNewline || chars[index] == "\t" {
            index += 1
        }
    }

    mutating func nextCommandOrNumber() -> Token? {
        skipSeparators()
        lastStart = index
        guard index < chars.count else { return nil }
        let c = chars[index]
        if c.isLetter && c != "e" && c != "E" {
            index += 1
            return .command(c)
        }
        return .number
    }

    mutating func pushBack() { index = lastStart }

    /// Arc flags are single digits and may be written with no separator ("a8,8,0,0,1,…" or "0 01").
    mutating func flag() -> Bool? {
        skipSeparators()
        guard index < chars.count, chars[index] == "0" || chars[index] == "1" else { return nil }
        defer { index += 1 }
        return chars[index] == "1"
    }

    mutating func number() -> Double? {
        skipSeparators()
        let begin = index
        if index < chars.count, chars[index] == "-" || chars[index] == "+" { index += 1 }
        var sawDot = false, sawDigit = false
        while index < chars.count {
            let c = chars[index]
            if c.isNumber { sawDigit = true; index += 1 }
            else if c == ".", !sawDot { sawDot = true; index += 1 }
            else if (c == "e" || c == "E"), sawDigit {
                index += 1
                if index < chars.count, chars[index] == "-" || chars[index] == "+" { index += 1 }
            } else { break }
        }
        guard sawDigit else { index = begin; return nil }
        return Double(String(chars[begin..<index]))
    }
}

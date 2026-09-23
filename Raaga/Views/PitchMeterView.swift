import RaagaCore
import SwiftUI

/// Big note name plus a ±50 cent needle.
struct PitchMeterView: View {
    let reading: ScaleReading?
    let notation: Notation
    let tonic: Int
    let level: Double

    private var color: Color {
        guard let r = reading else { return .secondary }
        return .accuracy(r.accuracy)
    }

    private var primaryName: String {
        guard let r = reading else { return "—" }
        switch notation {
        case .indian: return NoteNames.swara[r.semitoneFromTonic]
        case .western: return NoteNames.western(midi: r.chromaticMidi)
        }
    }

    private var secondaryLine: String {
        guard let r = reading else { return "Sing a note" }
        let other: String
        switch notation {
        case .indian: other = NoteNames.western(midi: r.chromaticMidi)
        case .western: other = NoteNames.swara[r.semitoneFromTonic]
        }
        let hz = String(format: "%.0f Hz", PitchMath.hz(fromMidi: r.midi))
        if r.isScaleTone {
            return "\(other) · \(hz)"
        } else {
            let nearest = notation == .indian
                ? NoteNames.swara[PitchMath.pitchClass(r.scaleMidi - tonic)]
                : NoteNames.western(midi: r.scaleMidi)
            return "\(other) · not in scale · nearest \(nearest)"
        }
    }

    private var cents: Double { reading?.displayCents ?? 0 }

    var body: some View {
        VStack(spacing: 10) {
            Text(primaryName)
                .font(.system(size: 72, weight: .bold, design: .rounded))
                .foregroundStyle(color)
                .frame(height: 80)
                .contentTransition(.numericText())
            Text(secondaryLine)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            needle
                .frame(height: 48)

            HStack {
                Text("♭ −50").font(.caption2).foregroundStyle(.secondary)
                Spacer()
                Text(reading == nil ? " " : String(format: "%+.0f ¢", cents))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(color)
                Spacer()
                Text("+50 ♯").font(.caption2).foregroundStyle(.secondary)
            }

            ProgressView(value: min(1, level * 6))
                .tint(.secondary)
                .frame(maxWidth: 160)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
    }

    private var needle: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let mid = w / 2
            let clamped = max(-50, min(50, cents))
            let x = mid + clamped / 50 * (w / 2 - 6)
            ZStack(alignment: .leading) {
                Capsule().fill(Color.secondary.opacity(0.15)).frame(height: 10).offset(y: 19)
                // in-tune zone (±10 cents)
                Capsule().fill(Color.green.opacity(0.25))
                    .frame(width: w / 5, height: 10)
                    .offset(x: mid - w / 10, y: 19)
                ForEach([-50.0, -25, 0, 25, 50], id: \.self) { c in
                    Rectangle().fill(Color.secondary.opacity(c == 0 ? 0.8 : 0.4))
                        .frame(width: c == 0 ? 2 : 1, height: c == 0 ? 48 : 20)
                        .offset(x: mid + c / 50 * (w / 2 - 6), y: c == 0 ? 0 : 14)
                }
                Capsule().fill(color)
                    .frame(width: 6, height: 40)
                    .offset(x: x - 3, y: 4)
                    .opacity(reading == nil ? 0 : 1)
                    .animation(.easeOut(duration: 0.1), value: x)
            }
        }
    }
}

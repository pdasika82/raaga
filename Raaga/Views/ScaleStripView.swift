import RaagaCore
import SwiftUI

/// Row of scale degrees; the one being sung lights up.
struct ScaleStripView: View {
    let scale: Scale
    let tonic: Int
    let notation: Notation
    let reading: ScaleReading?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(scale.intervals + [12], id: \.self) { st in
                    pill(for: st)
                }
            }
            .padding(.horizontal, 4)
        }
    }

    private func pill(for st: Int) -> some View {
        let pc = PitchMath.pitchClass(st)
        let isActive = reading.map { $0.isScaleTone && $0.semitoneFromTonic == pc } ?? false
        let upper = st == 12
        var name = scale.degreeName(semitone: pc, tonic: tonic, notation: notation)
        if upper { name = notation == .indian ? "Ṡ" : name + "′" }
        return Text(name)
            .font(.system(.body, design: .rounded).weight(.semibold))
            .frame(minWidth: 40, minHeight: 40)
            .background(isActive ? Color.accuracy(reading?.accuracy ?? .inTune) : Color.secondary.opacity(0.12),
                        in: RoundedRectangle(cornerRadius: 10))
            .foregroundStyle(isActive ? .white : .primary)
            .animation(.easeOut(duration: 0.08), value: isActive)
    }
}

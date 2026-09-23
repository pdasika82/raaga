import Charts
import RaagaCore
import SwiftUI

/// Pitch over time with scale degrees as horizontal guides.
struct PitchChartView: View {
    let samples: [PitchSample]
    let scale: Scale
    let tonic: Int
    let a4: Double
    let notation: Notation

    private struct Point: Identifiable {
        let id: Int
        let t: Double
        let midi: Double
        let accuracy: ScaleReading.Accuracy
    }

    private var points: [Point] {
        samples.enumerated().compactMap { i, s in
            guard s.hz > 0, s.clarity >= 0.6, s.rms >= 0.01 else { return nil }
            let m = PitchMath.midi(fromHz: s.hz, a4: a4)
            return Point(id: i, t: s.t, midi: m, accuracy: scale.reading(midi: m, tonic: tonic).accuracy)
        }
    }

    var body: some View {
        let pts = points
        let lo = (pts.map(\.midi).min() ?? 60) - 1.5
        let hi = (pts.map(\.midi).max() ?? 72) + 1.5
        let guides = (Int(lo.rounded(.down))...Int(hi.rounded(.up)))
            .filter { scale.intervalSet.contains(PitchMath.pitchClass($0 - tonic)) }

        Chart {
            ForEach(guides, id: \.self) { m in
                RuleMark(y: .value("Note", m))
                    .foregroundStyle(Color.secondary.opacity(PitchMath.pitchClass(m - tonic) == 0 ? 0.6 : 0.25))
                    .lineStyle(StrokeStyle(lineWidth: 1))
            }
            ForEach(pts) { p in
                PointMark(x: .value("Time", p.t), y: .value("Pitch", p.midi))
                    .foregroundStyle(Color.accuracy(p.accuracy))
                    .symbolSize(12)
            }
        }
        .chartYScale(domain: lo...hi)
        .chartYAxis {
            AxisMarks(values: guides) { value in
                AxisValueLabel {
                    if let m = value.as(Int.self) {
                        Text(label(m)).font(.caption2)
                    }
                }
            }
        }
        .chartXAxisLabel("seconds", alignment: .trailing)
        .frame(height: 240)
        .overlay {
            if pts.isEmpty {
                Text("No pitched singing detected").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func label(_ midi: Int) -> String {
        switch notation {
        case .indian: return NoteNames.swara[PitchMath.pitchClass(midi - tonic)]
        case .western: return NoteNames.western(midi: midi)
        }
    }
}

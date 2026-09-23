import Foundation

/// Time spent on one scale degree (or off-scale note).
public struct DegreeStat: Sendable, Identifiable, Equatable {
    public var id: Int { semitone }
    public let semitone: Int
    public let isScaleTone: Bool
    public let seconds: Double
    /// Mean signed deviation from the nearest chromatic note, in cents.
    public let meanCents: Double
    public let meanAbsCents: Double
}

/// A stretch of time where the singer held one note.
public struct NoteEvent: Sendable, Identifiable, Equatable {
    public var id: Double { start }
    public let start: Double
    public let duration: Double
    public let midi: Int
    public let semitoneFromTonic: Int
    public let isScaleTone: Bool
    public let meanCents: Double
    public let centsStdDev: Double
}

public struct PerformanceReport: Sendable, Equatable {
    public let totalSeconds: Double
    public let voicedSeconds: Double
    /// Fraction of voiced time whose nearest chromatic note is in the scale.
    public let scaleToneFraction: Double
    /// Fraction of voiced time within ±20 / ±50 cents of a scale tone.
    public let within20: Double
    public let within50: Double
    /// Mean |cents| from the nearest scale tone across voiced time.
    public let meanAbsCents: Double
    /// Mean intra-note wobble (std dev of cents) over notes held ≥ 0.6 s. nil if none.
    public let stabilityCents: Double?
    public let lowestMidi: Int?
    public let highestMidi: Int?
    public let degrees: [DegreeStat]
    public let events: [NoteEvent]

    public var hasVoice: Bool { voicedSeconds > 0.3 }

    /// 0...100 headline score weighting tuning accuracy and scale adherence.
    public var score: Int {
        guard hasVoice else { return 0 }
        let tuning = 0.6 * within20 + 0.4 * within50
        let s = 100 * (0.7 * tuning + 0.3 * scaleToneFraction)
        return Int(s.rounded())
    }
}

public enum PerformanceAnalyzer {
    public static func analyze(samples: [PitchSample], scale: Scale, tonic: Int, a4: Double,
                               minClarity: Double = 0.6, minRMS: Double = 0.01,
                               totalSeconds: Double? = nil) -> PerformanceReport {
        let hop = medianHop(samples)
        let total = totalSeconds ?? ((samples.last?.t ?? 0) + hop)

        struct Voiced {
            let t: Double
            let reading: ScaleReading
        }
        let voiced: [Voiced] = samples.compactMap { s in
            guard s.hz > 0, s.clarity >= minClarity, s.rms >= minRMS else { return nil }
            let midi = PitchMath.midi(fromHz: s.hz, a4: a4)
            return Voiced(t: s.t, reading: scale.reading(midi: midi, tonic: tonic))
        }

        guard !voiced.isEmpty else {
            return PerformanceReport(totalSeconds: total, voicedSeconds: 0, scaleToneFraction: 0, within20: 0, within50: 0,
                                     meanAbsCents: 0, stabilityCents: nil, lowestMidi: nil, highestMidi: nil, degrees: [], events: [])
        }

        let n = Double(voiced.count)
        let onScale = voiced.filter { $0.reading.isScaleTone }.count
        let w20 = voiced.filter { abs($0.reading.scaleCents) <= 20 }.count
        let w50 = voiced.filter { abs($0.reading.scaleCents) <= 50 }.count
        let meanAbs = voiced.map { abs($0.reading.scaleCents) }.reduce(0, +) / n

        // Per-degree stats
        var bySemitone: [Int: [ScaleReading]] = [:]
        for v in voiced { bySemitone[v.reading.semitoneFromTonic, default: []].append(v.reading) }
        var degrees: [DegreeStat] = []
        for st in 0..<12 {
            guard let rs = bySemitone[st], !rs.isEmpty else { continue }
            let cents = rs.map(\.chromaticCents)
            degrees.append(DegreeStat(
                semitone: st,
                isScaleTone: scale.intervalSet.contains(st),
                seconds: Double(rs.count) * hop,
                meanCents: cents.reduce(0, +) / Double(cents.count),
                meanAbsCents: cents.map(abs).reduce(0, +) / Double(cents.count)
            ))
        }

        // Note events: runs of the same chromatic note
        var events: [NoteEvent] = []
        var runStart = voiced[0].t
        var runLast = voiced[0].t
        var runMidi = voiced[0].reading.chromaticMidi
        var runCents: [Double] = [voiced[0].reading.chromaticCents]

        func flush() {
            let duration = runLast - runStart + hop
            guard duration >= 0.15 else { return }
            let mean = runCents.reduce(0, +) / Double(runCents.count)
            let variance = runCents.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / Double(runCents.count)
            let st = PitchMath.pitchClass(runMidi - tonic)
            events.append(NoteEvent(start: runStart, duration: duration, midi: runMidi, semitoneFromTonic: st,
                                    isScaleTone: scale.intervalSet.contains(st), meanCents: mean, centsStdDev: sqrt(variance)))
        }

        for v in voiced.dropFirst() {
            if v.reading.chromaticMidi == runMidi && v.t - runLast <= hop * 2.5 {
                runLast = v.t
                runCents.append(v.reading.chromaticCents)
            } else {
                flush()
                runStart = v.t
                runLast = v.t
                runMidi = v.reading.chromaticMidi
                runCents = [v.reading.chromaticCents]
            }
        }
        flush()

        let sustained = events.filter { $0.duration >= 0.6 }
        let stability = sustained.isEmpty ? nil : sustained.map(\.centsStdDev).reduce(0, +) / Double(sustained.count)

        return PerformanceReport(
            totalSeconds: total,
            voicedSeconds: n * hop,
            scaleToneFraction: Double(onScale) / n,
            within20: Double(w20) / n,
            within50: Double(w50) / n,
            meanAbsCents: meanAbs,
            stabilityCents: stability,
            lowestMidi: events.map(\.midi).min(),
            highestMidi: events.map(\.midi).max(),
            degrees: degrees,
            events: events
        )
    }

    static func medianHop(_ samples: [PitchSample]) -> Double {
        guard samples.count >= 2 else { return 0.085 }
        var gaps: [Double] = []
        gaps.reserveCapacity(samples.count)
        for i in 1..<samples.count { gaps.append(samples[i].t - samples[i - 1].t) }
        gaps.sort()
        let m = gaps[gaps.count / 2]
        return m > 0 ? m : 0.085
    }
}

// MARK: - Text rendering for the LLM and the UI

extension PerformanceReport {
    /// Plain-text summary suitable for a coach (human or model) to read.
    public func summaryText(scale: Scale, tonic: Int, maxEvents: Int = 150) -> String {
        var lines: [String] = []
        let tonicName = NoteNames.westernPitchClass(tonic)
        lines.append("Scale: \(scale.displayName). Tonic (Sa) = \(tonicName). Scale degrees: " +
                     scale.intervals.map { scale.degreeLabel(semitone: $0, tonic: tonic) }.joined(separator: " "))
        lines.append(String(format: "Recording length %.1f s, voiced (pitched singing) %.1f s.", totalSeconds, voicedSeconds))
        guard hasVoice else {
            lines.append("No pitched singing was detected.")
            return lines.joined(separator: "\n")
        }
        lines.append(String(format: "Time on scale tones: %.0f%%. Within ±20 cents of a scale tone: %.0f%%. Within ±50 cents: %.0f%%. Mean distance from nearest scale tone: %.0f cents.",
                            scaleToneFraction * 100, within20 * 100, within50 * 100, meanAbsCents))
        if let s = stabilityCents {
            lines.append(String(format: "Steadiness on held notes (average wobble): ±%.0f cents.", s))
        }
        if let lo = lowestMidi, let hi = highestMidi {
            lines.append("Range sung: \(NoteNames.western(midi: lo)) to \(NoteNames.western(midi: hi)).")
        }
        let onScale = degrees.filter(\.isScaleTone).sorted { $0.semitone < $1.semitone }
        if !onScale.isEmpty {
            lines.append("Per degree (time, average tuning; negative = flat):")
            for d in onScale {
                lines.append(String(format: "  %@: %.1f s, %+.0f cents (avg |%.0f|)",
                                    scale.degreeLabel(semitone: d.semitone, tonic: tonic), d.seconds, d.meanCents, d.meanAbsCents))
            }
        }
        let off = degrees.filter { !$0.isScaleTone && $0.seconds >= 0.25 }
        if !off.isEmpty {
            lines.append("Notes outside the scale: " + off.map {
                String(format: "%@ %.1f s", scale.degreeLabel(semitone: $0.semitone, tonic: tonic), $0.seconds)
            }.joined(separator: ", "))
        }
        if !events.isEmpty {
            lines.append("Note sequence as sung (note, duration, average tuning; * = outside the scale):")
            let shown = events.prefix(maxEvents)
            lines.append(shown.map {
                let name = NoteNames.swara[$0.semitoneFromTonic] + ($0.isScaleTone ? "" : "*")
                return String(format: "%@ %.1fs %+.0fc", name, $0.duration, $0.meanCents)
            }.joined(separator: " → "))
            if events.count > maxEvents {
                lines.append("(\(events.count - maxEvents) further notes omitted)")
            }
        }
        return lines.joined(separator: "\n")
    }

    /// Compact swara sequence for the UI, e.g. "S R G M P".
    public func noteSequence(scale: Scale, tonic: Int, notation: Notation) -> String {
        events.map { e in
            let name = scale.degreeName(semitone: e.semitoneFromTonic, tonic: tonic, notation: notation)
            return e.isScaleTone ? name : "(\(name))"
        }.joined(separator: " ")
    }
}

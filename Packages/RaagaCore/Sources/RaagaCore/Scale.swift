import Foundation

/// A scale or raga expressed as semitone offsets from the tonic (Sa).
/// Ragas with different ascending/descending forms are represented by the union of both.
public struct Scale: Identifiable, Codable, Hashable, Sendable {
    public enum Tradition: String, Codable, CaseIterable, Sendable {
        case western = "Western"
        case carnatic = "Carnatic"
        case hindustani = "Hindustani"
    }

    public let id: String
    public let name: String
    public let tradition: Tradition
    public let intervals: [Int]
    public let note: String?

    public init(id: String, name: String, tradition: Tradition, intervals: [Int], note: String? = nil) {
        self.id = id
        self.name = name
        self.tradition = tradition
        self.intervals = intervals.map(PitchMath.pitchClass).sorted()
        self.note = note
    }

    public var intervalSet: Set<Int> { Set(intervals) }

    public var displayName: String { "\(name) (\(tradition.rawValue))" }

    /// Name of the degree at `semitone` above the tonic pitch class.
    public func degreeName(semitone: Int, tonic: Int, notation: Notation) -> String {
        let st = PitchMath.pitchClass(semitone)
        switch notation {
        case .indian: return NoteNames.swara[st]
        case .western: return NoteNames.westernPitchClass(tonic + st)
        }
    }

    /// Both names, e.g. "R (D)".
    public func degreeLabel(semitone: Int, tonic: Int) -> String {
        let st = PitchMath.pitchClass(semitone)
        return "\(NoteNames.swara[st]) (\(NoteNames.westernPitchClass(tonic + st)))"
    }

    /// Analyse a sung pitch against this scale.
    public func reading(midi: Double, tonic: Int) -> ScaleReading {
        let chroma = Int(midi.rounded())
        let chromaticCents = (midi - Double(chroma)) * 100
        let st = PitchMath.pitchClass(chroma - tonic)
        let isTone = intervalSet.contains(st)

        var best = chroma
        var bestDist = Double.infinity
        for m in (chroma - 12)...(chroma + 12) where intervalSet.contains(PitchMath.pitchClass(m - tonic)) {
            let d = abs(midi - Double(m))
            if d < bestDist {
                bestDist = d
                best = m
            }
        }
        return ScaleReading(
            midi: midi,
            chromaticMidi: chroma,
            chromaticCents: chromaticCents,
            semitoneFromTonic: st,
            isScaleTone: isTone,
            scaleMidi: best,
            scaleCents: (midi - Double(best)) * 100
        )
    }

    public static func byID(_ id: String) -> Scale? {
        all.first { $0.id == id }
    }

    public static let chromatic = Scale(id: "chromatic", name: "Chromatic (any note)", tradition: .western, intervals: Array(0..<12))

    public static let all: [Scale] = [
        // Western
        Scale(id: "major", name: "Major (Ionian)", tradition: .western, intervals: [0, 2, 4, 5, 7, 9, 11]),
        Scale(id: "natural_minor", name: "Natural minor (Aeolian)", tradition: .western, intervals: [0, 2, 3, 5, 7, 8, 10]),
        Scale(id: "harmonic_minor", name: "Harmonic minor", tradition: .western, intervals: [0, 2, 3, 5, 7, 8, 11]),
        Scale(id: "melodic_minor", name: "Melodic minor (asc.)", tradition: .western, intervals: [0, 2, 3, 5, 7, 9, 11]),
        Scale(id: "dorian", name: "Dorian", tradition: .western, intervals: [0, 2, 3, 5, 7, 9, 10]),
        Scale(id: "phrygian", name: "Phrygian", tradition: .western, intervals: [0, 1, 3, 5, 7, 8, 10]),
        Scale(id: "lydian", name: "Lydian", tradition: .western, intervals: [0, 2, 4, 6, 7, 9, 11]),
        Scale(id: "mixolydian", name: "Mixolydian", tradition: .western, intervals: [0, 2, 4, 5, 7, 9, 10]),
        Scale(id: "major_pentatonic", name: "Major pentatonic", tradition: .western, intervals: [0, 2, 4, 7, 9]),
        Scale(id: "minor_pentatonic", name: "Minor pentatonic", tradition: .western, intervals: [0, 3, 5, 7, 10]),
        Scale(id: "blues", name: "Blues", tradition: .western, intervals: [0, 3, 5, 6, 7, 10]),
        chromatic,
        // Carnatic
        Scale(id: "shankarabharanam", name: "Shankarabharanam", tradition: .carnatic, intervals: [0, 2, 4, 5, 7, 9, 11], note: "29th melakarta; same notes as the major scale"),
        Scale(id: "kalyani", name: "Kalyani", tradition: .carnatic, intervals: [0, 2, 4, 6, 7, 9, 11], note: "65th melakarta; prati madhyama"),
        Scale(id: "kharaharapriya", name: "Kharaharapriya", tradition: .carnatic, intervals: [0, 2, 3, 5, 7, 9, 10], note: "22nd melakarta"),
        Scale(id: "harikambhoji", name: "Harikambhoji", tradition: .carnatic, intervals: [0, 2, 4, 5, 7, 9, 10], note: "28th melakarta"),
        Scale(id: "mayamalavagowla", name: "Mayamalavagowla", tradition: .carnatic, intervals: [0, 1, 4, 5, 7, 8, 11], note: "15th melakarta; the beginner's raga"),
        Scale(id: "natabhairavi", name: "Natabhairavi", tradition: .carnatic, intervals: [0, 2, 3, 5, 7, 8, 10], note: "20th melakarta"),
        Scale(id: "keeravani", name: "Keeravani", tradition: .carnatic, intervals: [0, 2, 3, 5, 7, 8, 11], note: "21st melakarta"),
        Scale(id: "charukesi", name: "Charukesi", tradition: .carnatic, intervals: [0, 2, 4, 5, 7, 8, 10], note: "26th melakarta"),
        Scale(id: "hanumatodi", name: "Hanumatodi", tradition: .carnatic, intervals: [0, 1, 3, 5, 7, 8, 10], note: "8th melakarta"),
        Scale(id: "mohanam", name: "Mohanam", tradition: .carnatic, intervals: [0, 2, 4, 7, 9], note: "Audava (pentatonic) janya of Harikambhoji"),
        Scale(id: "hamsadhwani", name: "Hamsadhwani", tradition: .carnatic, intervals: [0, 2, 4, 7, 11], note: "Pentatonic janya of Shankarabharanam"),
        Scale(id: "hindolam", name: "Hindolam", tradition: .carnatic, intervals: [0, 3, 5, 8, 10], note: "Pentatonic janya of Natabhairavi"),
        Scale(id: "abhogi", name: "Abhogi", tradition: .carnatic, intervals: [0, 2, 3, 5, 9], note: "Pentatonic janya of Kharaharapriya"),
        Scale(id: "sriranjani", name: "Sriranjani", tradition: .carnatic, intervals: [0, 2, 3, 5, 9, 10], note: "Shadava janya of Kharaharapriya"),
        Scale(id: "madhyamavati", name: "Madhyamavati", tradition: .carnatic, intervals: [0, 2, 5, 7, 10], note: "Pentatonic janya of Kharaharapriya"),
        // Hindustani
        Scale(id: "bilawal", name: "Bilawal", tradition: .hindustani, intervals: [0, 2, 4, 5, 7, 9, 11], note: "Thaat; all shuddha swaras"),
        Scale(id: "yaman", name: "Yaman (Kalyan)", tradition: .hindustani, intervals: [0, 2, 4, 6, 7, 9, 11], note: "Tivra Ma"),
        Scale(id: "kafi", name: "Kafi", tradition: .hindustani, intervals: [0, 2, 3, 5, 7, 9, 10], note: "Komal Ga and Ni"),
        Scale(id: "khamaj", name: "Khamaj", tradition: .hindustani, intervals: [0, 2, 4, 5, 7, 9, 10], note: "Komal Ni descending"),
        Scale(id: "bhairav", name: "Bhairav", tradition: .hindustani, intervals: [0, 1, 4, 5, 7, 8, 11], note: "Komal Re and Dha"),
        Scale(id: "bhairavi", name: "Bhairavi", tradition: .hindustani, intervals: [0, 1, 3, 5, 7, 8, 10], note: "All komal swaras"),
        Scale(id: "asavari", name: "Asavari", tradition: .hindustani, intervals: [0, 2, 3, 5, 7, 8, 10], note: "Komal Ga, Dha, Ni"),
        Scale(id: "bhoop", name: "Bhoop (Bhupali)", tradition: .hindustani, intervals: [0, 2, 4, 7, 9], note: "Pentatonic"),
        Scale(id: "durga", name: "Durga", tradition: .hindustani, intervals: [0, 2, 5, 7, 9], note: "Pentatonic"),
        Scale(id: "malkauns", name: "Malkauns", tradition: .hindustani, intervals: [0, 3, 5, 8, 10], note: "Pentatonic; komal Ga, Dha, Ni"),
        Scale(id: "des", name: "Des", tradition: .hindustani, intervals: [0, 2, 4, 5, 7, 9, 10, 11], note: "Uses both Ni; shuddha Ni ascending, komal descending"),
    ]
}

/// How a single sung pitch relates to a scale.
public struct ScaleReading: Sendable, Equatable {
    /// The sung pitch as a fractional MIDI note.
    public let midi: Double
    /// Nearest chromatic (12-tone) note.
    public let chromaticMidi: Int
    /// Deviation from the nearest chromatic note, in cents (negative = flat).
    public let chromaticCents: Double
    /// Pitch class of the chromatic note relative to the tonic (0 = Sa).
    public let semitoneFromTonic: Int
    /// Whether the nearest chromatic note belongs to the scale.
    public let isScaleTone: Bool
    /// Nearest note that belongs to the scale.
    public let scaleMidi: Int
    /// Deviation from the nearest scale tone, in cents.
    public let scaleCents: Double

    public init(midi: Double, chromaticMidi: Int, chromaticCents: Double, semitoneFromTonic: Int, isScaleTone: Bool, scaleMidi: Int, scaleCents: Double) {
        self.midi = midi
        self.chromaticMidi = chromaticMidi
        self.chromaticCents = chromaticCents
        self.semitoneFromTonic = semitoneFromTonic
        self.isScaleTone = isScaleTone
        self.scaleMidi = scaleMidi
        self.scaleCents = scaleCents
    }

    /// Cents to show on the tuner: relative to the scale tone if we are on one, else to the chromatic note.
    public var displayCents: Double { isScaleTone ? scaleCents : chromaticCents }

    public var accuracy: Accuracy {
        let c = abs(displayCents)
        if !isScaleTone { return .offScale }
        if c <= 10 { return .inTune }
        if c <= 25 { return .close }
        return .off
    }

    public enum Accuracy: Sendable { case inTune, close, off, offScale }
}

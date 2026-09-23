import Foundation

/// Conversions between frequency, MIDI note numbers and cents.
public enum PitchMath {
    public static func midi(fromHz hz: Double, a4: Double = 440) -> Double {
        69 + 12 * log2(hz / a4)
    }

    public static func hz(fromMidi midi: Double, a4: Double = 440) -> Double {
        a4 * pow(2, (midi - 69) / 12)
    }

    /// Wraps a semitone offset into 0...11.
    public static func pitchClass(_ semitones: Int) -> Int {
        ((semitones % 12) + 12) % 12
    }
}

/// Which naming system the user prefers on screen.
public enum Notation: String, Codable, CaseIterable, Sendable {
    case western
    case indian

    public var title: String {
        switch self {
        case .western: return "Western (C D E)"
        case .indian: return "Indian (S R G)"
        }
    }
}

public enum NoteNames {
    public static let western = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]

    /// Twelve-tone swara labels relative to Sa. Lower case = komal / lower variant.
    public static let swara = ["S", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"]

    public static let swaraLong = [
        "Sa", "Ri₁ (komal)", "Ri₂", "Ga₂ (komal)", "Ga₃", "Ma₁", "Ma₂ (tivra)", "Pa",
        "Da₁ (komal)", "Da₂", "Ni₂ (komal)", "Ni₃",
    ]

    /// e.g. midi 60 -> "C4"
    public static func western(midi: Int) -> String {
        let pc = PitchMath.pitchClass(midi)
        let octave = midi / 12 - 1
        return "\(western[pc])\(octave)"
    }

    public static func westernPitchClass(_ pc: Int) -> String {
        western[PitchMath.pitchClass(pc)]
    }

    /// Swara name with octave dots relative to the tonic's octave.
    /// `tonicMidi` should be the Sa nearest the singer's range.
    public static func swara(midi: Int, tonic: Int) -> String {
        swara[PitchMath.pitchClass(midi - tonic)]
    }
}

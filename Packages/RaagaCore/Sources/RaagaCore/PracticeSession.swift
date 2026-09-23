import Foundation

/// One pitch measurement taken while recording.
public struct PitchSample: Codable, Sendable, Equatable {
    /// Seconds since the recording started.
    public var t: Double
    /// Detected frequency in Hz (0 if unvoiced).
    public var hz: Double
    /// Periodicity 0...1.
    public var clarity: Double
    /// Level 0...1.
    public var rms: Double

    public init(t: Double, hz: Double, clarity: Double, rms: Double) {
        self.t = t
        self.hz = hz
        self.clarity = clarity
        self.rms = rms
    }
}

/// A saved recording plus everything needed to analyse it later.
public struct PracticeSession: Identifiable, Codable, Sendable, Equatable {
    public var id: UUID
    public var date: Date
    public var lessonID: String
    public var lessonTitle: String
    public var lessonInstructions: String
    public var scaleID: String
    /// Tonic pitch class 0...11 (0 = C).
    public var tonic: Int
    public var a4: Double
    public var duration: Double
    public var audioFileName: String
    public var samples: [PitchSample]
    public var userNote: String?
    public var feedback: String?
    public var feedbackDate: Date?
    public var feedbackModel: String?

    public init(id: UUID = UUID(), date: Date = Date(), lesson: Lesson, tonic: Int, a4: Double,
                duration: Double, audioFileName: String, samples: [PitchSample]) {
        self.id = id
        self.date = date
        self.lessonID = lesson.id
        self.lessonTitle = lesson.title
        self.lessonInstructions = lesson.instructions
        self.scaleID = lesson.scaleID
        self.tonic = tonic
        self.a4 = a4
        self.duration = duration
        self.audioFileName = audioFileName
        self.samples = samples
    }

    public var scale: Scale { Scale.byID(scaleID) ?? Scale.chromatic }
}

import XCTest
@testable import RaagaCore

final class ScaleTests: XCTestCase {
    func testMidiConversions() {
        XCTAssertEqual(PitchMath.midi(fromHz: 440), 69, accuracy: 1e-9)
        XCTAssertEqual(PitchMath.midi(fromHz: 261.6256), 60, accuracy: 1e-3)
        XCTAssertEqual(PitchMath.hz(fromMidi: 57), 220, accuracy: 1e-6)
        XCTAssertEqual(NoteNames.western(midi: 60), "C4")
        XCTAssertEqual(NoteNames.western(midi: 69), "A4")
        XCTAssertEqual(NoteNames.western(midi: 58), "A♯3")
    }

    func testAllScalesHaveTonicAndUniqueIDs() {
        let ids = Scale.all.map(\.id)
        XCTAssertEqual(Set(ids).count, ids.count)
        for s in Scale.all {
            XCTAssertTrue(s.intervals.contains(0), "\(s.name) lacks Sa")
            XCTAssertEqual(Set(s.intervals).count, s.intervals.count)
        }
        for l in Lesson.builtIn {
            XCTAssertNotNil(Scale.byID(l.scaleID), "lesson \(l.title) has unknown scale \(l.scaleID)")
        }
    }

    func testReadingOnScaleTone() {
        let major = Scale.byID("major")!
        // E4 sung 8 cents sharp, tonic C
        let r = major.reading(midi: 64.08, tonic: 0)
        XCTAssertEqual(r.chromaticMidi, 64)
        XCTAssertEqual(r.semitoneFromTonic, 4)
        XCTAssertTrue(r.isScaleTone)
        XCTAssertEqual(r.scaleMidi, 64)
        XCTAssertEqual(r.scaleCents, 8, accuracy: 1e-6)
        XCTAssertEqual(r.accuracy, .inTune)
    }

    func testReadingOffScaleTone() {
        let mohanam = Scale.byID("mohanam")! // 0 2 4 7 9
        // F (65) with tonic C is not in Mohanam; nearest scale tones are E (64) and G (67)
        let r = mohanam.reading(midi: 65.1, tonic: 0)
        XCTAssertFalse(r.isScaleTone)
        XCTAssertEqual(r.semitoneFromTonic, 5)
        XCTAssertEqual(r.scaleMidi, 64)
        XCTAssertEqual(r.scaleCents, 110, accuracy: 1e-6)
        XCTAssertEqual(r.accuracy, .offScale)
    }

    func testReadingWithNonCTonic() {
        let major = Scale.byID("major")!
        // Tonic D (2): F# (66) is the 3rd degree, F (65) is not in D major
        XCTAssertTrue(major.reading(midi: 66, tonic: 2).isScaleTone)
        XCTAssertFalse(major.reading(midi: 65, tonic: 2).isScaleTone)
        XCTAssertEqual(major.degreeName(semitone: 4, tonic: 2, notation: .western), "F♯")
        XCTAssertEqual(major.degreeName(semitone: 4, tonic: 2, notation: .indian), "G")
    }
}

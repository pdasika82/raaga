import XCTest
@testable import RaagaCore

final class AnalyzerTests: XCTestCase {
    /// Builds a trace that holds each midi note for `hold` seconds with a small deviation.
    func trace(notes: [(midi: Double, hold: Double)], hop: Double = 0.05) -> [PitchSample] {
        var t = 0.0
        var out: [PitchSample] = []
        for n in notes {
            var elapsed = 0.0
            while elapsed < n.hold {
                out.append(PitchSample(t: t, hz: PitchMath.hz(fromMidi: n.midi), clarity: 0.95, rms: 0.1))
                t += hop
                elapsed += hop
            }
        }
        return out
    }

    func testSaraliAscendingIsRecognised() {
        let scale = Scale.byID("shankarabharanam")!
        // C4 D4 E4 F4 G4 A4 B4 C5 with small offsets
        let midis: [Double] = [60.05, 62.1, 63.9, 65.0, 67.15, 69.0, 70.8, 72.0]
        let samples = trace(notes: midis.map { ($0, 0.5) })
        let report = PerformanceAnalyzer.analyze(samples: samples, scale: scale, tonic: 0, a4: 440)

        XCTAssertEqual(report.events.count, 8)
        XCTAssertEqual(report.events.map(\.semitoneFromTonic), [0, 2, 4, 5, 7, 9, 11, 0])
        XCTAssertEqual(report.scaleToneFraction, 1, accuracy: 1e-9)
        XCTAssertEqual(report.within50, 1, accuracy: 1e-9)
        XCTAssertGreaterThan(report.within20, 0.8)
        XCTAssertEqual(report.lowestMidi, 60)
        XCTAssertEqual(report.highestMidi, 72)
        XCTAssertEqual(report.noteSequence(scale: scale, tonic: 0, notation: .indian), "S R G m P D N S")
        XCTAssertEqual(report.noteSequence(scale: scale, tonic: 0, notation: .western), "C D E F G A B C")
        XCTAssertGreaterThan(report.score, 80)

        let text = report.summaryText(scale: scale, tonic: 0)
        XCTAssertTrue(text.contains("Shankarabharanam"))
        XCTAssertTrue(text.contains("Note sequence"))
    }

    func testOffScaleNoteIsFlagged() {
        let mohanam = Scale.byID("mohanam")!
        let samples = trace(notes: [(60, 0.5), (62, 0.5), (65, 0.5), (67, 0.5)]) // F is not in Mohanam
        let report = PerformanceAnalyzer.analyze(samples: samples, scale: mohanam, tonic: 0, a4: 440)
        XCTAssertEqual(report.events.filter { !$0.isScaleTone }.count, 1)
        XCTAssertEqual(report.scaleToneFraction, 0.75, accuracy: 1e-9)
        XCTAssertTrue(report.noteSequence(scale: mohanam, tonic: 0, notation: .indian).contains("(m)"))
        XCTAssertTrue(report.summaryText(scale: mohanam, tonic: 0).contains("outside the scale"))
    }

    func testUnvoicedSamplesAreIgnored() {
        let scale = Scale.byID("major")!
        let samples = (0..<40).map { PitchSample(t: Double($0) * 0.05, hz: 0, clarity: 0, rms: 0) }
        let report = PerformanceAnalyzer.analyze(samples: samples, scale: scale, tonic: 0, a4: 440)
        XCTAssertFalse(report.hasVoice)
        XCTAssertEqual(report.score, 0)
        XCTAssertTrue(report.summaryText(scale: scale, tonic: 0).contains("No pitched singing"))
    }
}

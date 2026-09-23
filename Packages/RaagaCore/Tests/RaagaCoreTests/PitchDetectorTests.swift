import XCTest
@testable import RaagaCore

final class PitchDetectorTests: XCTestCase {
    func sine(_ hz: Double, sampleRate: Double, count: Int, amplitude: Float = 0.3) -> [Float] {
        (0..<count).map { i in amplitude * Float(sin(2 * .pi * hz * Double(i) / sampleRate)) }
    }

    func testDetectsPureSine() {
        let sr = 48000.0
        let det = YINPitchDetector(sampleRate: sr)
        for hz in [110.0, 146.83, 220.0, 329.63, 440.0, 659.25] {
            let frame = det.analyze(sine(hz, sampleRate: sr, count: 4096))
            XCTAssertNotNil(frame.frequency, "no pitch for \(hz)")
            XCTAssertEqual(frame.frequency ?? 0, hz, accuracy: hz * 0.005, "wrong pitch for \(hz)")
            XCTAssertGreaterThan(frame.clarity, 0.9)
        }
    }

    func testDetectsHarmonicRichTone() {
        let sr = 44100.0
        let f0 = 196.0
        let n = 4096
        var samples = [Float](repeating: 0, count: n)
        for h in 1...6 {
            let partial = sine(f0 * Double(h), sampleRate: sr, count: n, amplitude: 0.25 / Float(h))
            for i in 0..<n { samples[i] += partial[i] }
        }
        let det = YINPitchDetector(sampleRate: sr)
        let frame = det.analyze(samples)
        XCTAssertEqual(frame.frequency ?? 0, f0, accuracy: 1.5)
    }

    func testSilenceIsUnvoiced() {
        let det = YINPitchDetector(sampleRate: 48000)
        let frame = det.analyze([Float](repeating: 0, count: 4096))
        XCTAssertNil(frame.frequency)
        XCTAssertEqual(frame.rms, 0)
    }

    func testNoiseHasLowClarity() {
        var g = SystemRandomNumberGenerator()
        let noise = (0..<4096).map { _ in Float.random(in: -0.3...0.3, using: &g) }
        let det = YINPitchDetector(sampleRate: 48000)
        let frame = det.analyze(noise)
        XCTAssertLessThan(frame.clarity, 0.6)
    }
}

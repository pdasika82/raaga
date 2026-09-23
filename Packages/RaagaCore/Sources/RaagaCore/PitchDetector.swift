import Foundation

/// Result of analysing one audio buffer.
public struct PitchFrame: Sendable, Equatable {
    /// Root-mean-square level of the buffer, 0...1.
    public let rms: Double
    /// Detected fundamental in Hz, or nil if the buffer was silent / unpitched.
    public let frequency: Double?
    /// 0...1, how periodic the signal was (1 = perfectly periodic).
    public let clarity: Double

    public init(rms: Double, frequency: Double?, clarity: Double) {
        self.rms = rms
        self.frequency = frequency
        self.clarity = clarity
    }

    public static let silent = PitchFrame(rms: 0, frequency: nil, clarity: 0)
}

/// Monophonic pitch detector using the YIN algorithm
/// (de Cheveigné & Kawahara, 2002) with parabolic interpolation.
/// Not thread-safe: use one instance per audio thread.
public final class YINPitchDetector {
    public let sampleRate: Double
    public let threshold: Double
    public let minFrequency: Double
    public let maxFrequency: Double
    /// Buffers quieter than this are treated as silence.
    public let silenceRMS: Double

    private var diff: [Double] = []

    public init(sampleRate: Double,
                threshold: Double = 0.15,
                minFrequency: Double = 60,
                maxFrequency: Double = 1400,
                silenceRMS: Double = 0.004) {
        self.sampleRate = sampleRate
        self.threshold = threshold
        self.minFrequency = minFrequency
        self.maxFrequency = maxFrequency
        self.silenceRMS = silenceRMS
    }

    public static func rms(_ samples: [Float]) -> Double {
        guard !samples.isEmpty else { return 0 }
        var acc: Double = 0
        for s in samples { acc += Double(s) * Double(s) }
        return sqrt(acc / Double(samples.count))
    }

    public func analyze(_ samples: [Float]) -> PitchFrame {
        let rms = Self.rms(samples)
        guard rms >= silenceRMS, samples.count >= 512 else {
            return PitchFrame(rms: rms, frequency: nil, clarity: 0)
        }
        guard let (freq, clarity) = estimate(samples) else {
            return PitchFrame(rms: rms, frequency: nil, clarity: 0)
        }
        return PitchFrame(rms: rms, frequency: freq, clarity: clarity)
    }

    private func estimate(_ samples: [Float]) -> (Double, Double)? {
        let n = samples.count
        let w = n / 2
        let tauMax = min(w, Int(sampleRate / minFrequency))
        let tauMin = max(2, Int(sampleRate / maxFrequency))
        guard tauMax > tauMin + 2 else { return nil }
        if diff.count < tauMax { diff = [Double](repeating: 0, count: tauMax) }

        // Difference function d(tau)
        samples.withUnsafeBufferPointer { x in
            for tau in 0..<tauMax {
                var acc: Float = 0
                var j = 0
                while j < w {
                    let d = x[j] - x[j + tau]
                    acc += d * d
                    j += 1
                }
                diff[tau] = Double(acc)
            }
        }

        // Cumulative mean normalised difference d'(tau)
        var running: Double = 0
        diff[0] = 1
        for tau in 1..<tauMax {
            running += diff[tau]
            diff[tau] = running > 0 ? diff[tau] * Double(tau) / running : 1
        }

        // Absolute threshold: first dip below threshold, then slide to its local minimum
        var found = -1
        var tau = tauMin
        while tau < tauMax - 1 {
            if diff[tau] < threshold {
                while tau + 1 < tauMax - 1 && diff[tau + 1] < diff[tau] { tau += 1 }
                found = tau
                break
            }
            tau += 1
        }
        if found < 0 {
            // Fall back to the global minimum if it is reasonably periodic
            var best = tauMin
            var bestVal = diff[tauMin]
            for t in tauMin..<(tauMax - 1) where diff[t] < bestVal {
                bestVal = diff[t]
                best = t
            }
            guard bestVal < 0.45 else { return nil }
            found = best
        }

        // Parabolic interpolation around the minimum
        var refined = Double(found)
        if found > 0 && found < tauMax - 1 {
            let s0 = diff[found - 1], s1 = diff[found], s2 = diff[found + 1]
            let denom = s0 - 2 * s1 + s2
            if abs(denom) > 1e-12 {
                let offset = (s0 - s2) / (2 * denom)
                if abs(offset) <= 1 { refined += offset }
            }
        }

        let freq = sampleRate / refined
        guard freq >= minFrequency, freq <= maxFrequency else { return nil }
        let clarity = max(0, min(1, 1 - diff[found]))
        return (freq, clarity)
    }
}

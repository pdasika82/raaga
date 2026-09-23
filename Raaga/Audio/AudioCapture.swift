import AVFoundation
import Foundation
import RaagaCore

struct RecordingResult {
    let samples: [PitchSample]
    let duration: Double
    let url: URL
}

enum CaptureError: LocalizedError {
    case noInput
    var errorDescription: String? { "No microphone input is available." }
}

/// Runs the microphone through the pitch detector and, when asked, writes the audio to a file.
@MainActor
final class AudioCapture: ObservableObject {
    @Published private(set) var frame: PitchFrame = .silent
    @Published private(set) var isRunning = false
    @Published private(set) var isRecording = false
    @Published private(set) var elapsed: TimeInterval = 0
    @Published var permissionDenied = false
    @Published var errorMessage: String?

    private let engine = AVAudioEngine()
    private let shared = SharedState()
    private var ticker: Timer?
    private var recordingStart: Date?

    /// Everything the audio thread touches, guarded by `lock`.
    private final class SharedState: @unchecked Sendable {
        let lock = NSLock()
        var file: AVAudioFile?
        var samples: [PitchSample] = []
        var frames: Int64 = 0
        var recording = false
        var sampleRate: Double = 48000
    }

    // MARK: Lifecycle

    func start() async {
        guard !isRunning else { return }
        guard await Self.requestPermission() else {
            permissionDenied = true
            return
        }
        permissionDenied = false
        do {
            try configureSession()
            try installTap()
            engine.prepare()
            try engine.start()
            isRunning = true
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Stops listening. Finish any recording first with `endRecording()`.
    func stop() {
        guard isRunning else { return }
        if isRecording { _ = endRecording() }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        isRunning = false
        frame = .silent
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
    }

    // MARK: Recording

    func beginRecording(to url: URL) throws {
        guard isRunning, !isRecording else { return }
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: shared.sampleRate,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 96_000,
        ]
        let file = try AVAudioFile(forWriting: url, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)
        shared.lock.lock()
        shared.file = file
        shared.samples = []
        shared.frames = 0
        shared.recording = true
        shared.lock.unlock()

        isRecording = true
        recordingStart = Date()
        elapsed = 0
        ticker = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let start = self.recordingStart else { return }
                self.elapsed = Date().timeIntervalSince(start)
            }
        }
    }

    func endRecording() -> RecordingResult? {
        guard isRecording else { return nil }
        ticker?.invalidate()
        ticker = nil
        shared.lock.lock()
        shared.recording = false
        let samples = shared.samples
        let duration = Double(shared.frames) / shared.sampleRate
        let url = shared.file?.url
        shared.file = nil // releasing the file finalises it on disk
        shared.samples = []
        shared.lock.unlock()
        isRecording = false
        recordingStart = nil
        guard let url else { return nil }
        return RecordingResult(samples: samples, duration: duration, url: url)
    }

    // MARK: Internals

    private static func requestPermission() async -> Bool {
        #if os(iOS)
        return await AVAudioApplication.requestRecordPermission()
        #else
        return true
        #endif
    }

    private func configureSession() throws {
        #if os(iOS)
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker])
        try session.setPreferredSampleRate(48_000)
        try session.setPreferredIOBufferDuration(0.02)
        try session.setActive(true)
        #endif
    }

    private func installTap() throws {
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0,
              let monoFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: format.sampleRate, channels: 1, interleaved: false)
        else { throw CaptureError.noInput }

        shared.sampleRate = format.sampleRate
        let shared = self.shared
        let detector = YINPitchDetector(sampleRate: format.sampleRate)

        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
            guard let data = buffer.floatChannelData else { return }
            let n = Int(buffer.frameLength)
            guard n > 0 else { return }
            let mono = Array(UnsafeBufferPointer(start: data[0], count: n))
            let frame = detector.analyze(mono)

            shared.lock.lock()
            if shared.recording {
                let t = Double(shared.frames) / shared.sampleRate
                shared.samples.append(PitchSample(t: t, hz: frame.frequency ?? 0, clarity: frame.clarity, rms: frame.rms))
                shared.frames += Int64(n)
                if let file = shared.file,
                   let monoBuffer = AVAudioPCMBuffer(pcmFormat: monoFormat, frameCapacity: AVAudioFrameCount(n)) {
                    monoBuffer.frameLength = AVAudioFrameCount(n)
                    monoBuffer.floatChannelData?[0].update(from: data[0], count: n)
                    try? file.write(from: monoBuffer)
                }
            }
            shared.lock.unlock()

            Task { @MainActor [weak self] in self?.frame = frame }
        }
    }
}

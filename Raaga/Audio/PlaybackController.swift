import AVFoundation
import Foundation

/// Plays back a saved session recording.
@MainActor
final class PlaybackController: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published private(set) var isPlaying = false
    @Published private(set) var progress: Double = 0
    @Published private(set) var duration: Double = 0
    @Published var errorMessage: String?

    private var player: AVAudioPlayer?
    private var timer: Timer?

    func load(url: URL) {
        do {
            let p = try AVAudioPlayer(contentsOf: url)
            p.delegate = self
            p.prepareToPlay()
            player = p
            duration = p.duration
            errorMessage = nil
        } catch {
            errorMessage = "Could not open recording: \(error.localizedDescription)"
        }
    }

    func toggle() {
        guard let player else { return }
        if player.isPlaying {
            player.pause()
            isPlaying = false
            timer?.invalidate()
        } else {
            #if os(iOS)
            let session = AVAudioSession.sharedInstance()
            if session.category != .playAndRecord {
                try? session.setCategory(.playback, mode: .default)
            }
            try? session.setActive(true)
            #endif
            player.play()
            isPlaying = true
            timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                Task { @MainActor [weak self] in
                    guard let self, let p = self.player else { return }
                    self.progress = p.duration > 0 ? p.currentTime / p.duration : 0
                }
            }
        }
    }

    func stop() {
        player?.stop()
        player?.currentTime = 0
        isPlaying = false
        progress = 0
        timer?.invalidate()
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor [weak self] in
            self?.isPlaying = false
            self?.progress = 0
            self?.timer?.invalidate()
        }
    }
}

import RaagaCore
import SwiftUI

struct SessionDetailView: View {
    @EnvironmentObject private var sessions: SessionStore
    @AppStorage(Prefs.notation) private var notationRaw = Notation.indian.rawValue
    @StateObject private var player = PlaybackController()

    @State private var session: PracticeSession
    @State private var report: PerformanceReport?
    @State private var noteDraft: String
    @State private var isRequesting = false
    @State private var feedbackError: String?

    init(session: PracticeSession) {
        _session = State(initialValue: session)
        _noteDraft = State(initialValue: session.userNote ?? "")
    }

    private var notation: Notation { Notation(rawValue: notationRaw) ?? .indian }

    var body: some View {
        List {
            Section {
                LabeledContent("Lesson", value: session.lessonTitle)
                LabeledContent("Scale", value: session.scale.displayName)
                LabeledContent("Sa", value: NoteNames.westernPitchClass(session.tonic))
                LabeledContent("Recorded") { Text(session.date, format: .dateTime.month().day().year().hour().minute()) }
                LabeledContent("Length", value: formatTime(session.duration))
            }

            Section("Playback") {
                HStack(spacing: 14) {
                    Button { player.toggle() } label: {
                        Image(systemName: player.isPlaying ? "pause.circle.fill" : "play.circle.fill").font(.system(size: 36))
                    }
                    .buttonStyle(.plain)
                    ProgressView(value: player.progress)
                    Text(formatTime(player.progress * player.duration)).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                }
                if let e = player.errorMessage { Text(e).font(.footnote).foregroundStyle(.red) }
            }

            if let r = report {
                Section("Pitch") {
                    PitchChartView(samples: session.samples, scale: session.scale, tonic: session.tonic, a4: session.a4, notation: notation)
                        .listRowInsets(EdgeInsets(top: 12, leading: 8, bottom: 12, trailing: 12))
                }

                Section("Accuracy") {
                    HStack {
                        ScoreBadge(score: r.score, hasVoice: r.hasVoice)
                        VStack(alignment: .leading) {
                            Text("Overall").font(.headline)
                            Text(String(format: "%.1f s of singing detected", r.voicedSeconds)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    StatRow(label: "Within ±20 cents", value: pct(r.within20))
                    StatRow(label: "Within ±50 cents", value: pct(r.within50))
                    StatRow(label: "On scale tones", value: pct(r.scaleToneFraction))
                    StatRow(label: "Average deviation", value: String(format: "%.0f cents", r.meanAbsCents))
                    if let s = r.stabilityCents {
                        StatRow(label: "Steadiness on held notes", value: String(format: "±%.0f cents", s))
                    }
                    if let lo = r.lowestMidi, let hi = r.highestMidi {
                        StatRow(label: "Range", value: "\(NoteNames.western(midi: lo)) – \(NoteNames.western(midi: hi))")
                    }
                }

                if !r.events.isEmpty {
                    Section("Notes sung") {
                        Text(r.noteSequence(scale: session.scale, tonic: session.tonic, notation: notation))
                            .font(.system(.body, design: .monospaced))
                        Text("Notes in parentheses are outside the scale.").font(.caption).foregroundStyle(.secondary)
                    }
                }

                Section("Your note") {
                    TextField("How did it feel? Anything you were working on?", text: $noteDraft, axis: .vertical)
                        .lineLimit(2...5)
                }

                feedbackSection(report: r)
            }
        }
        .navigationTitle(session.lessonTitle)
        .onAppear {
            player.load(url: sessions.audioURL(for: session))
            if report == nil {
                report = PerformanceAnalyzer.analyze(samples: session.samples, scale: session.scale, tonic: session.tonic,
                                                     a4: session.a4, totalSeconds: session.duration)
            }
        }
        .onDisappear {
            player.stop()
            persistNote()
        }
    }

    @ViewBuilder
    private func feedbackSection(report: PerformanceReport) -> some View {
        Section("Coach feedback") {
            if let f = session.feedback {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(f.split(separator: "\n", omittingEmptySubsequences: false).enumerated()), id: \.offset) { _, line in
                        Text(String(line)).fixedSize(horizontal: false, vertical: true)
                    }
                }
                if let d = session.feedbackDate {
                    Text("\(session.feedbackModel ?? "Claude") · \(d, format: .dateTime.month().day().hour().minute())")
                        .font(.caption2).foregroundStyle(.tertiary)
                }
            }
            if isRequesting {
                HStack { ProgressView(); Text("Asking your coach…").foregroundStyle(.secondary) }
            } else {
                Button(session.feedback == nil ? "Get feedback from Claude" : "Ask again") {
                    requestFeedback(report: report)
                }
                .disabled(!report.hasVoice)
            }
            if let e = feedbackError {
                Text(e).font(.footnote).foregroundStyle(.red)
            }
            Text("Only the pitch analysis and lesson text are sent; the audio stays on your phone.")
                .font(.caption2).foregroundStyle(.tertiary)
        }
    }

    private func pct(_ v: Double) -> String { String(format: "%.0f%%", v * 100) }

    private func persistNote() {
        let trimmed = noteDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        if (session.userNote ?? "") != trimmed {
            session.userNote = trimmed.isEmpty ? nil : trimmed
            sessions.save(session)
        }
    }

    private func requestFeedback(report: PerformanceReport) {
        guard let key = KeychainStore.read(), !key.trimmingCharacters(in: .whitespaces).isEmpty else {
            feedbackError = ClaudeError.missingAPIKey.localizedDescription
            return
        }
        persistNote()
        isRequesting = true
        feedbackError = nil
        let client = ClaudeClient(apiKey: key)
        let userMessage = FeedbackPrompt.userMessage(session: session, report: report)
        Task {
            do {
                let reply = try await client.complete(system: FeedbackPrompt.system, userMessage: userMessage)
                session.feedback = reply.text
                session.feedbackDate = Date()
                session.feedbackModel = reply.model
                sessions.save(session)
            } catch {
                feedbackError = error.localizedDescription
            }
            isRequesting = false
        }
    }
}

struct StatRow: View {
    let label: String
    let value: String
    var body: some View {
        LabeledContent(label, value: value)
    }
}

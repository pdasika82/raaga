import RaagaCore
import SwiftUI

struct SessionsListView: View {
    @EnvironmentObject private var sessions: SessionStore

    var body: some View {
        NavigationStack {
            Group {
                if sessions.sessions.isEmpty {
                    ContentUnavailableView("No sessions yet", systemImage: "waveform",
                                           description: Text("Record an exercise on the Practice tab and it will show up here."))
                } else {
                    List {
                        ForEach(sessions.sessions) { s in
                            NavigationLink(value: s.id) { SessionRow(session: s) }
                        }
                        .onDelete { offsets in
                            for i in offsets { sessions.delete(sessions.sessions[i]) }
                        }
                    }
                    .navigationDestination(for: UUID.self) { id in
                        if let s = sessions.sessions.first(where: { $0.id == id }) {
                            SessionDetailView(session: s)
                        }
                    }
                }
            }
            .navigationTitle("Sessions")
        }
    }
}

struct SessionRow: View {
    let session: PracticeSession

    private var report: PerformanceReport {
        PerformanceAnalyzer.analyze(samples: session.samples, scale: session.scale, tonic: session.tonic,
                                    a4: session.a4, totalSeconds: session.duration)
    }

    var body: some View {
        let r = report
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(session.lessonTitle).font(.headline)
                Text("\(session.scale.name) · Sa \(NoteNames.westernPitchClass(session.tonic)) · \(formatTime(session.duration))")
                    .font(.caption).foregroundStyle(.secondary)
                Text(session.date, format: .dateTime.month(.abbreviated).day().hour().minute())
                    .font(.caption2).foregroundStyle(.tertiary)
            }
            Spacer()
            if session.feedback != nil {
                Image(systemName: "text.bubble.fill").foregroundStyle(.secondary).font(.caption)
            }
            ScoreBadge(score: r.score, hasVoice: r.hasVoice)
        }
        .padding(.vertical, 2)
    }
}

struct ScoreBadge: View {
    let score: Int
    let hasVoice: Bool

    private var color: Color {
        guard hasVoice else { return .secondary }
        if score >= 80 { return .green }
        if score >= 55 { return .yellow }
        return .orange
    }

    var body: some View {
        Text(hasVoice ? "\(score)" : "–")
            .font(.system(.title3, design: .rounded).weight(.bold))
            .monospacedDigit()
            .frame(width: 48, height: 48)
            .background(color.opacity(0.18), in: Circle())
            .foregroundStyle(color)
    }
}

import RaagaCore
import SwiftUI

struct PracticeView: View {
    @EnvironmentObject private var sessions: SessionStore
    @EnvironmentObject private var lessons: LessonStore
    @StateObject private var capture = AudioCapture()

    @AppStorage(Prefs.notation) private var notationRaw = Notation.indian.rawValue
    @AppStorage(Prefs.tonic) private var tonic = 0
    @AppStorage(Prefs.a4) private var a4 = 440.0
    @AppStorage(Prefs.lessonID) private var lessonID = "sarali_1"

    @State private var pendingID: UUID?
    @State private var justSaved: PracticeSession?
    @State private var saveError: String?

    private var notation: Notation { Notation(rawValue: notationRaw) ?? .indian }
    private var lesson: Lesson { lessons.lesson(id: lessonID) ?? Lesson.builtIn[0] }
    private var scale: Scale { lesson.scale }

    private var reading: ScaleReading? {
        guard let hz = capture.frame.frequency, capture.frame.clarity >= 0.5 else { return nil }
        return scale.reading(midi: PitchMath.midi(fromHz: hz, a4: a4), tonic: tonic)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    lessonCard
                    PitchMeterView(reading: reading, notation: notation, tonic: tonic, level: capture.frame.rms)
                    ScaleStripView(scale: scale, tonic: tonic, notation: notation, reading: reading)
                    recordControls
                    statusMessages
                }
                .padding()
            }
            .navigationTitle("Practice")
            .toolbar {
                ToolbarItem(placement: .primaryAction) { tonicMenu }
            }
            .task { await capture.start() }
            .onDisappear {
                finishRecording()
                capture.stop()
            }
            // Pause the live tuner while the saved session is open (it plays audio).
            .onChange(of: justSaved?.id) { _, id in
                if id != nil {
                    capture.stop()
                } else {
                    Task { await capture.start() }
                }
            }
            .sheet(item: $justSaved) { s in
                NavigationStack {
                    SessionDetailView(session: s)
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) {
                                Button("Done") { justSaved = nil }
                            }
                        }
                }
            }
        }
    }

    // MARK: Pieces

    private var lessonCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Menu {
                ForEach(lessons.all) { l in
                    Button {
                        lessonID = l.id
                    } label: {
                        if l.id == lesson.id { Label(l.title, systemImage: "checkmark") } else { Text(l.title) }
                    }
                }
            } label: {
                HStack {
                    Text(lesson.title).font(.headline)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down").font(.caption)
                }
                .contentShape(Rectangle())
            }
            .disabled(capture.isRecording)
            Text(scale.displayName + " · Sa = " + NoteNames.westernPitchClass(tonic))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text(lesson.instructions)
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
    }

    private var tonicMenu: some View {
        Menu {
            ForEach(0..<12, id: \.self) { pc in
                Button {
                    tonic = pc
                } label: {
                    if pc == tonic { Label(NoteNames.westernPitchClass(pc), systemImage: "checkmark") } else { Text(NoteNames.westernPitchClass(pc)) }
                }
            }
        } label: {
            Text("Sa: \(NoteNames.westernPitchClass(tonic))")
        }
        .disabled(capture.isRecording)
    }

    private var recordControls: some View {
        VStack(spacing: 10) {
            Button {
                capture.isRecording ? finishRecording() : startRecording()
            } label: {
                ZStack {
                    Circle().fill(capture.isRecording ? Color.red : Color.accentColor).frame(width: 84, height: 84)
                    Image(systemName: capture.isRecording ? "stop.fill" : "record.circle")
                        .font(.system(size: 36))
                        .foregroundStyle(.white)
                }
            }
            .buttonStyle(.plain)
            .disabled(!capture.isRunning)
            Text(capture.isRecording ? "Recording · \(formatTime(capture.elapsed))" : "Tap to record this exercise")
                .font(.subheadline)
                .foregroundStyle(capture.isRecording ? .red : .secondary)
                .monospacedDigit()
        }
        .padding(.top, 8)
    }

    @ViewBuilder
    private var statusMessages: some View {
        if capture.permissionDenied {
            Label("Microphone access is off. Enable it in Settings → Privacy → Microphone.", systemImage: "mic.slash")
                .font(.footnote).foregroundStyle(.red)
        }
        if let e = capture.errorMessage ?? saveError {
            Text(e).font(.footnote).foregroundStyle(.red)
        }
    }

    // MARK: Actions

    private func startRecording() {
        let id = UUID()
        do {
            try capture.beginRecording(to: sessions.newAudioURL(id: id))
            pendingID = id
            saveError = nil
        } catch {
            saveError = "Could not start recording: \(error.localizedDescription)"
        }
    }

    private func finishRecording() {
        guard capture.isRecording, let result = capture.endRecording() else { return }
        let id = pendingID ?? UUID()
        pendingID = nil
        guard result.duration >= 1 else {
            try? FileManager.default.removeItem(at: result.url)
            return
        }
        let session = PracticeSession(
            id: id,
            lesson: lesson,
            tonic: tonic,
            a4: a4,
            duration: result.duration,
            audioFileName: result.url.lastPathComponent,
            samples: result.samples
        )
        sessions.save(session)
        justSaved = session
    }
}

func formatTime(_ t: TimeInterval) -> String {
    let s = Int(t.rounded(.down))
    return String(format: "%d:%02d", s / 60, s % 60)
}

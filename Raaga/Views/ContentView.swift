import RaagaCore
import SwiftUI

struct ContentView: View {
    @StateObject private var sessions = SessionStore()
    @StateObject private var lessons = LessonStore()

    var body: some View {
        TabView {
            PracticeView()
                .tabItem { Label("Practice", systemImage: "mic.fill") }
            SessionsListView()
                .tabItem { Label("Sessions", systemImage: "waveform") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .environmentObject(sessions)
        .environmentObject(lessons)
    }
}

/// Shared user preferences, read through @AppStorage.
enum Prefs {
    static let notation = "notation"
    static let tonic = "tonic"
    static let a4 = "a4"
    static let lessonID = "lessonID"
}

extension Color {
    static func accuracy(_ a: RaagaCore.ScaleReading.Accuracy) -> Color {
        switch a {
        case .inTune: return .green
        case .close: return .yellow
        case .off: return .orange
        case .offScale: return .red
        }
    }
}


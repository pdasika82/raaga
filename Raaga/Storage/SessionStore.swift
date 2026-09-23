import Foundation
import RaagaCore

/// Persists sessions as JSON files next to their audio in Documents/Sessions.
@MainActor
final class SessionStore: ObservableObject {
    @Published private(set) var sessions: [PracticeSession] = []

    let directory: URL
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    init(directory: URL? = nil) {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        self.directory = directory ?? docs.appendingPathComponent("Sessions", isDirectory: true)
        try? FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
        load()
    }

    func load() {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        var loaded: [PracticeSession] = []
        for url in files where url.pathExtension == "json" {
            if let data = try? Data(contentsOf: url), let s = try? decoder.decode(PracticeSession.self, from: data) {
                loaded.append(s)
            }
        }
        sessions = loaded.sorted { $0.date > $1.date }
    }

    func save(_ session: PracticeSession) {
        do {
            let data = try encoder.encode(session)
            try data.write(to: jsonURL(for: session.id), options: .atomic)
        } catch {
            print("Failed to save session: \(error)")
        }
        if let i = sessions.firstIndex(where: { $0.id == session.id }) {
            sessions[i] = session
        } else {
            sessions.insert(session, at: 0)
            sessions.sort { $0.date > $1.date }
        }
    }

    func delete(_ session: PracticeSession) {
        try? FileManager.default.removeItem(at: jsonURL(for: session.id))
        try? FileManager.default.removeItem(at: audioURL(for: session))
        sessions.removeAll { $0.id == session.id }
    }

    func audioURL(for session: PracticeSession) -> URL {
        directory.appendingPathComponent(session.audioFileName)
    }

    func newAudioURL(id: UUID) -> URL {
        directory.appendingPathComponent("\(id.uuidString).m4a")
    }

    private func jsonURL(for id: UUID) -> URL {
        directory.appendingPathComponent("\(id.uuidString).json")
    }
}

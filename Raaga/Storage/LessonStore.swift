import Foundation
import RaagaCore

/// Built-in lessons plus the user's own, stored in Documents/lessons.json.
@MainActor
final class LessonStore: ObservableObject {
    @Published private(set) var custom: [Lesson] = []

    private let fileURL: URL

    init() {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        fileURL = docs.appendingPathComponent("lessons.json")
        if let data = try? Data(contentsOf: fileURL), let list = try? JSONDecoder().decode([Lesson].self, from: data) {
            custom = list
        }
    }

    var all: [Lesson] {
        let builtIn = Lesson.builtIn.filter { $0.id != Lesson.freePractice.id }
        return builtIn + custom + [Lesson.freePractice]
    }

    func lesson(id: String) -> Lesson? {
        all.first { $0.id == id }
    }

    func add(_ lesson: Lesson) {
        custom.append(lesson)
        persist()
    }

    func update(_ lesson: Lesson) {
        if let i = custom.firstIndex(where: { $0.id == lesson.id }) {
            custom[i] = lesson
            persist()
        }
    }

    func remove(_ lesson: Lesson) {
        custom.removeAll { $0.id == lesson.id }
        persist()
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(custom) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }
}

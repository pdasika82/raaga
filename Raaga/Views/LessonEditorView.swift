import RaagaCore
import SwiftUI

struct LessonListView: View {
    @EnvironmentObject private var lessons: LessonStore
    @State private var editing: Lesson?
    @State private var showingNew = false

    var body: some View {
        List {
            if lessons.custom.isEmpty {
                Text("No custom lessons yet. Add one to practise a specific exercise or raga.")
                    .foregroundStyle(.secondary)
            }
            ForEach(lessons.custom) { l in
                Button {
                    editing = l
                } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(l.title).font(.headline).foregroundStyle(.primary)
                        Text(l.scale.displayName).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .onDelete { offsets in
                for i in offsets { lessons.remove(lessons.custom[i]) }
            }
        }
        .navigationTitle("Custom lessons")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingNew = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showingNew) {
            LessonEditorView(lesson: Lesson(title: "", instructions: "", scaleID: "shankarabharanam")) { lessons.add($0) }
        }
        .sheet(item: $editing) { l in
            LessonEditorView(lesson: l) { lessons.update($0) }
        }
    }
}

struct LessonEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State var lesson: Lesson
    let onSave: (Lesson) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Title") {
                    TextField("e.g. Alankaram 3 in Mayamalavagowla", text: $lesson.title)
                }
                Section("What to sing") {
                    TextEditor(text: $lesson.instructions).frame(minHeight: 120)
                }
                Section("Judge against") {
                    Picker("Scale / raga", selection: $lesson.scaleID) {
                        ForEach(Scale.Tradition.allCases, id: \.self) { tr in
                            Section(tr.rawValue) {
                                ForEach(Scale.all.filter { $0.tradition == tr }) { s in
                                    Text(s.name).tag(s.id)
                                }
                            }
                        }
                    }
                    if let note = lesson.scale.note {
                        Text(note).font(.caption).foregroundStyle(.secondary)
                    }
                    Text("Degrees: " + lesson.scale.intervals.map { NoteNames.swara[$0] }.joined(separator: " "))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle(lesson.title.isEmpty ? "New lesson" : lesson.title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(lesson)
                        dismiss()
                    }
                    .disabled(lesson.title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}

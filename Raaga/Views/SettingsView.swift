import RaagaCore
import SwiftUI

struct SettingsView: View {
    @AppStorage(Prefs.notation) private var notationRaw = Notation.indian.rawValue
    @AppStorage(Prefs.tonic) private var tonic = 0
    @AppStorage(Prefs.a4) private var a4 = 440.0

    @State private var keyDraft = ""
    @State private var storedKeyHint: String?
    @State private var keyMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField("sk-ant-…", text: $keyDraft)
                    HStack {
                        Button("Save key") { saveKey() }.disabled(keyDraft.trimmingCharacters(in: .whitespaces).isEmpty)
                        Spacer()
                        Button("Remove", role: .destructive) {
                            KeychainStore.delete()
                            storedKeyHint = nil
                            keyMessage = "Key removed."
                        }
                        .disabled(storedKeyHint == nil)
                    }
                    if let h = storedKeyHint {
                        Label("Saved key ending in \(h)", systemImage: "checkmark.seal").font(.footnote).foregroundStyle(.green)
                    } else {
                        Label("No key saved. Feedback needs one.", systemImage: "exclamationmark.triangle").font(.footnote).foregroundStyle(.orange)
                    }
                    if let m = keyMessage { Text(m).font(.footnote).foregroundStyle(.secondary) }
                    Link("Create a key at console.anthropic.com", destination: URL(string: "https://console.anthropic.com/settings/keys")!)
                        .font(.footnote)
                } header: {
                    Text("Anthropic API key")
                } footer: {
                    Text("Stored in the device keychain. Used only to request feedback on your sessions with the \(ClaudeClient.defaultModel) model.")
                }

                Section("Display") {
                    Picker("Note names", selection: $notationRaw) {
                        ForEach(Notation.allCases, id: \.rawValue) { n in Text(n.title).tag(n.rawValue) }
                    }
                    Picker("Sa / tonic", selection: $tonic) {
                        ForEach(0..<12, id: \.self) { pc in Text(NoteNames.westernPitchClass(pc)).tag(pc) }
                    }
                    Stepper(value: $a4, in: 415...466, step: 1) {
                        LabeledContent("A4 reference", value: String(format: "%.0f Hz", a4))
                    }
                }

                Section("Lessons") {
                    NavigationLink("Custom lessons") { LessonListView() }
                }

                Section("About") {
                    Text("Raaga listens to your voice, shows how close each note is to the chosen scale or raga, and saves your practice so a coach model can review it.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
            .onAppear { refreshKeyHint() }
        }
    }

    private func refreshKeyHint() {
        if let k = KeychainStore.read(), k.count >= 4 {
            storedKeyHint = String(k.suffix(4))
        } else {
            storedKeyHint = nil
        }
    }

    private func saveKey() {
        let k = keyDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        if KeychainStore.write(k) {
            keyDraft = ""
            keyMessage = "Key saved."
            refreshKeyHint()
        } else {
            keyMessage = "Could not save the key to the keychain."
        }
    }
}

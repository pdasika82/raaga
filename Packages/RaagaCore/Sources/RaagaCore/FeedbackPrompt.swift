import Foundation

/// Builds the coaching prompt from a session and its analysis.
public enum FeedbackPrompt {
    public static let system = """
    You are a patient, expert vocal coach who teaches both Indian classical music (Carnatic and Hindustani) and Western singing. \
    A student has just recorded a practice exercise on their phone. The app measured their pitch continuously and \
    produced the objective report below. You cannot hear the audio; base every observation on the report and say so if \
    something cannot be judged from pitch data alone (tone, breath, diction).

    Write feedback the student can act on in their next attempt. Be specific: name the swaras or notes, say whether they \
    were flat or sharp and by roughly how much, and refer to the exercise's instructions. Be honest about problems but \
    encouraging in tone. Use the note names the student uses (swaras for Indian lessons, Western names otherwise), giving \
    the Western equivalent in parentheses the first time.

    Format: plain text with short paragraphs and simple "- " bullets. No headings, no tables, no markdown emphasis. \
    Structure: (1) one sentence on the overall impression with the key numbers, (2) 2–4 bullets on what went well, \
    (3) 2–4 bullets on the most important things to fix, in priority order, (4) one concrete drill for the next session, \
    with the tonic named. Keep the whole thing under 300 words.
    """

    public static func userMessage(session: PracticeSession, report: PerformanceReport) -> String {
        let scale = session.scale
        var parts: [String] = []
        parts.append("Lesson: \(session.lessonTitle)")
        parts.append("Instructions given to the student: \(session.lessonInstructions)")
        if let note = session.userNote?.trimmingCharacters(in: .whitespacesAndNewlines), !note.isEmpty {
            parts.append("Student's own note about this attempt: \(note)")
        }
        parts.append("")
        parts.append("Pitch analysis report:")
        parts.append(report.summaryText(scale: scale, tonic: session.tonic))
        parts.append("")
        parts.append("Notes on reading the report: cents are deviation from the nearest equal-tempered note (100 cents = one semitone). " +
                     "Within ±20 cents is generally in tune for a beginner; ±10 is good. The note sequence is what the detector heard, " +
                     "so short blips between notes may be slides rather than deliberate notes.")
        return parts.joined(separator: "\n")
    }
}

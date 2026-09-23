import Foundation

/// A practice exercise: what to sing, and which scale to judge it against.
public struct Lesson: Identifiable, Codable, Hashable, Sendable {
    public var id: String
    public var title: String
    public var instructions: String
    public var scaleID: String
    public var isBuiltIn: Bool

    public init(id: String = UUID().uuidString, title: String, instructions: String, scaleID: String, isBuiltIn: Bool = false) {
        self.id = id
        self.title = title
        self.instructions = instructions
        self.scaleID = scaleID
        self.isBuiltIn = isBuiltIn
    }

    public var scale: Scale { Scale.byID(scaleID) ?? Scale.chromatic }

    public static let freePractice = Lesson(
        id: "free",
        title: "Free practice",
        instructions: "Sing anything. Every note is accepted; the tuner shows the nearest chromatic note.",
        scaleID: "chromatic",
        isBuiltIn: true
    )

    public static let builtIn: [Lesson] = [
        Lesson(id: "sustain_sa", title: "Sustain Sa",
               instructions: "Hold Sa (the tonic) steadily on 'aa' for 8–10 seconds. Rest, then repeat three times. Aim for a straight, unwavering tone.",
               scaleID: "shankarabharanam", isBuiltIn: true),
        Lesson(id: "sarali_1", title: "Sarali Varisai 1",
               instructions: "Sing S R G M P D N Ṡ ascending, then Ṡ N D P M G R S descending. Hold each note for about one second. Repeat twice.",
               scaleID: "shankarabharanam", isBuiltIn: true),
        Lesson(id: "sarali_2", title: "Sarali Varisai 2",
               instructions: "S R S R S R G M | S R G M P D N Ṡ || Ṡ N Ṡ N Ṡ N D P | Ṡ N D P M G R S. Keep a steady tempo.",
               scaleID: "shankarabharanam", isBuiltIn: true),
        Lesson(id: "janta_1", title: "Janta Varisai 1",
               instructions: "Sing each note twice: S S R R G G M M P P D D N N Ṡ Ṡ, then back down. Give the second of each pair a slight stress.",
               scaleID: "shankarabharanam", isBuiltIn: true),
        Lesson(id: "mayamalavagowla_scale", title: "Mayamalavagowla arohana / avarohana",
               instructions: "S r G m P d N Ṡ ascending, then Ṡ N d P m G r S descending. Notice the small steps S–r and P–d.",
               scaleID: "mayamalavagowla", isBuiltIn: true),
        Lesson(id: "mohanam_scale", title: "Mohanam arohana / avarohana",
               instructions: "S R G P D Ṡ ascending, then Ṡ D P G R S descending. Skip M and N cleanly.",
               scaleID: "mohanam", isBuiltIn: true),
        Lesson(id: "kalyani_scale", title: "Kalyani arohana / avarohana",
               instructions: "S R G M P D N Ṡ and back, using the raised (prati) Ma. Compare M against P: it should sit just a semitone below.",
               scaleID: "kalyani", isBuiltIn: true),
        Lesson(id: "yaman_scale", title: "Yaman aroha / avaroha",
               instructions: "Ṇ R G M̄ D N Ṡ ascending (Sa and Pa are skipped on the way up), Ṡ N D P M̄ G R S descending. Tivra Ma throughout.",
               scaleID: "yaman", isBuiltIn: true),
        Lesson(id: "major_scale", title: "Major scale",
               instructions: "Sing do re mi fa sol la ti do ascending and descending on 'ah'. One beat per note, then again at half speed.",
               scaleID: "major", isBuiltIn: true),
        Lesson(id: "minor_scale", title: "Natural minor scale",
               instructions: "Sing the natural minor scale ascending and descending on 'oo'. Listen for the flat 3rd, 6th and 7th.",
               scaleID: "natural_minor", isBuiltIn: true),
        Lesson(id: "major_pentatonic", title: "Major pentatonic",
               instructions: "Sing 1 2 3 5 6 8 up and down, then try skipping: 1 3 5 8 5 3 1.",
               scaleID: "major_pentatonic", isBuiltIn: true),
        Lesson(id: "arpeggio_major", title: "Major arpeggio",
               instructions: "Sing 1 3 5 8 5 3 1 (do mi sol do sol mi do) on 'ah'. Land each note cleanly without sliding.",
               scaleID: "major", isBuiltIn: true),
        freePractice,
    ]
}

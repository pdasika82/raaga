# LMS for Arts — Basic PRD

**Initial module:** Kuchipudi

**Status:** Draft extracted from the supplied discovery conversation and informed by Raaga's existing practice flow. Scope and pilot criteria below are proposals; the teacher's exact beginner syllabus is still pending.

## 1. Product vision

**LMS for Arts is a learning management system for discovering, learning, and practicing performing arts, with teachers guiding the learning journey.**

Start with a beginner Kuchipudi experience modeled on Raaga. Over time, support multiple art forms, including music and other dance traditions, through a shared learning platform with practice tools specific to each art.

The product should make an unfamiliar art form approachable, help learners practice consistently between classes, and let teachers support more learners without losing the quality of their instruction.

## 2. Problem

- **Beginners** need an accessible first experience before committing to classes.
- **Existing students** forget steps and subtle corrections after class, struggle to self-correct at home, and often do not practice regularly.
- **Parents** want enough understanding to appreciate their child's learning and support practice.
- **Teachers** repeatedly demonstrate fundamentals and corrections, with limited visibility into practice between classes.
- **Schools** are a potential customer for structured arts lessons and supervised rehearsal, especially where access to specialist teachers is limited.

The primary product question is: **Does this help the learner spend more time practicing?** Setup and browsing should take very little time.

## 3. Users and initial focus

| User | Primary job |
| --- | --- |
| Curious beginner or returning adult | Understand Kuchipudi and try a manageable first lesson. |
| Student learning with a teacher | Recall class instruction, practice assigned steps, and improve between classes. |
| Parent or guardian | Understand the lesson and support a child's practice without needing technical expertise. |
| Teacher | Provide demonstrations, assign practice, preserve corrections, and review progress. |
| School coordinator — later phase | Organize group learning and rehearsal with periodic specialist supervision. |

**Proposed initial focus:** One Kuchipudi teacher and their beginner students, with a free introductory lesson available to newcomers. Validate the practice experience before expanding into school administration or a teacher marketplace.

## 4. Core experience: adapt Raaga's learning loop

Raaga uses **Listen → Your turn → Compare → Repeat**. Kuchipudi adapts this to **Watch → Try → Review → Repeat**.

1. **Discover:** Open the Kuchipudi module, understand what will be learned, and try a free introductory exercise of approximately two minutes.
2. **Watch:** See a teacher demonstrate one step, with clear explanations and a short list of things to notice.
3. **Try:** Follow the demonstration in a suitable space, using a phone, tablet, or laptop. Camera use is optional for basic practice.
4. **Review:** Compare with the demonstration, revisit the teacher's cues, and receive limited automated feedback where validated.
5. **Repeat:** Practice the same segment, record a reflection or completion, and see what to work on next.
6. **Continue:** Return through a personal reminder or teacher assignment; connect with a teacher when ready for guided learning.

## 5. MVP requirements

| Capability | Basic requirement |
| --- | --- |
| Beginner introduction | Explain the art form and essential lesson terms in plain language. Let a newcomer begin the free lesson without extensive setup. |
| Structured lesson path | Offer a small, teacher-approved sequence of approximately 5–6 beginner lessons. Show prerequisites and a clear next lesson. The teacher determines the actual steps and order. |
| Demonstration player | Support replay, slower playback, and looping a short segment. Clearly explain left/right orientation when demonstrating movements. |
| Practice guidance | Show the teacher's key posture, arm-position, movement, and rhythm cues for the specific lesson. Keep cues brief enough to use while practicing. |
| Self-review | Offer an optional camera preview and recorded take for comparison with the demonstration. Support a useful practice session without camera permission. |
| Teacher connection | Allow a teacher to organize a small class, assign lessons, attach corrections, and review a learner's practice history or deliberately shared take. Keep teacher feedback distinct from automated feedback. |
| Practice habit | Let learners choose practice days and times and opt into reminders that name the assigned step or focus. Make resuming the last exercise easy. |
| Progress and parent visibility | Track sessions, practice time, completed lessons, and current focus. Give linked parents a simple summary. Completion records practice; teacher review establishes readiness to advance. |

For the pilot, content can be prepared with the teacher and loaded by the product team. A full self-service course-authoring system is unnecessary initially.

## 6. AI feedback: validate one narrow use case first

The conversation identifies camera-guided correction as a major opportunity. The first technical experiment should use **one teacher-selected foundational stance or step**, with explicit teacher-defined checks.

- Show framing guidance so the learner can position the camera appropriately.
- Explore an overlay or visual reference for a small number of observable cues, such as arm position or body alignment.
- Account for body proportions and the camera view; do not enforce a single universal body template.
- Give one actionable correction at a time. If the view is insufficient or confidence is low, say that the movement cannot be assessed.
- Have the teacher evaluate feedback on representative learners and ordinary devices before including it in the pilot experience.

The lesson and self-review flow should remain useful if automated assessment is unavailable. Full movement scoring, expression assessment, and artistic judgment are outside the initial scope.

## 7. Content and platform requirements

**Content:** Each lesson needs a teacher-approved demonstration, a learning objective, prerequisites, key cues, common mistakes, and a suggested practice task. Use recordings supplied with permission and retain teacher attribution. The teacher reports that basic-step videos already exist; videos for Jatis, described in the conversation as collections of steps, are still pending.

**Access:** Start with a mobile-friendly web app/PWA, following Raaga's accessible browser model. Ordinary internet access and a phone should be sufficient; specialized tracking hardware should not be required. Provide lesson-specific space and movement guidance.

**Privacy:** Make camera capture and sharing explicit. Keep recordings private by default, support deletion, and provide guardian-controlled sharing for child learners. Explain any external video processing before it occurs.

**Platform structure:** Organize content as art form → course → lesson → practice session, with learner, teacher, and guardian roles. Share lesson navigation, assignments, reminders, and progress across arts; use different assessment tools for singing and dance.

## 8. Scope and roadmap

| Phase | Outcome |
| --- | --- |
| First prototype | One real teacher video, segmented playback, guided practice, self-review, and a narrow camera-feedback experiment. Obtain teacher feedback on correctness and usability. |
| Beginner pilot | Small lesson sequence, teacher assignments and corrections, practice history, parent summaries, and personalized reminders. |
| School use | Class and cohort management, scheduled group practice, and teacher-created choreography broken into rehearsal segments. Teachers supervise quality and synchronization. |
| Broader platform | Additional art modules, participating-teacher discovery, richer content authoring, and commercial plans if usage supports them. |

**Outside the initial scope:** Advanced repertoire, autonomous choreography, replacing a guru, comprehensive assessment of artistic expression, a full school ERP, and payments or sponsorship infrastructure.

## 9. Success criteria

**Primary measure:** Learners repeatedly complete meaningful practice between classes.

For the pilot, measure:

- Time from opening the app to starting the first exercise; proposed target: under two minutes.
- Introductory lesson completion and return for a second practice session within seven days.
- Practice days per learner per week and completion of teacher-assigned exercises.
- Teacher-observed recall and improvement in the specific cues being practiced.
- Teacher time spent repeating routine explanations or correcting the same foundational mistakes.
- Agreement between teacher judgment and automated feedback, including misleading corrections.

Establish a baseline with the pilot teacher before setting retention or learning-improvement targets. The conversation's aspiration to handle “80%” of teacher work is not a validated product claim or launch target.

## 10. Decisions still needed

1. Which exact 5–6 beginner lessons, terms, and progression criteria does the teacher recommend?
2. Which existing recordings can be used, and which need a different angle or clearer segmentation?
3. Which single stance or step is suitable for the camera-feedback experiment?
4. Which learner age group and devices should the first pilot support?
5. What school demand and purchasing process can be validated directly? Statements in the conversation about mandatory arts curricula remain unverified.

**First build brief:** Create the Kuchipudi module of LMS for Arts around one teacher-approved lesson: watch a demonstration, practice it, review specific cues, and try again. Expand after the teacher and learners confirm that it improves practice.

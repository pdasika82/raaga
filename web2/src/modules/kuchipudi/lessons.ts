export interface DanceLesson {
  id: string;
  title: string;
  focus: string;
  minutes: number;
  introduction: string;
  task: string;
  cues: string[];
  exampleQuery: string;
}

/** Starter practice scaffolding. Technical demonstrations must come from a teacher. */
export const DANCE_LESSONS: DanceLesson[] = [
  {
    id: 'begin', title: 'Begin with observation', focus: 'Notice before you move', minutes: 2,
    exampleQuery: 'Kuchipudi beginner basic steps teacher demonstration',
    introduction: 'A little attention is a good place to start. Watch a short Kuchipudi demonstration from your teacher and notice how movement and rhythm work together.',
    task: 'Choose a short passage. Watch it once as a whole, then again with your attention on the feet, arms, and pauses. Write down one thing you noticed and one question for your teacher.',
    cues: ['I watched the passage more than once.', 'I noticed where the movement starts and pauses.', 'I have one question to take to my teacher.'],
  },
  {
    id: 'prepare', title: 'Prepare your practice space', focus: 'Make practice a habit', minutes: 2,
    exampleQuery: 'Kuchipudi beginner practice preparation posture lesson',
    introduction: 'Create a simple routine you can return to between classes. Keep your demonstration visible and make enough room to move without obstacles.',
    task: 'Check the floor and the space around you, position your screen, and follow the preparation routine your teacher has given you. If using the camera, check that your full body is visible.',
    cues: ['My practice space is clear.', 'I can see the demonstration without holding my device.', 'I know which exercise my teacher wants me to practice.'],
  },
  {
    id: 'first-step', title: 'Revisit your first step', focus: 'One movement at a time', minutes: 3,
    exampleQuery: 'Kuchipudi basic steps adavus slow tutorial',
    introduction: 'Use the first step you have already learned in class. The goal is to recall your teacher’s instruction and repeat it with attention.',
    task: 'Load your teacher’s recording. Loop one short segment, watch it slowly, and repeat the step at a comfortable pace. Pause when you need to check a detail.',
    cues: ['I followed the same sequence as the demonstration.', 'I checked the specific correction from my last class.', 'I can name the part I want my teacher to review.'],
  },
  {
    id: 'alignment', title: 'Notice your alignment', focus: 'Bring class corrections home', minutes: 3,
    exampleQuery: 'Kuchipudi beginner posture arm positions tutorial',
    introduction: 'Small details are easy to forget after class. Work with the stance and arm positions your teacher has already shown you.',
    task: 'Choose one correction from class. Compare your practice with the teacher’s demonstration, focusing only on that detail. Use the optional camera as a mirror, not as a correctness score.',
    cues: ['I chose one specific correction to work on.', 'I compared my position with the teacher’s example.', 'I stayed within a comfortable range of movement.'],
  },
  {
    id: 'rhythm', title: 'Move with a count', focus: 'Connect the step and the rhythm', minutes: 4,
    exampleQuery: 'Kuchipudi basic steps counts rhythm slow tutorial',
    introduction: 'Return to a familiar movement and listen to the counts in your teacher’s recording. Let the demonstrated rhythm guide your repetition.',
    task: 'Listen to the passage first. Follow the counts without rushing, then repeat the familiar movement with the recording. Slow the video if needed.',
    cues: ['I listened to the counts before moving.', 'I repeated the movement at a manageable pace.', 'I noticed where I lost or regained the count.'],
  },
  {
    id: 'sequence', title: 'Bring it together', focus: 'Repeat, reflect, return', minutes: 5,
    exampleQuery: 'Kuchipudi beginner adavu sequence demonstration',
    introduction: 'Practice a short sequence your teacher has assigned. Break it into manageable segments, then connect them when you feel ready.',
    task: 'Repeat each segment, then try the whole passage. Record an optional take for your own review and choose one focus for your next session. Ask your teacher when to advance.',
    cues: ['I practiced the individual segments.', 'I tried connecting the segments.', 'I chose a focus for my next practice.'],
  },
];

export function danceLesson(id: string): DanceLesson {
  return DANCE_LESSONS.find(lesson => lesson.id === id) ?? DANCE_LESSONS[0];
}

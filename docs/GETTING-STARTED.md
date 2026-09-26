# Raaga for absolute beginners

Raaga listens while you sing, tells you which note you are on and whether it belongs to
the scale you are practising, records your practice, and lets a coach model comment on
it. This guide takes you from zero to your first feedback in about twenty minutes.

## Three words you need

- **Pitch / note.** How high or low a sound is. Music divides pitch into named steps.
  Western names are C D E F G A B; Indian names (swaras) are S R G M P D N. The app
  can show either.
- **Sa (tonic).** Your home note. Everything else is measured from it. There is no
  "correct" Sa; you pick one that sits comfortably in your voice.
- **Scale / raga.** The set of notes allowed in an exercise. The major scale and the
  raga Shankarabharanam are the same seven notes; Mohanam uses only five.

## 1. Set up (2 minutes)

1. Open the app. Tap **Start listening** and allow the microphone.
2. Settings: choose **Note names**. Pick *Indian (S R G)* for Carnatic or Hindustani
   lessons, *Western (C D E)* otherwise.
3. Optional now, needed for feedback later: paste an Anthropic API key and tap
   **Save key**. Get one at console.anthropic.com. Nothing is sent until you ask for
   feedback, and the audio itself never leaves the phone.

Practise in a quiet room with the phone about a forearm's length from your mouth.

## 2. Set your pitch (5 minutes)

Two settings decide where every exercise sits. Both are on the Practice screen under
**Pitch setup**.

- **Your Sa**: the note name, such as G. Every swara is measured from it.
- **Starting note**: how high or low you sing that Sa, such as G3. The exercise's
  highest note is one octave above it.

Tap **Find comfortable Sa** and follow the four steps: hum a relaxed note three
times, hear the suggested Sa and a short phrase, sing the lesson's highest and lowest
notes and say whether they felt comfortable, then confirm. **Adjust** sets the two
values separately, each with a preview. Keep the result fixed for a few weeks.

## 3. Practise

1. Pick a lesson. The tiles show the swaras it will ask for, in order.
2. Tap **Start practice**. After a three-second countdown the app records and shows
   the first swara to sing, for example **Sa**, with "Hold each note for 1 second".
3. Sing it. The box under the swara says what to do:
   - **On pitch · Hold it**: stay until the tile turns green and the next swara appears.
   - **A little low · Raise your pitch slightly** (or high / lower).
   - **That didn't match Sa · Listen to the reference and try again**: the target
     plays once; sing it again. Your Sa does not change during an exercise.
   - **Can't hear clearly**: sing a steady "aa", a little louder.
4. **Play Sa** plays the target. **Pause** stops the recording without ending it.
   **Skip note** moves on. When the last swara is done the review opens, or tap
   **Finish & review**.

**Pitch details** below the card shows the target (S · G3), what was detected
("Near Sa", "Near Ri₁ (outside this scale)", or "Between Ri₁ and Ri₂"), and the
difference in cents. The line under it names the scale's svarasthanas, for example
Ri₂: Chatusruti Rishabham. **Recent attempts** on the right lists each judged note.

If you keep singing an octave below the starting note, the app offers once to lower
it. Nothing else changes your settings mid-exercise.

## 4. Read the review

The review opens with **Your next step**: one observation ("Ri was a little high")
and one button, such as **Practise Sa–Ri–Ga–Ri–Sa**. Tap it and the app sets up
that short drill for you. Below that:

- **What you sang**: the recording, and a chart where shaded bands are the notes the
  exercise asked for and dots are what you sang. Play the recording and a line moves
  along the chart. Tap a dot to see what it was, replay just that note, hear the
  target tone, or **Retry** that note as a drill.
- **Explore a note**: one chip per note with a verdict (On pitch, A little high,
  Not matched). Tap one to jump to it on the chart.
- **Practice guidance**: tap **Get practice guidance** for a written review from
  Claude. It works from the pitch measurements and the lesson text only, so it can
  advise on pitch, not on tone, breath or diction. Needs your API key.
- **Exact measurements** and **Add a practice note** are folded away at the bottom.

## 5. Lessons, in order

Carnatic lessons come first in the picker. A good first fortnight:

1. **First notes**, until every swara is green on the first try. Shankarabharanam is
   one common starting raga; the Mayamalavagowla version is another.
2. **Sustain Sa**: three six-second holds.
3. **Sarali Varisai 1**, slowly. Then Sarali 2 and Janta 1.
4. **Mayamalavagowla** and **Mohanam** to hear different scales from the same Sa.

Western lessons (major scale, arpeggio) are further down if you want them; they use
the same Sa and the same note names unless you switch to Western names in Settings.

## 6. How to improve

- Fix one thing per session: the note the feedback listed first.
- Hold notes longer than feels natural; wobble shows up as a low steadiness figure.
- Sing the exercise slower until it is all green, then speed up.
- Compare scores for the same lesson across a week, not between different lessons.
- Keep Sa fixed for at least a month so your ear learns the intervals.

## If something looks wrong

- **A red note appears while you are silent.** The mic is picking up room noise or a
  hum. Move away from fans and appliances, or sing louder so your voice dominates.
- **No note at all.** Sing louder, get closer, or check the browser allowed the mic.
- **The note is right but an octave off (C2 instead of C3).** Common with very low or
  breathy sounds; sing with a bit more energy.
- **A drone or tanpura confuses it.** The detector follows one voice at a time. Keep any
  drone quiet or in headphones.

## Appendix

Every note's frequency from C2 to C6, the twelve svarasthanas with their ratios from Sa,
and a worked example are in [PITCH-TABLE.md](PITCH-TABLE.md).

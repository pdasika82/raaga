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

## 2. Find your Sa (5 minutes)

1. On Practice, tap **Find my Sa ›** (also in Settings next to the Sa picker).
2. Tap Start listening, then sing "aa" on a comfortable, relaxed pitch, neither low
   and gravelly nor high and strained. Hold it until the green bar fills.
3. The app tells you what you sang, for example "You sang C3 (131 Hz). Your Sa is C".
   Tap **Use Sa = C and continue**.
4. It then asks for Ri, Ga, Pa and the upper Sa in turn. Tap **Hear it** to hear each
   target, sing it, and read the verdict: in tune, sharp or flat, or a different note.
   If the upper Sa strains, come back and pick a Sa one or two letters lower.
5. Sa is now set. Repeat this any time it feels wrong; keep it fixed once it feels
   right.

Typical ranges: men C to D♯, women G to A♯. Yours may differ; trust the test.

## 3. Read the meter

- **Big letter**: the note you are singing, as a swara or Western name.
- **Colour**: green is in tune, yellow slightly off, orange clearly off, red means the
  note is not in this scale at all (the small line names the nearest note that is).
- **Needle and cents**: how far you are from the note. The scale runs from −50
  (flat) to +50 (sharp); 100 cents is one whole step to the next note. Aim for the
  green band, which is within 10 cents.
- **Pills** (S R G m P D N Ṡ): the notes of the scale. The one you are on lights up.
- **Thin bar**: your volume. If it barely moves, sing louder or move closer.

## 4. Your first lessons

Do these in order. Slow is good. Ten focused minutes beats an hour of drifting.

1. **Sustain Sa.** Hold Sa for 8 to 10 seconds, three times. Goal: the needle stays
   in the green and does not wobble.
2. **Sarali Varisai 1** (or **Major scale** for the Western path). Up and down, one
   note per second. Goal: every pill lights green in turn, no red.
3. **Janta Varisai 1** (or **Major arpeggio**). Adds jumps and repeated notes.

Before you sing a note, hear it in your head. If a note keeps coming out red, stop and
hum slowly from the previous note up to it.

## 5. Record and get feedback

1. Pick the lesson, tap **Record**, sing the exercise, tap **Stop**.
2. The session opens. Check three things: the **score** (aim to raise it over time,
   not to hit 100 today), **Notes sung** (does it match what the lesson asked for?),
   and the **chart** (red dots are wrong notes, dots far from a line are out of tune).
3. Write one line in **Your note** about how it felt, then tap
   **Get feedback from Claude**. The reply names the notes that went well, the ones
   to fix in priority order, and one drill for next time.
4. Do that drill as your next recording.

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

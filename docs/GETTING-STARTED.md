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

1. Open https://pdasika82.github.io/raaga/ in Safari. In Safari's Share menu choose
   **Add to Home Screen**; it then opens like an app and works offline.
2. Optional, needed for written guidance later: Settings → paste an Anthropic API key
   from console.anthropic.com. Nothing is sent until you ask for guidance, and the
   audio itself never leaves the phone.

Practise in a quiet room with the phone about a forearm's length from your mouth.

## 2. Set your pitch (5 minutes)

Tap the **Sa · Start** chip in the top bar, or **Find a comfortable Sa**. Two settings
decide where every exercise sits:

- **Sa**: the note name, such as G. Every swara is measured from it.
- **Starting octave**: how high or low you sing that Sa. The exercise's highest note is
  one octave above it.

Choose them from the lists, or tap **Use microphone** and hum gently; the app suggests
a starting point. **Hear Sa** and **Hear lower Pa, Sa, upper Sa** let you check the
range before you press **Use this Sa**. Keep the result fixed for a few weeks. The ⓘ
button shows every note from low to high with its frequency.

## 3. Practise: listen, sing, compare

Pick a practice on the right. Start with **Find Sa**, then **Sa & Pa**, then **First
notes**; the Sarali Swaralu come after. Above the list, choose the raga for these:
**Mayamalavagowla** is the traditional first raga, **Shankarabharanam** has the same
notes as the Western major scale. Ask your teacher which they use.

1. **Listen.** Tap **Listen to example**. After a 3-2-1 count the tone guide plays the
   phrase and the tiles light up in turn. Tap any tile to hear that swara alone.
2. **Your turn.** Tap **Start singing**. With the pace set to **Your pace** there is no
   clock: sing a swara, hold it as long as you like, then take a short breath; the next
   tile lights up after the pause. (Turn off **Pause between swaras** if you prefer to
   slide straight from one swara to the next.) With a tempo in bpm there is a two-beat count-in and one swara per beat.
   The **Live pitch guide** switch shows what you are singing as you go.
3. **Compare.** Each tile turns green (matched, with the cents), amber (a little high
   or low), red (a different swara, named) or grey (not heard). **Replay** plays your
   take, **Try again** goes back to singing, **Full review** opens the saved session.
   The score and its two ingredients sit beside **Pitch details**, which lists every
   note with what was detected and the difference in cents.

**Speeds.** The Sarali Swaralu have a **Speed** switch: 1 is one swara per beat, 2 is
two, 3 is four, as in the traditional three speeds. The pace is the tala beat and does
not change; the swaras get faster inside it. A tile marked **hold 2** is a karvai, a
note held for two counts.

**Drone.** **♫ Drone** in the top bar starts a tanpura tuned to your Sa with its own
volume. Keep it soft, or use headphones, so the microphone hears your voice.

## Free practice: singing from a book or with a teacher

The **Free practice** tab listens without prompting. Pick what you're singing, or
"Anything", press **Start listening**, sing for as long as you like, then **Stop**.

- While you sing it shows the swara you're on, how far from it, and a strip of the
  notes you've sung, coloured by tuning.
- With a lesson picked, Stop finds every time you sang it, even repeated, at another
  speed, or after a false start, and shows each pass as tiles with the cents. It also
  names swaras that were consistently sharp or flat across passes, such as "Ma flat by
  about 33¢". First and second speed follow reliably; third speed is approximate.
- With "Anything", Stop lists each swara with how long you sang it and its average
  tuning, and any notes outside the raga.

If a lesson isn't found, check that Sa and the starting note in the top bar match the
book or teacher.

## 4. Written guidance

On a saved session, **Get practice guidance** sends the lesson text and the pitch
measurements to Claude and stores the reply. It can advise on pitch and sequence, not
on tone, breath or diction. Needs your API key.

## 5. Lessons, in order

1. **Find Sa** and **Sa & Pa** until both come out green every time.
2. **First notes** at your pace, then at 60 bpm.
3. **Sarali Swaralu 1** at first speed, then second, then third. Move to the next
   varisai only when the third speed is mostly green.
4. **Mayamalavagowla** and **Mohanam** to hear other scales from the same Sa.

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

# WordlEffect

A five-letter word game where the world starts as nothing and lights up as you find the answer.

It plays like Wordle: six guesses at a hidden five-letter word. But the screen begins pure black with thirty faint
squares, and every letter you find wakes a little more of it: schools of light, colour clouds, a glowing frame and a
soundtrack that grows from one low drone into piano, bells and a heartbeat. The idea is: what if Wordle were played
the way Tetris Effect plays Tetris? Calm, multi-sensory, and almost wordless.

<p align="center">
  <img src="docs/demo.gif" alt="A round of WordlEffect: a guess with four green letters links them with light, then the solve sets off a burst of particles that settles into a slow galaxy around the board." width="600">
</p>

**▶ [Watch the full demo with sound (docs/demo.mp4, 25 s)](docs/demo.mp4)** — the sound is half the game.

![A solved board glowing green in front of a violet nebula, with drifting shards of light and the score on the side.](docs/still.png)

---

## Contents

- [Playing](#playing)
- [What you see](#what-you-see)
- [What you hear](#what-you-hear)
- [Combos and scoring](#combos-and-scoring)
- [HDR](#hdr)
- [Running it](#running-it)
- [How it works](#how-it-works)
- [Accessibility](#accessibility)
- [Known limits](#known-limits)
- [Credits](#credits)

## Playing

Type a five-letter word and press **Enter**. Each letter is checked in turn, on the beat:

| Tile | Meaning |
| --- | --- |
| Green glass | Right letter, right place |
| Amber glass | The letter is in the word, somewhere else |
| Dim | The letter is not in the word |

Guesses must be real words (about 12,600 are accepted); answers come from 800 common ones. Use your keyboard or the
on-screen keys. When a round ends, the **⏎** key pulses: press Enter to play again. The session total carries over.

There is almost no text on purpose. The only words on screen are the small labels beside the board.

## What you see

All of it is drawn on the GPU behind the board, so the light shows through the glass tiles.

- **The world wakes only from letters you find.** A guess with no hits leaves it dark. One green letter wakes a few
  hundred shards; the full school, the clouds and the frame only arrive as you close in. Guessing alone adds nothing.
- **The school.** About 2,400 crisp shards, tumbling flakes and a few sparks swim along a flowing current that slowly
  circles the board. Near ones are larger and out of focus, far ones tiny and sharp. Shards catch the light as they
  turn, like fish scales.
- **Colour.** Deep blue drifting toward teal as you progress, with violet and magenta clouds. The tint also shifts
  with whichever chord the music is on. A win turns everything into slowly cycling colour; a loss turns it cold and
  lets it snow.
- **The frame.** A large rounded square behind the board, echoing the tiles. It breathes on a spring when you type,
  shrinks a little when you delete, flashes and lets its light drift along the edge when you find a letter, shakes
  when a word is rejected, and springs wide on a win.
- **Each check.** As each letter is checked, the letter and its tile flash white, then hand over to the coloured
  glass. Greens burst into green shards and send out a soft ring; ambers circle their tile, then wander along the
  row as if looking for their seat; misses drop a few dull flakes.
- **Light you keep.** Light from every new green stays, joining a slow galaxy that orbits the board until the round
  ends. A win throws all of it outward in a supernova, and the fewer guesses you used, the brighter it is.

## What you hear

Everything is synthesized live in the browser except the piano, which is a real sampled grand. Each note gets small
random differences in timing, loudness and tuning, so nothing sounds mechanical.

- **The arpeggio.** Each column owns one note of a C major 7 arpeggio, C E G B and C an octave up. A green letter
  plays its column's note as a sustained, echoing piano note, so solving the word plays the whole arpeggio home.
  Amber letters play a soft glass tone that slides up into pitch; misses are a muffled low note that stays in key.
- **On the beat.** Reveals wait for the next beat of the music instead of firing on the keypress.
- **Every word has a tune.** Each letter maps to a note of the pentatonic scale, so typing a word plays its own little
  melody. Deleting plays the note backwards.
- **The bed.** A quiet drone fades in on your first keypress. Under it the chords move slowly through C, A minor, F
  and G. As the world wakes, a pad opens up, a high shimmer joins, a music box starts wandering the scale, and near
  the end a soft heartbeat comes in.
- **Tension.** When only one or two letters are missing, or you are down to your last guesses, a muted pulse starts
  ticking on the chord's root and fifth, a shaker joins, and the heartbeat doubles its pace.
- **Endings.** A win settles on a quiet chord of home and plays the solved word's own tune back as a melody. A loss
  settles on A minor and plays the answer's tune softly as its letters appear under the board.

## Combos and scoring

**Chains.** Green letters side by side in one guess link up with threads of light, their notes gain an octave above,
and a rising glass run plays after the row.

**Streaks.** Each guess in a row that finds a new green adds a ring of light orbiting the board. A streak of two
brings in the heartbeat. A guess with no new green lets the rings fall away.

The side panel shows guesses used, the streak and a ring that fills as the world lights up on the left; time, the
round's score and the session total on the right.

| Event | Points |
| --- | --- |
| New green letter | 100 × (1 + 0.5 per earlier green in its chain) × (1 + 0.25 per streak level) |
| Green you already had | 10 |
| Amber letter | 25 |
| Solving | 500 × (7 − guesses used) |

## HDR

On an HDR display the brightest moments, like the letter flashes, spark cores and glints on the shards, are drawn
brighter than white. This uses a WebGPU canvas in extended tone-mapping mode.

| Browser | What you get |
| --- | --- |
| Chrome / Edge with WebGPU | HDR on HDR displays |
| Safari with WebGPU | Same look; HDR output depends on Safari's support for extended tone mapping |
| No WebGPU (WebGL2) | Same look, clamped to normal brightness |

The demo video was recorded in SDR, so it shows none of this.

## Running it

Requires Node 22.18 or newer (the tests run TypeScript directly).

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173. Other scripts:

```bash
npm test         # rules: scoring, chains, energy, tension, keyboard states
npm run build    # type-check and build to dist/
npm run lint     # oxlint
```

The piano samples stream from the Tone.js sample host the first time you press a key, so you need to be online for
the piano.

## How it works

| File | What it does |
| --- | --- |
| [`src/App.tsx`](src/App.tsx) | The game: input, reveal timing, the HUD, wiring sound and light together |
| [`src/game.ts`](src/game.ts) | Pure rules: scoring guesses, chains, energy, tension, points ([tests](src/game.test.ts)) |
| [`src/fx.ts`](src/fx.ts) | The light: the school, bursts, galaxy, frame, waves and the letter flashes |
| [`src/gpu.ts`](src/gpu.ts) | A small instanced renderer: WebGPU with HDR, or WebGL2 |
| [`src/audio.ts`](src/audio.ts) | The music: piano sampler, synths, reverb, echo, the beat grid and the drone |
| [`src/words.ts`](src/words.ts) | Answer list and guess validation ([`valid.txt`](src/valid.txt)) |
| [`src/index.css`](src/index.css) | Tiles, keyboard, HUD and their animations |

A few details worth knowing:

- **One GPU draw per frame.** Every particle, cloud, ring and letter is one instance of a single quad; the fragment
  shader decides its shape (shard, flake, spark, cloud, ring, frame, letter or tile). The simulation runs on the CPU
  and takes well under a millisecond per frame for about 3,000 instances.
- **The school swims in a curl field**, a flow with no sources or sinks, so it streams and eddies without ever
  clumping, plus a slow swirl around the board.
- **HDR letters line up with the real ones.** The letters are drawn into a texture using the page's own font and
  layout metrics, so the GPU letter lands within a fraction of a pixel of the DOM letter before handing over to it.
- **Sound drives light.** The music's heartbeat, chord changes and music-box notes are sent to the visuals, which
  pulse, shift colour and make patches of the school flicker in time.
- **The beat grid.** Audio is scheduled ahead on Web Audio's clock; visuals for each reveal are timed to the same
  moment, so a flash and its note land together.

## Accessibility

- Every result is announced to screen readers: each letter's state, invalid words, wins and the answer on a loss.
- With **reduce motion** turned on, particle counts drop to about a third, the win flash is dimmed, the row shake is
  skipped, and tile animations are off.
- Full keyboard play; on-screen keys are real buttons with labels.

## Known limits

- The piano is silent offline or until its samples load; the rest of the music still plays.
- Answers are random each round, not a daily word, and there are no saved stats.
- Safari's HDR output is not confirmed (see [HDR](#hdr)).

## Credits

- Piano: [Salamander Grand Piano](https://sfzinstruments.github.io/pianos/salamander) by Alexander Holm, CC-BY 3.0,
  via the [Tone.js](https://tonejs.github.io/) sample host.
- Word list derived from [an-array-of-english-words](https://github.com/words/an-array-of-english-words) (MIT).
- Built with React, TypeScript and Vite.
- Inspired by [Wordle](https://www.nytimes.com/games/wordle/) and [Tetris Effect](https://www.tetriseffect.game/).
  WordlEffect is an independent fan project, not affiliated with or endorsed by The New York Times, Enhance or The Tetris
  Company.

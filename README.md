# WordlEffect

A five-letter word game where the world starts as nothing and lights up as you find the answer.

It plays like Wordle: six guesses at a hidden five-letter word. But the screen begins pure black with thirty faint
squares, and every letter you find wakes a little more of it: schools of light, colour clouds, a glowing frame and a
soundtrack that grows from one low drone into piano, bells and a heartbeat. The idea is: what if Wordle were played
the way Tetris Effect plays Tetris? Calm, multi-sensory, and almost wordless, ironically.

## TRY IT HERE: https://wordleffect.vercel.app

![A solved board glowing green in front of a violet nebula, with drifting shards of light and the score on the side.](docs/still.png)



https://github.com/user-attachments/assets/45bbfa04-e233-458d-8001-7856e0133c96

*🔊 Sound up!*

---

## Contents

- [Playing](#playing)
- [What you see](#what-you-see)
- [What you hear](#what-you-hear)
- [Combos and scoring](#combos-and-scoring)
- [Playing together](#playing-together)
- [HDR](#hdr)
- [Running it](#running-it)
- [How it works](#how-it-works)
- [Accessibility](#accessibility)
- [Known limits](#known-limits)
- [Credits](#credits)

## Playing

The faint **EN / ID** in the bottom-left corner switches between English and Indonesian words.

Type a five-letter word and press **Enter**. Each letter is checked in turn, on the beat:

| Tile | Meaning |
| --- | --- |
| Green glass | Right letter, right place |
| Amber glass | The letter is in the word, somewhere else |
| Dim | The letter is not in the word |

Guesses must be real words (about 12,600 are accepted); answers come from 800 common ones (so you won't get something like `avyze`). Use your keyboard or the
on-screen keys. When a round ends, the **⏎** key pulses: press Enter to play again. The session total carries over.

## What you see

- **It starts dark.** Only correct letters bring the light in. Guessing alone doesn't.
- **A school of light.** Thousands of tiny shards drift around the board and glint as they turn.
- **Colour.** Deep blue that slowly warms to teal as you get closer.
- **The frame.** A big glowing square behind the board that reacts to every key you press.
- **Every check flashes.** Each letter lights up white as it's checked, then settles into its colour.
- **Light you keep.** Every green you find adds to a galaxy around the board. Solve it, and it all bursts.

## What you hear

- **Each column has a note.** Green letters play C, E, G, B, C on piano, so solving plays the full chord.
- **Every word has a tune.** Each letter has its own note, so typing a word plays a little melody.
- **Everything lands on the beat.** Letters are revealed in time with the music.
- **The music grows with you.** A quiet drone at first, then pads, bells and a heartbeat as you find letters.
- **It gets tense near the end.** One or two letters left, or few guesses left, and a soft pulse starts ticking.
- **Endings.** Win, and the piano plays your word's tune back to you. Lose, and it plays the answer, softly.

The piano is a real sampled grand. Everything else is made live in the browser.

## Combos and scoring

- **Chains.** Greens next to each other link up with light and ring out brighter.
- **Streaks.** Find a new green on every guess and rings of light build up around the board.

The side panel shows your guesses, streak and progress on the left, and time and score on the right.

| Event | Points |
| --- | --- |
| New green letter | 100 × (1 + 0.5 per earlier green in its chain) × (1 + 0.25 per streak level) |
| Green you already had | 10 |
| Amber letter | 25 |
| Solving | 500 × (7 − guesses used) |

## Playing together

Up to 8 people, peer to peer, with no server of ours in the middle.

- **Join with a word.** Click the two-squares icon in the bottom-left corner. You get a room named by a five-letter
  word, like `amber`. Share the link (`wordleffect.vercel.app/#amber`), or have friends type the word on the board.
- **Everyone else is a panel.** Their boards sit beside yours, showing colours only, never letters. Each player is a
  colour: rose, gold, fern, mint, teal, sky, iris, violet.
- **Same words for everyone.** You all play the same list of words, each at your own pace.
- **Locks.** A long streak, or a solve in 3 guesses or fewer, sends locks to whoever is ahead. They wait beside that
  player's board and freeze rows when they next guess. A lock never takes your last row. Locks you earn melt your
  own waiting ones first.
- **You can hear each other.** When a friend finds a letter, its note sounds faintly from their side of the screen.

### Modes

| Mode | How it works |
| --- | --- |
| Last light | Fail a word and your light goes out. The last one lit wins. Every 3 minutes, every board loses a row. |
| Tide | A timed race (3, 5 or 10 minutes). Highest score wins. |
| Stars | First to solve 3 words (or 5) wins. |

### Room settings

Whoever made the room sets these in the lobby: the mode, rows per board (4 to 8), locks (off, gentle, fierce),
the language (English or Indonesian), seats (2 to 8), skills (on or off) and any of the trials below. Each trial
that's on multiplies your points by 1.25. Every mode and trial has a small (i) that explains it.

| Trial | What changes |
| --- | --- |
| Strict | Letters you found must stay: greens in place, ambers somewhere in the word. |
| Undertow | 8 bars per guess. Run out and a row freezes. On your last row, you lose the word. |
| Fading | Colours drain from your board after a few seconds, and the keyboard keeps none. Play from memory. |
| Heavy frost | Frozen rows carry into your next word. A solve in 3 or fewer thaws one. |
| Squatter | Locks stamp a letter you can't delete into your next row instead of freezing it. Your guess works around it. |
| Hot potato | A potato with a hidden fuse sits on someone's board. Solve a word to throw it at the leader. Whoever holds it when it goes off takes 3 locks. |
| Rigged | When you're in last place, you pick the leader's next word from three nasty ones. |
| Jinx | Guess exactly the same word as someone else on the same word number, and you both lose a row. |

### Skills

With skills on, every word you solve spins a reel and gives you a skill. You hold up to three; press **1**, **2** or
**3** (or click the slot) to use one. Everyone can see everyone's skills.

| Skill | What it does |
| --- | --- |
| Thaw | Melts all your frozen rows and any locks waiting for you. |
| Lantern | Lights up one letter of your answer in its right box. |
| Second wind | Your next wrong guess blows away and doesn't use up a row. |
| Decoy | The next 2 locks aimed at you go to someone random instead. |
| Mirror shield (rare) | The next lock or swap aimed at you bounces back to whoever sent it. |
| Swap (legendary) | Trade boards mid-word with the leader, or click any board to pick someone else. |

### Good to know

- Public Nostr relays introduce the players to each other. After that, the game goes browser to browser over WebRTC.
- Like any peer-to-peer game, the people you play with can see your IP address.
- Some networks block WebRTC, such as VPNs (Cloudflare WARP blocks it) and some office or mobile networks. If friends
  can't find each other, try turning the VPN off.
- To try it alone, open two tabs on `localhost:5173/?local#amber`. `?local` connects tabs of one browser directly,
  with no network at all.

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
npm test         # rules: scoring, chains, energy, tension, keyboard states, locks, word order
npm run build    # type-check and build to dist/
npm run lint     # oxlint
```

The piano samples stream from the Tone.js sample host the first time you press a key, so you need to be online for
the piano. Though, any other sample works just fine offline since they're synthesized right then in your browser.

## How it works

| File | What it does |
| --- | --- |
| [`src/App.tsx`](src/App.tsx) | The game: input, reveal timing, the HUD, wiring sound and light together |
| [`src/game.ts`](src/game.ts) | Pure rules: scoring guesses, chains, energy, tension, points ([tests](src/game.test.ts)) |
| [`src/fx.ts`](src/fx.ts) | The light: the school, bursts, galaxy, frame, waves and the letter flashes |
| [`src/gpu.ts`](src/gpu.ts) | A small instanced renderer: WebGPU with HDR, or WebGL2 |
| [`src/audio.ts`](src/audio.ts) | The music: piano sampler, synths, reverb, echo, the beat grid and the drone |
| [`src/net.ts`](src/net.ts) | Playing together: rooms, the host, and checking every message from other players |
| [`src/Room.tsx`](src/Room.tsx) | Room settings and the other players' panels |
| [`src/words.ts`](src/words.ts) | Answer list and guess validation ([`valid.txt`](src/valid.txt)) |
| [`src/index.css`](src/index.css) | Tiles, keyboard, HUD and their animations |

A few details worth knowing:

- **One draw call.** Every particle, cloud and letter is one GPU quad; the shader decides its shape.
- **Fast.** The simulation takes under a millisecond a frame for about 3,000 particles.
- **No clumping.** The school follows a curl-noise flow, so it streams and swirls but never bunches up.
- **The letters match.** HDR letters use the page's own font metrics, so they line up with the real ones.
- **Sound drives light.** Heartbeats, chord changes and bell notes make the visuals pulse in time.

## Accessibility

- Screen readers hear every result.
- **Reduce motion** cuts particles, the shake and tile animations.
- Fully playable by keyboard.

## Known limits

- No internet, no piano. The rest of the music still plays.
- Random word each round, no daily puzzle or saved stats.
- HDR in Safari isn't confirmed yet (see [HDR](#hdr)).
- Playing together needs WebRTC, which some VPNs and networks block (see [Good to know](#good-to-know)).

## Planned

- Daily puzzle and stats (all done and saved in browser locally, date is hashed).
- WordlEffect bot that analyzes your guesses.

## Credits

- Piano: [Salamander Grand Piano](https://sfzinstruments.github.io/pianos/salamander) by Alexander Holm, CC-BY 3.0,
  via the [Tone.js](https://tonejs.github.io/) sample host.
- Word list derived from [an-array-of-english-words](https://github.com/words/an-array-of-english-words) (MIT).
- Indonesian guesses from the hunspell-id dictionary by the hunspell-id authors, via
  [LibreOffice/dictionaries](https://github.com/LibreOffice/dictionaries) (LGPL-3.0); answers ranked with
  [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) (CC-BY-SA 4.0). See
  [src/id/NOTICE.md](src/id/NOTICE.md).
- Claude Opus 5.5.
- Peer-to-peer rooms by [Trystero](https://github.com/dmotz/trystero) (MIT).
- Built with React, TypeScript and Vite.
- Inspired by [Wordle](https://www.nytimes.com/games/wordle/) and [Tetris Effect](https://www.tetriseffect.game/).
  WordlEffect is an independent fan project, not affiliated with or endorsed by The New York Times, Enhance or The Tetris
  Company.

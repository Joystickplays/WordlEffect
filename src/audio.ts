// Every sound is synthesized live. Nothing is sampled, and nothing plays the same way twice.
import type { Mark } from './game.ts'

export const BEAT = 60 / 84
export const EIGHTH = BEAT / 2
export const BAR = BEAT * 4

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12)
const rand = (a: number, b: number) => a + Math.random() * (b - a)

const ARP = [60, 64, 67, 71, 72] // C E G B C: the Cmaj7 arpeggio, one note per column, landing home on the octave
const PENTA = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81] // letters map onto this, so every word hums its own tune
const ROOTS = [36, 33, 29, 31] // C A F G under a fixed E-G-B-D pad: Cmaj9, Am11, Fmaj13#11, G6/9
const PAD = [52, 55, 59, 62]
const BELLS = [72, 74, 76, 79, 81, 83, 84, 86, 88, 91]
const RISE = [72, 76, 79, 83, 84, 88, 91, 95, 96, 100]
const OSTINATO = [0, 7, 12, 7, 0, 7, 14, 7] // root, fifth, octave, ninth: in key over every chord

// Salamander Grand Piano by Alexander Holm (CC-BY 3.0), as hosted by the Tone.js project. One sample every
// minor third; each note plays from the nearest one, so nothing is stretched more than a semitone and a half.
const PIANO = 'https://tonejs.github.io/audio/salamander/'
const SAMPLED = Array.from({ length: 21 }, (_, i) => 33 + i * 3) // A1 … A6
const NOTE = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B']

const letterNote = (ch: string) => PENTA[((ch.charCodeAt(0) - 97) * 3) % 10] + 12

// Nearest note whose pitch class is in `home`, searching downward first.
function snap(m: number, home: number[]) {
  for (let d = 0; d < 6; d++) for (const x of [m - d, m + d]) if (home.includes(x % 12)) return x
  return m
}

export type FxEvent = 'beat' | 'glint' | 'chord'
type Tone = { pan?: number; decay?: number; rev?: number; echo?: number; bright?: number }
type Glass = { pan?: number; dur?: number; rev?: number; echo?: number; scoop?: boolean }

export class Sound {
  // The graph is built on the first keypress (browsers only allow audio after a gesture).
  ctx!: AudioContext
  master!: GainNode
  dry!: GainNode
  verb!: ConvolverNode
  echo!: GainNode
  noise!: AudioBuffer
  bass!: { osc: OscillatorNode; o: number }[]
  bassG!: GainNode
  padF!: BiquadFilterNode
  padG!: GainNode
  shimG!: GainNode
  airG!: GainNode
  samples = new Map<number, AudioBuffer>()
  energy = 0
  tension = 0
  root = 0
  bell = 4
  streak = 0
  flourish = 0
  hold = false
  t0 = 0
  next = 0
  step = 0
  timer?: ReturnType<typeof setInterval>
  onEvent?: (type: FxEvent, data: number) => void

  // Returns true the first time, when the world is created.
  wake() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return false
    }
    if (!window.AudioContext) return false
    const c = (this.ctx = new AudioContext())

    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 3
    comp.attack.value = 0.01
    comp.release.value = 0.5
    this.master = c.createGain()
    this.master.gain.value = 0.75
    this.master.connect(comp).connect(c.destination)
    this.dry = c.createGain()
    this.dry.connect(this.master)

    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
    this.noise.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1))

    for (const m of SAMPLED)
      fetch(`${PIANO}${NOTE[m % 12]}${Math.floor(m / 12) - 1}.mp3`)
        .then(r => r.arrayBuffer())
        .then(b => c.decodeAudioData(b))
        .then(buf => this.samples.set(m, buf))
        .catch(() => {}) // offline: the piano stays silent and the rest of the music plays on

    this.verb = c.createConvolver()
    this.verb.buffer = this.impulse(5.5)
    const verbOut = c.createGain()
    verbOut.gain.value = 0.85
    this.verb.connect(verbOut).connect(this.master)

    // Ping-pong echo on the dotted eighth, darker on every bounce.
    this.echo = c.createGain()
    const dl = c.createDelay(2), dr = c.createDelay(2), fb = c.createGain(), tone = c.createBiquadFilter()
    dl.delayTime.value = dr.delayTime.value = EIGHTH * 1.5
    fb.gain.value = 0.42
    tone.type = 'lowpass'
    tone.frequency.value = 2600
    const merge = c.createChannelMerger(2)
    this.echo.connect(dl)
    dl.connect(tone).connect(dr)
    dr.connect(fb).connect(dl)
    dl.connect(merge, 0, 0)
    dr.connect(merge, 0, 1)
    const echoOut = c.createGain()
    echoOut.gain.value = 0.5
    merge.connect(echoOut).connect(this.master)
    this.send(echoOut, 0, 0.35, 0)

    this.drone()
    this.t0 = c.currentTime + 0.05
    this.next = this.t0
    this.timer = setInterval(() => this.tick(), 25)
    return true
  }

  destroy() {
    clearInterval(this.timer)
    this.ctx?.close()
  }

  // A hall made of noise: highs die first, like a real room.
  impulse(sec: number) {
    const c = this.ctx, len = Math.floor(sec * c.sampleRate), buf = c.createBuffer(2, len, c.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      let lp = 0
      for (let i = 0; i < len; i++) {
        const t = i / len
        lp += (0.65 - 0.6 * t) * (Math.random() * 2 - 1 - lp)
        d[i] = lp * (1 - t) ** 3 * Math.min(1, i / (c.sampleRate * 0.015))
      }
    }
    return buf
  }

  send(node: AudioNode, dry: number, rev: number, echo: number) {
    const route = (dest: AudioNode, amt: number) => {
      if (!amt) return
      const g = this.ctx.createGain()
      g.gain.value = amt
      node.connect(g).connect(dest)
    }
    route(this.dry, dry)
    route(this.verb, rev)
    route(this.echo, echo)
  }

  voice(pan: number, dry: number, rev: number, echo: number) {
    const g = this.ctx.createGain(), p = this.ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    g.connect(p)
    this.send(p, dry, rev, echo)
    return g
  }

  lfo(rate: number, depth: number, param: AudioParam) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain()
    o.frequency.value = rate
    g.gain.value = depth
    o.connect(g).connect(param)
    o.start(this.ctx.currentTime + rand(0, 4))
  }

  drone() {
    const c = this.ctx

    const blp = c.createBiquadFilter()
    blp.type = 'lowpass'
    blp.frequency.value = 280
    this.bassG = c.createGain()
    this.bassG.gain.value = 0
    this.bass = [0, 12].map((o, i) => {
      const osc = c.createOscillator(), g = c.createGain()
      osc.type = i ? 'triangle' : 'sine'
      osc.frequency.value = mtof(ROOTS[0] + o)
      g.gain.value = i ? 0.4 : 1
      osc.connect(g).connect(blp)
      osc.start()
      return { osc, o }
    })
    blp.connect(this.bassG)
    this.send(this.bassG, 1, 0.35, 0)

    this.padF = c.createBiquadFilter()
    this.padF.type = 'lowpass'
    this.padF.frequency.value = 220
    this.padF.Q.value = 0.8
    this.padG = c.createGain()
    this.padG.gain.value = 0
    PAD.forEach(m =>
      [-7, 7].forEach(cents => {
        const o = c.createOscillator(), g = c.createGain()
        o.type = 'sawtooth'
        o.frequency.value = mtof(m)
        o.detune.value = cents + rand(-2, 2)
        g.gain.value = 0.05
        o.connect(g).connect(this.padF)
        o.start()
      }),
    )
    this.lfo(0.05, 160, this.padF.frequency) // the filter breathes like a slow tide
    this.padF.connect(this.padG)
    this.send(this.padG, 0.5, 0.9, 0.1)

    this.shimG = c.createGain()
    this.shimG.gain.value = 0
    ;[83, 88, 91, 95].forEach((m, i) => {
      const o = c.createOscillator(), g = c.createGain()
      o.frequency.value = mtof(m)
      g.gain.value = 0.25
      this.lfo(0.07 + i * 0.045, 0.25, g.gain) // each voice swells on its own clock, so the shimmer never loops
      o.connect(g).connect(this.shimG)
      o.start()
    })
    this.send(this.shimG, 0.15, 1, 0.4)

    // Wind / distant ocean.
    const air = c.createBufferSource(), bp = c.createBiquadFilter(), swell = c.createGain()
    air.buffer = this.noise
    air.loop = true
    bp.type = 'bandpass'
    bp.frequency.value = 900
    bp.Q.value = 0.7
    this.lfo(0.031, 500, bp.frequency)
    swell.gain.value = 0.6
    this.lfo(0.08, 0.4, swell.gain)
    this.airG = c.createGain()
    this.airG.gain.value = 0
    air.connect(bp).connect(swell).connect(this.airG)
    air.start()
    this.send(this.airG, 0.6, 0.8, 0)

    this.setEnergy(0, 5) // fade in from silence
  }

  setEnergy(e: number, tc = 1.5) {
    if (!this.ctx) return
    this.energy = e
    const t = this.ctx.currentTime, to = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, tc)
    to(this.bassG.gain, 0.09 + 0.09 * e)
    to(this.airG.gain, 0.022 + 0.03 * e)
    to(this.padG.gain, 0.16 * Math.min(1, e * 1.6))
    to(this.padF.frequency, 220 + 2400 * e ** 1.6 + 900 * this.tension)
    to(this.shimG.gain, 0.035 * Math.max(0, (e - 0.3) / 0.7))
  }

  now() {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000
  }

  // Next point on the musical grid, so reveals land in time with the music instead of on the keypress.
  grid(step: number) {
    return this.t0 + Math.ceil((this.now() + 0.04 - this.t0) / step) * step
  }

  at(t: number, fn: () => void) {
    setTimeout(fn, Math.max(0, (t - this.now()) * 1000))
  }

  emit(type: FxEvent, t: number, data: number) {
    this.at(t, () => this.onEvent?.(type, data))
  }

  tick() {
    const c = this.ctx
    while (this.next < c.currentTime + 0.15) {
      const t = this.next, s = this.step++
      this.next += EIGHTH
      if (s % 32 === 0 && s && !this.hold) this.chord((this.root + 1) % 4, t)

      const T = this.hold ? 0 : this.tension
      const heart = Math.min(1, Math.max(0, this.energy - 0.5) * 2 + (this.streak >= 2 ? 0.35 : 0) + (this.flourish > t ? 0.5 : 0) + T * 0.5)
      if (s % (T > 0.75 ? 4 : 8) === 0 && heart > 0.05) {
        this.kick(t, 0.45 * heart)
        this.kick(t + 0.19, 0.25 * heart) // lub-dub
        this.emit('beat', t, heart)
      }

      // Close to the answer, or nearly out of guesses: a muted pulse, like a clock you can't quite hear.
      if (T > 0.05) {
        const accent = s % 8 === 0 ? 1.25 : s % 2 ? 0.7 : 1
        this.pluck(ROOTS[this.root] + 24 + OSTINATO[s % 8], t + rand(0, 0.006), (0.04 + 0.05 * T) * accent, 500 + 1600 * T)
        if (s % 2 && T > 0.4) this.shaker(t + rand(0, 0.008), 0.012 + 0.02 * T)
      }

      // A music box that wanders the scale on its own, busier as the world wakes.
      const density = this.flourish > t ? 0.45 : Math.max(0, this.energy - 0.15) * 0.55
      if (Math.random() < density) {
        this.bell = Math.max(0, Math.min(BELLS.length - 1, this.bell + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]))
        const m = BELLS[this.bell]
        this.glass(m, t, rand(0.05, 0.11) * (0.6 + this.energy), { pan: rand(-0.7, 0.7), dur: 1.8, rev: 0.8, echo: 0.45, scoop: false })
        this.emit('glint', t, m)
      }
    }
  }

  chord(i: number, t: number) {
    this.root = i
    this.bass.forEach(({ osc, o }) => osc.frequency.setTargetAtTime(mtof(ROOTS[i] + o), t, 0.25))
    this.emit('chord', t, i)
  }

  // ——— instruments ———

  piano(m: number, t: number, v: number, { pan = 0, decay = 4, rev = 0.4, echo = 0.15, bright = 1 }: Tone = {}) {
    let near = -1
    for (const s of this.samples.keys()) if (near < 0 || Math.abs(s - m) < Math.abs(near - m)) near = s
    if (near < 0 || Math.abs(near - m) > 4) return // still loading
    const c = this.ctx, src = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain(), out = this.voice(pan, 1, rev, echo)
    t += rand(0, 0.012) // nobody strikes two keys identically
    v *= rand(0.88, 1.12)
    src.buffer = this.samples.get(near)!
    src.playbackRate.value = 2 ** ((m - near + rand(-0.03, 0.03)) / 12)
    // one recorded velocity, so a softer touch is also a darker one, as with a real hammer
    lp.type = 'lowpass'
    lp.frequency.value = Math.min(18000, mtof(m) * (2 + v * 24) * bright)
    g.gain.setValueAtTime(v, t)
    g.gain.setTargetAtTime(0, t + decay * 0.3, decay / 3) // the damper settling
    src.connect(lp).connect(g).connect(out)
    src.start(t)
    src.stop(t + decay * 2.5)
    src.onended = () => out.disconnect()
  }

  // A word played as a melody: a little push and pull in the timing, weight rising then falling, and the
  // last note resolved onto a tone of the chord underneath.
  phrase(word: string, t: number, home: number[], lean: number[], v: number) {
    const notes = [...word].map(ch => letterNote(ch) - 12)
    notes[notes.length - 1] = snap(notes[notes.length - 1], home)
    notes.forEach((m, i) => {
      const end = i === notes.length - 1
      this.piano(m, t, v * [0.85, 0.95, 1, 0.9, 0.78][i], { decay: end ? 9 : 4, rev: 0.6, echo: end ? 0.35 : 0.2, pan: (i - 2) * 0.12 })
      t += EIGHTH * (lean[i] ?? 1)
    })
  }

  glass(m: number, t: number, v: number, { pan = 0, dur = 2.5, rev = 0.7, echo = 0.3, scoop = true }: Glass = {}) {
    const c = this.ctx
    t += rand(0, 0.01)
    v *= rand(0.85, 1.1)
    const f = mtof(m) * 2 ** (rand(-4, 4) / 1200)
    const out = this.voice(pan, 0.4, rev, echo), env = c.createGain()
    env.connect(out)
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(v, t + 0.025)
    env.gain.setTargetAtTime(0, t + 0.03, dur / 4)
    let last!: OscillatorNode
    for (const [r, a] of [[1, 1], [2, 0.22], [3.01, 0.07]]) {
      const osc = c.createOscillator(), g = c.createGain()
      // a scoop: the note reaches up into pitch, like a voice
      osc.frequency.setValueAtTime(f * r * (scoop ? 0.985 : 1), t)
      if (scoop) osc.frequency.setTargetAtTime(f * r, t, 0.03)
      g.gain.setValueAtTime(a, t)
      g.gain.setTargetAtTime(0, t, dur / (3 * r))
      osc.connect(g).connect(env)
      osc.start(t)
      osc.stop(t + dur * 1.6)
      last = osc
    }
    last.onended = () => out.disconnect()
  }

  pluck(m: number, t: number, v: number, cut: number) {
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain()
    o.type = 'sawtooth'
    o.frequency.value = mtof(m) * 2 ** (rand(-4, 4) / 1200)
    f.type = 'lowpass'
    f.Q.value = 2
    f.frequency.setValueAtTime(cut * 2, t)
    f.frequency.exponentialRampToValueAtTime(cut * 0.4, t + 0.18)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(v * rand(0.85, 1.1), t + 0.004)
    g.gain.setTargetAtTime(0, t + 0.01, 0.07)
    o.connect(f).connect(g)
    this.send(g, 0.6, 0.35, 0.25)
    o.start(t)
    o.stop(t + 0.5)
  }

  shaker(t: number, v: number) {
    const c = this.ctx, src = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain()
    src.buffer = this.noise
    hp.type = 'highpass'
    hp.frequency.value = 7000
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(v, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
    src.connect(hp).connect(g)
    this.send(g, 0.7, 0.3, 0)
    src.start(t, Math.random())
    src.stop(t + 0.08)
  }

  kick(t: number, v: number) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain()
    o.frequency.setValueAtTime(90, t)
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(v, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
    o.connect(g)
    this.send(g, 1, 0.12, 0)
    o.start(t)
    o.stop(t + 0.5)
  }

  whoosh(t: number, dur: number, v: number) {
    const c = this.ctx, src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain()
    src.buffer = this.noise
    src.loop = true
    bp.type = 'bandpass'
    bp.Q.value = 2
    bp.frequency.setValueAtTime(300, t)
    bp.frequency.exponentialRampToValueAtTime(7000, t + dur)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(v, t + dur * 0.8)
    g.gain.linearRampToValueAtTime(0, t + dur + 0.2)
    src.connect(bp).connect(g)
    this.send(g, 0.4, 0.9, 0.2)
    src.start(t)
    src.stop(t + dur + 0.3)
  }

  // ——— game events ———

  type(ch: string) {
    if (!this.ctx) return
    this.piano(letterNote(ch), this.ctx.currentTime, rand(0.1, 0.15), { pan: rand(-0.3, 0.3), decay: 1.4, rev: 0.45, echo: 0.1, bright: 0.6 })
  }

  // The letter's note, played backwards: a swell that is sucked away.
  erase(ch: string) {
    if (!this.ctx) return
    const c = this.ctx, t = c.currentTime, f = mtof(letterNote(ch)), o = c.createOscillator(), g = c.createGain()
    o.frequency.setValueAtTime(f, t)
    o.frequency.exponentialRampToValueAtTime(f * 0.94, t + 0.18)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.06, t + 0.12)
    g.gain.linearRampToValueAtTime(0, t + 0.16)
    o.connect(g)
    this.send(g, 0.5, 0.6, 0)
    o.start(t)
    o.stop(t + 0.2)
  }

  // A soft "mm-mm", never a buzzer.
  invalid() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.piano(52, t, 0.2, { decay: 0.8, bright: 0.3, rev: 0.3, echo: 0 })
    this.piano(50, t + 0.13, 0.15, { decay: 0.8, bright: 0.3, rev: 0.3, echo: 0 })
  }

  reveal(col: number, mark: Mark, t: number, { chain, fresh }: { chain: number; fresh: boolean }) {
    if (!this.ctx) return
    const pan = (col - 2) * 0.28
    if (mark === 'correct') {
      const boost = 1 + Math.max(0, chain) * 0.12
      this.piano(ARP[col], t, (fresh ? 0.6 : 0.4) * boost, { pan, decay: 6, rev: 0.55, echo: fresh ? 0.4 : 0.2 })
      if (chain >= 1) this.piano(ARP[col] + 12, t + 0.012, 0.2 * boost, { pan: -pan, decay: 5, rev: 0.7, echo: 0.35 })
      if (chain >= 2) this.glass(ARP[col] + 19, t + 0.03, 0.05 * chain, { pan: -pan, dur: 3, rev: 0.9, echo: 0.5 })
    } else if (mark === 'present') {
      this.glass(ARP[col] + 12, t, 0.2, { pan, dur: 2.2 })
    } else {
      // a felt-muffled low note on whatever chord is playing: a miss is still in key
      this.piano(ROOTS[this.root] + 12, t, 0.22, { pan, decay: 0.9, rev: 0.35, echo: 0, bright: 0.45 })
    }
  }

  setStreak(n: number) {
    this.streak = n
  }

  setTension(x: number) {
    this.tension = x
    this.setEnergy(this.energy)
  }

  combo(t: number, chain: number, streak: number) {
    if (!this.ctx) return
    const n = (chain >= 2 ? chain : 0) + (streak >= 2 ? streak : 0)
    if (!n) return
    const count = Math.min(n + 1, RISE.length)
    for (let i = 0; i < count; i++)
      this.glass(RISE[i], t + (i * EIGHTH) / 2, 0.06 + i * 0.012, { pan: -0.6 + i * 0.13, dur: 2.2, rev: 0.9, echo: 0.5, scoop: false })
    this.whoosh(Math.max(this.now(), t - 0.2), (count * EIGHTH) / 2 + 0.3, 0.04 + n * 0.01)
  }

  // The solved word sings its own tune, the notes you heard while typing it, over a quiet chord of home.
  win(t: number, word: string) {
    if (!this.ctx) return
    this.hold = true
    this.chord(0, t)
    this.whoosh(Math.max(this.now(), t - 1.2), Math.max(0.1, Math.min(1.2, t - this.now())), 0.06)
    this.piano(36, t, 0.42, { decay: 9, rev: 0.6, echo: 0.05, pan: -0.3 }) // left hand: a low open fifth
    this.piano(43, t + 0.018, 0.3, { decay: 9, rev: 0.6, echo: 0.05, pan: -0.25 })
    this.piano(64, t + EIGHTH, 0.2, { decay: 8, rev: 0.7, echo: 0.15, pan: 0.1 }) // E and B: the maj7 colour, barely there
    this.piano(71, t + EIGHTH + 0.03, 0.17, { decay: 8, rev: 0.7, echo: 0.15, pan: 0.2 })
    this.phrase(word, t + BEAT, [0, 4, 7], [1.2, 0.85, 0.9, 1.3], 0.42)
    this.flourish = t + BAR * 3
    this.at(t, () => {
      this.setEnergy(1, 0.6)
      this.padF.frequency.setTargetAtTime(6000, this.ctx.currentTime, 0.3) // bloom, then settle back
      this.padF.frequency.setTargetAtTime(2620, this.ctx.currentTime + 2, 3)
    })
  }

  // Settle on A minor: bittersweet, not sad. The answer's own tune, softly, in time with its letters appearing.
  lose(t: number, word: string) {
    if (!this.ctx) return
    this.hold = true
    this.chord(1, t)
    this.piano(33, t, 0.36, { decay: 9, rev: 0.65, echo: 0.05, pan: -0.3, bright: 0.7 })
    this.piano(40, t + 0.02, 0.26, { decay: 9, rev: 0.65, echo: 0.05, pan: -0.25, bright: 0.7 })
    this.piano(60, t + EIGHTH, 0.16, { decay: 8, rev: 0.7, echo: 0.15, pan: 0.1, bright: 0.7 })
    this.piano(67, t + EIGHTH + 0.03, 0.14, { decay: 8, rev: 0.7, echo: 0.15, pan: 0.2, bright: 0.7 })
    this.phrase(word, t + BEAT, [9, 0, 4], [1, 1, 1, 1], 0.3)
    this.at(t, () => this.setEnergy(0.25, 3))
  }

  reset() {
    if (!this.ctx) return
    Object.assign(this, { hold: false, streak: 0, flourish: 0, tension: 0 })
    this.setEnergy(0, 2.5)
  }
}

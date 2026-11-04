// The light: a GPU-drawn world of crisp shards, tumbling flakes and a few hot sparks, living behind the board.
import type { Mark } from './game.ts'
import { renderer, STRIDE, MAX, SLOT, type Renderer } from './gpu.ts'

const TAU = Math.PI * 2
const LIGHT = -0.9 // shards flash when they turn to face this angle, like fish scales
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

type RGB = readonly number[]
function hsl(h: number, s: number, l: number): RGB {
  h = ((((h % 360) + 360) % 360) / 60)
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h % 2) - 1)), m = l - c / 2
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x]
  return [r + m, g + m, b + m]
}

const SPARK = 0, SHARD = 1, FLAKE = 2, RING = 3, RIM = 4, CLOUD = 5, GLYPH = 6, BOX = 7
const LIT = -0.93 // the square rim's resting light, from the top right
const GREEN = hsl(156, 1, 0.6)
const AMBER = hsl(38, 1, 0.58)
const WHITE: RGB = [1, 1, 1]
const SLATE = hsl(226, 0.3, 0.42)
const ICE = hsl(205, 0.7, 0.78)
const RINGS = [hsl(170, 1, 0.62), hsl(200, 1, 0.66), hsl(270, 0.9, 0.7), hsl(325, 0.9, 0.66), hsl(45, 1, 0.62)]
const HUES = [-14, -11, -8, -6, -4, -2, 0, 0, 2, 4, 6, 8, 11, 14, 95, 110] // one family, two violet accents

// Specular glint: dim most of the time, then a brief HDR flash as the shard turns into the light.
function shine(ang: number) {
  const c = Math.abs(Math.cos(ang - LIGHT)), c4 = c * c * c * c, c8 = c4 * c4
  return 0.35 + 0.55 * c4 + 1.6 * c8 * c8 * c8
}

type Pt = { x: number; y: number }
type Tile = Pt & { w: number; fs: number }
type Look = { size: number; shape: number; aspect: number; blur: number; spin: number; align: boolean; hot: number }
type Particle = Pt & Look & {
  vx: number; vy: number; drag: number; grav: number; age: number; life: number; delay: number
  rgb: RGB; a: number; ang: number; px: number; py: number; cell: number
  path?: number[]
  orbit?: { cx: number; cy: number; r: number; a: number; w: number; grow: number }
  ring?: { lv: number; a: number; w: number; j: number } | null
}
type Spawn = Pt & { life: number; rgb: RGB } & Partial<Particle>
type Drift = Pt & { dx: number; dy: number }
type Mote = Drift & { z: number; th: number; hb: number; ph: number; shape: number; aspect: number; size: number; blur: number; fl: number; ang: number }
type Star = Drift & Look & { vx: number; vy: number; px: number; py: number; a: number; r: number; w: number; k: number; rgb: RGB; ph: number; fade: number; dying: boolean; ang: number }
type Wave = Pt & { r: number; v: number; life: number; s: number; col: RGB }
type Burst = { col: RGB | (() => RGB); speed?: number[]; life?: number[]; scale?: number; drag?: number; grav?: number; a?: number; sparks?: number; hot?: number }

// One fragment of light: mostly shards that point where they fly, some tumbling flakes, rarely a hot spark.
function bit(scale: number, sparks: number, hot: number): Look {
  const r = Math.random()
  if (r < sparks) return { shape: SPARK, size: rand(2, 4.5) * scale, aspect: 1, blur: 0, spin: 0, align: false, hot }
  if (r < sparks + (1 - sparks) * 0.7) return { shape: SHARD, size: rand(2.5, 5.5) * scale, aspect: rand(2.8, 4.5), blur: 0, spin: 0, align: true, hot: 1 }
  return { shape: FLAKE, size: rand(1.6, 3.2) * scale, aspect: rand(1, 1.5), blur: 0, spin: rand(-9, 9), align: false, hot: 1 }
}

export class FX {
  c: HTMLCanvasElement
  gpu?: Renderer
  kind = 'none'
  font?: { fs: number; family: string; weight: string }
  cell = 0
  awake = false
  // the square rim behind the board: a spring for its size, a flash, a light that can sweep around, a shake
  rim = { s: 0, v: 0, flash: 0, light: LIT, spin: 0, x: 0, xv: 0 }
  buf = new Float32Array(MAX * STRIDE)
  n = 0
  ps: Particle[] = []
  waves: Wave[] = []
  earned: Star[] = []
  motes: Mote[]
  pal: RGB[] = []
  energy = 0
  target = 0
  glow = 0
  time = 0
  root = 0
  streak = 0
  mood: 'joy' | 'cold' | null = null
  snowing = false
  dead = false
  q = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.35 : 1
  pointer = { x: -1e4, y: -1e4 }
  W = 0
  H = 0
  R = 0
  last = performance.now()
  raf = 0
  board?: Pt & { rx: number; ry: number }

  constructor(canvas: HTMLCanvasElement) {
    this.c = canvas
    addEventListener('pointermove', this.onMove)
    addEventListener('resize', this.resize)
    this.resize()
    // A school of light waiting in the dark. Each mote appears only once the world is awake enough (th).
    this.motes = Array.from({ length: Math.round(2400 * this.q) }, () => {
      const near = Math.random() < 0.035, z = near ? 1 : Math.random() ** 0.8, r = Math.random()
      // th skews high, so the first letters wake only a few hundred motes and the full school needs the solve
      const look = near
        ? { shape: SHARD, aspect: 2, size: rand(8, 16), blur: 0.85 } // out of focus, drifting past the lens
        : r < 0.72
          ? { shape: SHARD, aspect: rand(2.6, 4), size: (1.5 + z * 2.6) * rand(0.8, 1.2), blur: 0 }
          : r < 0.92
            ? { shape: FLAKE, aspect: 1.2, size: 1.1 + z * 1.8, blur: 0 }
            : { shape: SPARK, aspect: 1, size: 1.4 + z * 1.6, blur: 0 }
      return { x: rand(0, this.W), y: rand(0, this.H), dx: 0, dy: 0, z, th: Math.random() ** 0.6, hb: Math.floor(Math.random() * HUES.length), ph: rand(0, TAU), fl: 0, ang: 0, ...look }
    })
    renderer(canvas)
      .then(r => {
        if (!r || this.dead) return
        Object.assign(this, { gpu: r, kind: r.kind })
        this.glyphs()
      })
      .catch(() => {})
    this.raf = requestAnimationFrame(this.loop)
  }

  destroy() {
    this.dead = true
    cancelAnimationFrame(this.raf)
    removeEventListener('pointermove', this.onMove)
    removeEventListener('resize', this.resize)
  }

  onMove = (e: PointerEvent) => Object.assign(this.pointer, { x: e.clientX, y: e.clientY })

  resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1), hadNoSize = !this.W || !this.H
    this.W = innerWidth
    this.H = innerHeight
    // opened in a hidden or zero-size view: the school was spawned in a corner, so scatter it now
    if (hadNoSize && this.motes) for (const m of this.motes) Object.assign(m, { x: rand(0, this.W), y: rand(0, this.H) })
    this.c.width = Math.round(this.W * dpr)
    this.c.height = Math.round(this.H * dpr)
    this.R = Math.hypot(this.W, this.H) * 0.42
  }

  setBoard(r: DOMRect) {
    this.board = { x: r.left + r.width / 2, y: r.top + r.height / 2, rx: r.width / 2, ry: r.height / 2 }
  }

  hue() {
    if (this.mood === 'joy') return 50 + this.time * 25
    if (this.mood === 'cold') return 210
    // deep blue drifting to teal as the world wakes, nudged by whichever chord is playing
    return 222 - this.energy * 52 + [0, 8, -10, -5][this.root]
  }

  add(p: Spawn) {
    if (this.ps.length < 6000)
      this.ps.push({ vx: 0, vy: 0, drag: 0.95, grav: 0, age: 0, delay: 0, size: 3, shape: SHARD, aspect: 4, blur: 0, spin: 0, align: true, hot: 1, a: 1, ang: rand(0, TAU), px: p.x, py: p.y, cell: 0, ...p })
  }

  put(x: number, y: number, size: number, ang: number, rgb: RGB, k: number, aspect: number, shape: number, blur: number, extra = 0) {
    if (this.n >= MAX || k <= 0.001) return
    const b = this.buf, o = this.n++ * STRIDE
    b[o] = x
    b[o + 1] = y
    b[o + 2] = size
    b[o + 3] = ang
    b[o + 4] = rgb[0] * k
    b[o + 5] = rgb[1] * k
    b[o + 6] = rgb[2] * k
    b[o + 7] = 1
    b[o + 8] = Math.min(aspect, size / 0.9) // never thinner than about a pixel, or it vanishes
    b[o + 9] = shape
    b[o + 10] = blur
    b[o + 11] = extra
  }

  // The letters, drawn into a texture so a checked letter can flash HDR-bright. Each sits in its box exactly
  // as CSS lays out a line-height: 1 letter, so the GPU letter lands on top of the DOM one.
  letters(fs: number, family: string, weight: string) {
    this.font = { fs, family, weight }
    this.glyphs()
  }

  glyphs() {
    const cell = this.font && Math.min(SLOT, Math.ceil(this.font.fs * Math.min(2, devicePixelRatio || 1)))
    if (!this.gpu || !this.font || !cell || Math.abs(cell - this.cell) < 2) return
    this.cell = cell
    const c = document.createElement('canvas'), g = c.getContext('2d')!
    c.width = SLOT * 13
    c.height = SLOT * 2
    g.font = `${this.font.weight} ${cell}px ${this.font.family}` // weight must come before size, or canvas ignores the font
    g.fillStyle = '#fff'
    g.textAlign = 'center'
    const m = g.measureText('H'), base = (cell - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 + m.fontBoundingBoxAscent
    for (let i = 0; i < 26; i++) g.fillText(String.fromCharCode(65 + i), (i % 13) * SLOT + cell / 2, Math.floor(i / 13) * SLOT + base)
    this.gpu.atlas(c, cell)
  }

  glyph(t: Tile, ch: string, hot: number, life: number) {
    this.add({ x: t.x, y: t.y, life, age: 0.125, size: t.fs / 2, shape: GLYPH, aspect: 1, align: false, ang: 0, rgb: WHITE, hot, cell: ch.charCodeAt(0) - 97 })
  }

  // Nudge the square rim: grow (or shrink) on a spring, brighten, and optionally sweep its light around.
  poke(grow: number, flash: number, turns = 0) {
    this.rim.v += grow * 9
    this.rim.flash += flash
    this.rim.spin += turns * TAU * 0.45 // decays at 0.45/s, so the light drifts exactly `turns` of a lap, slowly
  }

  burst(x: number, y: number, n: number, { col, speed = [40, 300], life = [0.8, 2], scale = 1, drag = 0.94, grav = 0, a = 1, sparks = 0.12, hot = 2.4 }: Burst) {
    for (let i = 0; i < Math.round(n * this.q); i++) {
      const ang = rand(0, TAU), sp = rand(speed[0], speed[1])
      this.add({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(life[0], life[1]), drag, grav, a, rgb: typeof col === 'function' ? col() : col, ...bit(scale, sparks, hot) })
    }
  }

  // Soft, slow, barely-there rings. They nudge the light rather than shove it.
  wave(x: number, y: number, col: RGB, s: number) {
    this.waves.push({ x, y, r: 0, v: 360 + s * 160, life: 1, s, col })
  }

  // A white flash as each letter is checked; above 1.0 it is HDR-bright where the display allows.
  flash({ x, y, w }: Tile, hot: number) {
    this.add({ x, y, life: 0.6, age: 0.13, size: w * 1.3, shape: SPARK, aspect: 1, align: false, rgb: WHITE, hot: hot * 0.4 })
  }

  // A letter of the missed answer surfacing below the board.
  answer(t: Tile, ch: string) {
    this.flash(t, 1.6)
    this.glyph(t, ch, 2.4, 1.2)
    this.burst(t.x, t.y, 24, { col: ICE, speed: [20, 140], life: [1, 2.2], scale: 0.8, grav: -10, sparks: 0.1, hot: 1.8 })
  }

  // Light you earn stays: it joins a slow galaxy around the board until the round ends.
  gift(x: number, y: number, col: RGB, n: number) {
    const b = this.board || { x: this.W / 2, y: this.H / 2 }
    for (let i = 0; i < n; i++) {
      if (this.earned.length > 1200) this.earned.shift()
      const ang = rand(0, TAU), sp = rand(80, 360)
      this.earned.push({
        x, y, px: x, py: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, dx: 0, dy: 0, ang,
        a: Math.atan2(y - b.y, x - b.x) + rand(-0.6, 0.6), r: rand(0.25, 1), w: rand(0.03, 0.11) * (Math.random() < 0.85 ? 1 : -1),
        k: 0, rgb: col, ph: rand(0, TAU), fade: 1, dying: false, ...bit(0.8, 0.08, 1.8),
      })
    }
  }

  // ——— game events ———

  setEnergy(e: number) {
    this.target = e
  }

  wake() {
    this.awake = true
    this.poke(0.02, 0.1)
    const b = this.board
    if (b) this.wave(b.x, b.y, hsl(215, 0.6, 0.7), 0.4)
  }

  type({ x, y }: Pt) {
    this.burst(x, y, 6, { col: () => hsl(this.hue() + rand(-20, 20), 0.6, 0.8), speed: [20, 80], life: [0.4, 0.8], scale: 0.7, drag: 0.92, sparks: 0 })
    this.glow = Math.min(1.5, this.glow + 0.04)
    this.poke(0.012, 0.06)
  }

  // An invalid word: the rim shakes its head with the row.
  nope() {
    this.rim.xv -= 140
  }

  // Reverse of typing: light drawn back into the tile.
  erase({ x, y }: Pt) {
    this.poke(-0.01, 0.02)
    for (let i = 0; i < 9 * this.q; i++) {
      const ang = rand(0, TAU), r = rand(22, 36)
      this.add({ x, y, life: rand(0.25, 0.4), size: rand(1.5, 3), rgb: hsl(this.hue(), 0.5, 0.8), path: [x + Math.cos(ang) * r, y + Math.sin(ang) * r, x, y] })
    }
  }

  reveal(t: Tile, mark: Mark, { fresh, chain, ch }: { fresh: boolean; chain: number; ch: string }) {
    const { x, y, w } = t, k = 1 + this.energy * 1.4 + Math.max(0, chain) * 0.35
    this.flash(t, mark === 'correct' ? 3.4 : mark === 'present' ? 2.4 : 1.4)
    this.glyph(t, ch, mark === 'correct' ? 4 : mark === 'present' ? 3 : 1.6, 0.9)
    // the tile itself flashes too, softly and tinted toward its colour, well below the letter so it still reads
    const tint = (mark === 'correct' ? GREEN : mark === 'present' ? AMBER : SLATE).map(v => 0.7 + 0.3 * v)
    this.add({ x, y, life: 0.55, age: 0.125, size: w / 2, shape: BOX, aspect: 1, align: false, ang: 0, rgb: tint, hot: mark === 'correct' ? 0.55 : mark === 'present' ? 0.45 : 0.25 })
    if (mark === 'correct') this.poke(fresh ? 0.035 : 0.015, fresh ? 0.5 : 0.2, fresh ? 0.12 : 0)
    else if (mark === 'present') this.poke(0.015, 0.18, 0.05)
    else this.poke(-0.008, 0)
    if (mark === 'correct') {
      this.burst(x, y, (fresh ? 70 : 26) * k, { col: () => (Math.random() < 0.75 ? GREEN : WHITE), speed: [50, fresh ? 420 : 200], life: [0.9, 2.6], grav: -16, sparks: 0.18, hot: 2.8 })
      this.edge(x, y, w, GREEN, 28)
      if (fresh) {
        this.wave(x, y, GREEN, 0.6)
        this.gift(x, y, GREEN, Math.round((14 + chain * 6) * this.q))
      }
      this.glow = Math.min(1.5, this.glow + (fresh ? 0.5 : 0.2))
    } else if (mark === 'present') {
      // they circle the tile, then wander off along the row looking for their real seat
      for (let i = 0; i < 34 * this.q; i++)
        this.add({ x, y, life: rand(1.2, 2.2), rgb: AMBER, ...bit(0.9, 0.1, 2), align: true, orbit: { cx: x, cy: y, r: w * rand(0.45, 0.8), a: rand(0, TAU), w: rand(2.5, 4.5) * pick([-1, 1]), grow: rand(10, 40) } })
      for (let i = 0; i < 12 * this.q; i++)
        this.add({ x, y: y + rand(-w / 3, w / 3), vx: pick([-1, 1]) * rand(60, 220), vy: rand(-10, 10), drag: 0.975, life: rand(1, 1.8), rgb: AMBER, ...bit(0.8, 0, 1) })
      this.gift(x, y, AMBER, Math.round(3 * this.q))
      this.glow = Math.min(1.5, this.glow + 0.12)
    } else {
      // dull flakes tumbling down
      for (let i = 0; i < 12 * this.q; i++)
        this.add({ x: x + rand(-w / 3, w / 3), y: y + w * 0.2, vx: rand(-20, 20), vy: rand(0, 30), grav: 40, drag: 0.97, life: rand(1.5, 3), a: 0.6, rgb: SLATE, shape: FLAKE, aspect: 1.2, size: rand(1.5, 3), align: false, spin: rand(-6, 6) })
    }
  }

  edge(x: number, y: number, w: number, col: RGB, n: number) {
    const h = w / 2
    for (let i = 0; i < n * this.q; i++) {
      const t = rand(-1, 1)
      const [ex, ey, nx, ny] = pick([[t * h, -h, 0, -1], [h, t * h, 1, 0], [t * h, h, 0, 1], [-h, t * h, -1, 0]])
      this.add({ x: x + ex, y: y + ey, vx: nx * rand(20, 70), vy: ny * rand(20, 70), drag: 0.96, life: rand(0.6, 1.2), size: rand(2, 4), aspect: rand(3, 5), rgb: col })
    }
  }

  // Adjacent greens link up with threads of light.
  beam(a: Pt, b: Pt) {
    for (let i = 0; i < 36 * this.q; i++) {
      const [p, q] = i % 2 ? [b, a] : [a, b]
      this.add({ x: p.x, y: p.y, life: rand(0.45, 0.8), delay: rand(0, 1.1), rgb: Math.random() < 0.7 ? GREEN : WHITE, ...bit(0.8, 0.15, 2.2), align: true, path: [p.x, p.y, q.x, q.y] })
    }
    this.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 10, { col: WHITE, speed: [20, 80], life: [0.5, 1], scale: 0.7 })
  }

  // Each streak level is another ring of light orbiting the board. Breaking the streak lets them fall.
  setStreak(n: number) {
    const b = this.board
    if (b && n > this.streak) {
      for (let lv = this.streak; lv < Math.min(n, RINGS.length); lv++) {
        const count = Math.round(50 * this.q), w = (0.32 - lv * 0.04) * (lv % 2 ? -1 : 1)
        for (let i = 0; i < count; i++)
          this.add({ x: b.x, y: b.y, life: 1e9, size: rand(2.5, 4.5), aspect: 3, rgb: RINGS[lv], ring: { lv, a: (i / count) * TAU + rand(-0.05, 0.05), w, j: rand(-4, 4) } })
        this.wave(b.x, b.y, RINGS[lv], 0.35)
      }
    }
    if (n < this.streak)
      for (const p of this.ps)
        if (p.ring) {
          p.vx = -Math.sin(p.ring.a) * p.ring.w * 120
          p.vy = rand(-20, 10)
          Object.assign(p, { ring: null, grav: 30, drag: 0.98, age: 0.2, life: rand(1.6, 2.6), align: false, spin: rand(-6, 6) })
        }
    this.streak = n
  }

  // A music-box note makes a patch of the school catch the light.
  glint(m: number) {
    const gx = this.W * (0.08 + (0.84 * (m - 72)) / 19) + rand(-40, 40), gy = this.H * rand(0.1, 0.9)
    for (const s of this.motes) if (Math.abs(s.x - gx) < 110 && Math.abs(s.y - gy) < 170) s.fl = 1
  }

  beat(heart: number) {
    this.glow = Math.min(1.5, this.glow + 0.3 * heart)
    this.poke(0.006 * heart, 0.08 * heart)
    const b = this.board
    if (b) this.wave(b.x, b.y, hsl(this.hue(), 0.7, 0.7), 0.15 * heart)
  }

  chord(i: number) {
    this.root = i
  }

  supernova(k: number) {
    const b = this.board
    if (!b) return
    this.mood = 'joy'
    this.target = 1
    this.glow = 1.5
    this.poke(0.12, 1.2, 0.3)
    this.add({ x: b.x, y: b.y, life: 1.4, age: 0.13, size: Math.max(this.W, this.H) * 0.6, shape: CLOUD, aspect: 1, align: false, rgb: hsl(45, 0.6, 0.85), hot: this.q * 1.1 })
    for (let i = 0; i < 2; i++) setTimeout(() => this.wave(b.x, b.y, hsl(50 + i * 80, 1, 0.75), 1 - i * 0.3), i * 260)
    this.burst(b.x, b.y, 650 * k, { col: () => hsl(rand(0, 360), 0.95, 0.68), speed: [80, 1000], life: [1.5, 4.5], scale: 1.2, drag: 0.955, grav: 12, sparks: 0.15, hot: 3 })
    for (const e of this.earned) {
      const ang = Math.atan2(e.y - b.y, e.x - b.x), sp = rand(300, 800)
      e.vx += Math.cos(ang) * sp
      e.vy += Math.sin(ang) * sp
      e.r = Math.min(1.3, e.r * rand(1.1, 1.5))
    }
    // the board's light pours out and fills the sky
    for (let i = 0; i < 260 * k * this.q; i++) this.gift(b.x + rand(-b.rx, b.rx), b.y + rand(-b.ry, b.ry), hsl(rand(0, 360), 0.9, 0.68), 1)
  }

  // Locks in flight: a stream of shards from one board to another, in the sender's colour.
  stream(a: Pt, b: Pt, hue: number, n: number) {
    const col = hsl(hue, 0.9, 0.7)
    for (let i = 0; i < (30 + n * 20) * this.q; i++)
      this.add({ x: a.x, y: a.y, life: rand(0.7, 1.1), delay: rand(0, 0.5), rgb: Math.random() < 0.8 ? col : WHITE, ...bit(1, 0.2, 2.6), align: true, path: [a.x + rand(-14, 14), a.y + rand(-14, 14), b.x + rand(-10, 10), b.y + rand(-10, 10)] })
    setTimeout(() => this.burst(b.x, b.y, 16 * n, { col: ICE, speed: [30, 160], life: [0.6, 1.4], scale: 0.8, sparks: 0.1, hot: 2 }), 1000)
  }

  // Jinx: both boards fire at each other and the sparks collide halfway.
  jinx(a: Pt, b: Pt, ha: number, hb: number) {
    this.stream(a, b, ha, 1)
    this.stream(b, a, hb, 1)
    this.poke(0.03, 0.5)
    this.rim.xv += 90
    setTimeout(() => this.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 60, { col: () => hsl(rand(0, 360), 1, 0.7), speed: [60, 360], life: [0.6, 1.4], sparks: 0.3, hot: 3 }), 550)
  }

  // A row freezing shut: each tile flashes cold and sheds a few ice shards.
  frost(row: Tile[]) {
    this.poke(-0.03, 0.15)
    this.rim.xv += 60
    for (const t of row) {
      this.add({ x: t.x, y: t.y, life: 0.7, age: 0.125, size: t.w / 2, shape: BOX, aspect: 1, align: false, ang: 0, rgb: ICE, hot: 0.5 })
      this.burst(t.x, t.y, 14, { col: () => (Math.random() < 0.7 ? ICE : WHITE), speed: [20, 120], life: [0.8, 1.6], scale: 0.8, grav: 30, sparks: 0.05, hot: 1.6 })
    }
  }

  // A light going out: embers drifting up from someone's panel.
  ember({ x, y }: Pt, hue: number) {
    this.burst(x, y, 40, { col: () => hsl(hue + rand(-15, 15), 0.6, 0.6), speed: [10, 60], life: [1.5, 3], scale: 0.7, drag: 0.97, grav: -25, sparks: 0.3, hot: 1.2 })
  }

  snow() {
    this.poke(-0.04, 0)
    this.mood = 'cold'
    this.snowing = true
    this.target = 0.22
  }

  reset() {
    Object.assign(this, { mood: null, snowing: false, target: 0, glow: 0 })
    for (const e of this.earned) e.dying = true
    this.setStreak(0)
  }

  // ——— frame ———

  loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    this.time += dt
    this.energy += (this.target - this.energy) * (1 - Math.exp(-dt * 0.8))
    this.glow *= Math.exp(-dt * 1.2)
    const h = this.hue(), cold = this.mood === 'cold'
    this.pal = HUES.map(o => hsl(h + o, cold ? 0.35 : 0.7, 0.68))
    if (this.snowing && Math.random() < dt * 30 * this.q)
      this.add({ x: rand(0, this.W), y: -10, vx: rand(-8, 8), vy: rand(18, 45), drag: 1, life: rand(14, 22), a: rand(0.3, 0.8), rgb: ICE, shape: FLAKE, size: rand(1.5, 3.5), aspect: 1.2, align: false, spin: rand(-2, 2) })
    this.n = 0
    this.sky(dt)
    this.stepWaves(dt)
    this.stepMotes(dt)
    this.stepEarned(dt)
    this.stepParticles(dt)
    this.gpu?.draw(this.buf, this.n, this.W, this.H)
  }

  // Colour clouds, and a lit horizon arc behind the board that rises with the world's energy.
  sky(dt: number) {
    this.stepRim(dt)
    const e = this.energy
    if (e < 0.003) return
    const a = (0.02 + 0.2 * e ** 1.5 + this.glow * 0.03) * Math.min(1, e * 3), h = this.hue(), T = this.time, big = Math.max(this.W, this.H)
    for (let i = 0; i < 4; i++) {
      const x = this.W * (0.5 + 0.38 * Math.sin(T * 0.031 + i * 1.7))
      const y = this.H * (0.5 + 0.34 * Math.cos(T * 0.027 + i * 2.3))
      // blue, violet, magenta and teal clouds, like a far-off nebula
      this.put(x, y, big * (0.45 + 0.15 * Math.sin(T * 0.05 + i)), 0, hsl(h + [0, 55, 100, -30][i], 0.8, 0.3 + e * 0.15), a, 1, CLOUD, 0)
    }
  }

  // A rounded square behind the board, echoing the tiles. Faint from the first keypress, brighter as the world
  // wakes, and it answers every input: it breathes on a spring, flashes, and lets its light run around the edge.
  stepRim(dt: number) {
    const m = this.rim, b = this.board
    m.v += (-70 * m.s - 8 * m.v) * dt
    m.s += m.v * dt
    m.xv += (-220 * m.x - 14 * m.xv) * dt
    m.x += m.xv * dt
    m.flash *= Math.exp(-dt * 2.2)
    m.light += m.spin * dt
    m.spin *= Math.exp(-dt * 0.45)
    if (Math.abs(m.spin) < 0.05) m.light += Math.atan2(Math.sin(LIT - m.light), Math.cos(LIT - m.light)) * (1 - Math.exp(-dt * 0.25))
    if (!b || !this.awake) return
    const k = (0.05 + 0.5 * this.energy ** 1.5) * (1 + this.glow * 0.25) + m.flash
    this.put(b.x + m.x, b.y, (b.ry * 1.3 * (1 + m.s)) / 0.9, 0, hsl(this.hue() + 10, 0.5, 0.75), k, 1, RIM, 0.04, m.light)
  }

  // Waves nudge nearby light outward; the pointer gently parts it.
  push(m: Drift, dt: number, k: number) {
    for (const w of this.waves) {
      const dx = m.x - w.x, dy = m.y - w.y, d = Math.hypot(dx, dy) || 1, off = Math.abs(d - w.r)
      if (off < 90) {
        const f = (1 - off / 90) * w.s * w.life * 260 * dt * k
        m.dx += (dx / d) * f
        m.dy += (dy / d) * f
      }
    }
    const px = m.x - this.pointer.x, py = m.y - this.pointer.y, pd = Math.hypot(px, py)
    if (pd < 130 && pd > 0) {
      const f = (1 - pd / 130) * 120 * dt * k
      m.dx += (px / pd) * f
      m.dy += (py / pd) * f
    }
  }

  stepWaves(dt: number) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]
      w.r += w.v * dt
      w.life -= dt * 0.8
      if (w.life <= 0) {
        this.waves.splice(i, 1)
        continue
      }
      const size = w.r / 0.9 + 1
      this.put(w.x, w.y, size, 0, w.col, 0.07 * Math.min(1, w.s) * w.life ** 1.5, 1, RING, Math.min(0.3, 18 / size))
    }
  }

  // The school swims along a divergence-free flow (a curl field), so it streams and eddies but never clumps,
  // and slowly circles the board.
  stepMotes(dt: number) {
    if (!this.H) return // no viewport yet: the flow field divides by its height
    const e = this.energy, H = this.H, T = this.time, b = this.board || { x: this.W / 2, y: H / 2 }
    const speed = (0.025 + 0.05 * e) * H, bright = 1 + this.glow * 0.6, settle = Math.exp(-dt * 1.5), flick = Math.exp(-dt * 3)
    for (const m of this.motes) {
      const u = m.x / H, w = m.y / H
      const a1 = 2.1 * u + 0.13 * T, b1 = 1.7 * w - 0.11 * T, c2 = Math.cos(3.3 * u - 2.6 * w + 0.17 * T), s3 = Math.sin(5.1 * u + 4.3 * w - 0.23 * T)
      const du = 1.05 * Math.cos(a1) * Math.sin(b1) + 1.155 * c2 - 1.02 * s3
      const dw = 0.85 * Math.sin(a1) * Math.cos(b1) - 0.91 * c2 - 0.86 * s3
      const par = 0.35 + 0.65 * m.z // parallax: near flecks drift faster
      const vx = (dw * speed - (m.y - b.y) * 0.04) * par, vy = (-du * speed + (m.x - b.x) * 0.04) * par
      m.x += vx * dt
      m.y += vy * dt
      if (m.x < -30) m.x += this.W + 60
      if (m.x > this.W + 30) m.x -= this.W + 60
      if (m.y < -30) m.y += H + 60
      if (m.y > H + 30) m.y -= H + 60
      m.dx *= settle
      m.dy *= settle
      m.fl *= flick
      const vis = Math.min(1, (e - m.th) * 4)
      if (vis <= 0) continue
      this.push(m, dt, 1)
      m.ang = Math.atan2(vy, vx) + Math.sin(T * 1.3 + m.ph) * 0.5 // flutter
      const k = vis * (0.4 + 0.8 * m.z) * (m.shape === SPARK ? 0.8 : shine(m.ang)) * bright * (1 + m.fl * 2.5) * (m.blur ? 0.22 : 1)
      this.put(m.x + m.dx, m.y + m.dy, m.size * (1 + e * 0.5), m.ang, this.pal[m.hb], k, m.aspect, m.shape, m.blur)
    }
  }

  stepEarned(dt: number) {
    const b = this.board || { x: this.W / 2, y: this.H / 2 }
    const spin = 1 + this.energy * 1.5 + (this.mood === 'joy' ? 2 : 0) - (this.mood === 'cold' ? 0.8 : 0)
    const damp = Math.exp(-dt * 1.6), T = this.time
    for (let i = this.earned.length - 1; i >= 0; i--) {
      const e = this.earned[i]
      if (e.dying && (e.fade -= dt * 0.5) <= 0) {
        this.earned.splice(i, 1)
        continue
      }
      e.a += e.w * dt * spin
      e.k = Math.min(1, e.k + dt * 0.35)
      const R = this.R * e.r
      const tx = b.x + Math.cos(e.a) * R, ty = b.y + Math.sin(e.a) * R * 0.62 + Math.sin(T * 0.6 + e.ph) * 10
      e.dx = e.dy = 0
      this.push(e, dt, 0.6)
      e.vx = (e.vx + e.dx * 8) * damp
      e.vy = (e.vy + e.dy * 8) * damp
      e.px = e.x
      e.py = e.y
      e.x += e.vx * dt
      e.y += e.vy * dt
      const pull = 1 - Math.exp(-dt * 1.2 * e.k) // flung out first, then gathered into orbit
      e.x += (tx - e.x) * pull
      e.y += (ty - e.y) * pull
      e.ang = e.spin ? e.ang + e.spin * dt : Math.atan2(e.y - e.py, e.x - e.px)
      const k = e.fade * (0.55 + this.glow * 0.3) * (e.shape === SHARD ? shine(e.ang + Math.sin(T + e.ph) * 0.4) : e.hot * (0.6 + 0.4 * Math.sin(T * 1.7 + e.ph)))
      this.put(e.x, e.y, e.size * (1 + this.glow * 0.3), e.ang, e.rgb, k, e.aspect, e.shape, 0)
    }
  }

  stepParticles(dt: number) {
    const b = this.board, ps = this.ps
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]
      if (p.delay > 0) {
        p.delay -= dt
        continue
      }
      p.age += dt
      const t = p.age / p.life
      if (t >= 1) {
        ps[i] = ps[ps.length - 1]
        ps.pop()
        continue
      }
      p.px = p.x
      p.py = p.y
      if (p.ring && b) {
        const r = p.ring, off = 34 + r.lv * 26 + r.j
        r.a += r.w * dt
        p.x = b.x + Math.cos(r.a) * (b.rx + off)
        p.y = b.y + Math.sin(r.a) * (b.ry + off)
      } else if (p.path) {
        const [ax, ay, bx, by] = p.path, s = t * t * (3 - 2 * t), len = Math.hypot(bx - ax, by - ay) || 1, wob = Math.sin(t * Math.PI) * 8
        p.x = ax + (bx - ax) * s - ((by - ay) / len) * wob
        p.y = ay + (by - ay) * s + ((bx - ax) / len) * wob
      } else if (p.orbit) {
        const o = p.orbit
        o.a += o.w * dt
        o.r += o.grow * dt
        p.x = o.cx + Math.cos(o.a) * o.r
        p.y = o.cy + Math.sin(o.a) * o.r
      } else {
        const d = p.drag ** (dt * 60)
        p.vx *= d
        p.vy = p.vy * d + p.grav * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
      }
      const mx = p.x - p.px, my = p.y - p.py
      if (p.align && mx * mx + my * my > 1e-4) p.ang = Math.atan2(my, mx)
      else p.ang += p.spin * dt
      const fade = Math.min(1, p.age * 8) * (1 - t) ** 1.4 // ease in, so nothing pops into existence
      const k = p.a * fade * p.hot * (p.shape === SHARD ? shine(p.ang) : 1) * (1 + this.glow * 0.3)
      // rings swell with the glow; a checked letter pops 15% larger for its first quarter second
      const grow = p.ring ? 1 + this.glow * 0.4 : p.shape === GLYPH ? 1 + 0.15 * Math.max(0, 1 - (p.age - 0.125) * 4) ** 2 : 1
      this.put(p.x, p.y, p.size * grow, p.ang, p.rgb, k, p.aspect, p.shape, p.blur, p.cell)
    }
  }
}

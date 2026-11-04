// Echoes: the bots of an echoes match. They run in the host's tab, think, type a letter at a time, reveal on the
// beat, score by the same rules as everyone, and trade locks. Their boards travel as ordinary snapshots.
// shortcut: echoes live on the host; hand them to the new host from their snapshots if this matters.
import { score, chains, points, winBonus, locksFor, trade, land, energyOf, echoGuess, type Mark, type Stats } from './game.ts'
import type { Me, Settings } from './net.ts'

const THINK = [[14, 22], [10, 15], [6, 9]] // seconds per guess, by skill: about 70, 40 and 25 seconds a word
const TYPE = 0.17 // seconds per letter typed
const rand = (a: number, b: number) => a + Math.random() * (b - a)

export type Hooks = {
  changed(e: Echo): void // its board moved: send the snapshot
  lock(e: Echo, n: number): void // it earned locks to throw at the players
  over(e: Echo): void // its light went out, or its time is up
}

export class Echo {
  rows: { word: string; marks: Mark[] }[] = []
  stats: Stats = { greens: new Set(), found: new Set(), guesses: 0, streak: 0 }
  n = 0
  typed = 0
  shown = 5
  sealed = 0
  pending = 0
  score = 0
  stars: number[] = []
  out = false
  done = false
  timer = 0

  id: string
  round: number
  S: Settings
  answers: string[]
  order: number[]
  start: number
  bonus: number
  on: Hooks

  constructor(id: string, round: number, S: Settings, answers: string[], order: number[], start: number, bonus: number, on: Hooks) {
    this.id = id
    this.round = round
    this.S = S
    this.answers = answers
    this.order = order
    this.start = start
    this.bonus = bonus
    this.on = on
  }

  get answer() {
    return this.answers[this.order[this.n % this.order.length]]
  }

  run() {
    this.next(0)
  }

  stop() {
    clearTimeout(this.timer)
    this.done = true
  }

  private wait(sec: number, fn: () => void) {
    this.timer = window.setTimeout(() => !this.done && !this.out && fn(), sec * 1000)
  }

  private elapsed() {
    return performance.now() - this.start
  }

  // A fresh word, with dusk taking its rows in Last light, as it does for everyone.
  private next(delay: number) {
    this.wait(delay, () => {
      if (this.S.mode === 'tide' && this.elapsed() >= this.S.tide * 60000) return this.finish()
      this.rows = []
      this.shown = 5
      this.stats = { greens: new Set(), found: new Set(), guesses: 0, streak: this.stats.streak }
      this.sealed = this.S.mode === 'light' ? Math.min(this.S.rows - 3, Math.floor(this.elapsed() / 180000)) : 0
      this.on.changed(this)
      this.think()
    })
  }

  private think() {
    const word = echoGuess(this.answers, this.rows, this.S.echoes)
    const [lo, hi] = THINK[this.S.echoes]
    this.wait(rand(lo, hi), () => this.type(word, 0))
  }

  private type(word: string, k: number) {
    this.typed = k
    this.on.changed(this)
    if (k < 5) return this.wait(TYPE + rand(0, 0.12), () => this.type(word, k + 1))
    this.wait(0.3, () => this.reveal(word))
  }

  // Tile by tile on the eighth-note grid, earning points the same way a player does.
  private reveal(word: string) {
    const marks = score(word, this.answer), s = this.stats, chain = chains(marks), fresh = marks.map((m, i) => m === 'correct' && !s.greens.has(i))
    this.rows.push({ word, marks })
    this.typed = 0
    this.shown = 0
    s.guesses++
    const tile = (i: number) => {
      if (i === 5) return this.settle(marks, fresh)
      if (marks[i] === 'correct') s.greens.add(i)
      if (marks[i] !== 'absent') s.found.add(word[i])
      this.score += Math.round(points(marks[i], fresh[i], chain[i], s.streak) * this.bonus)
      this.shown = i + 1
      this.on.changed(this)
      this.wait(0.36, () => tile(i + 1))
    }
    tile(0)
  }

  private settle(marks: Mark[], fresh: boolean[]) {
    const s = this.stats, won = marks.every(m => m === 'correct'), used = this.rows.length, extended = fresh.some(Boolean)
    s.streak = extended ? s.streak + 1 : 0
    const t = trade(Math.min(6, locksFor(s.streak, extended, won, used) * this.S.locks), this.pending)
    this.pending = t.pending
    if (t.sent) this.on.lock(this, t.sent)
    if (won) {
      this.score += Math.round(winBonus(used) * this.bonus)
      if (this.S.mode === 'stars') this.stars.push(Math.round(this.elapsed()))
      this.on.changed(this)
      this.n++
      return this.next(3)
    }
    const l = land(this.pending, this.S.rows - this.sealed - used)
    this.pending = l.pending
    this.sealed += l.now
    this.on.changed(this)
    if (used < this.S.rows - this.sealed) return this.think()
    if (this.S.mode === 'light') {
      this.out = true
      this.on.changed(this)
      return this.on.over(this)
    }
    this.n++
    this.next(3)
  }

  private finish() {
    this.done = true
    clearTimeout(this.timer)
    this.on.changed(this)
    this.on.over(this)
  }

  // Locks from the players wait, then land on its next guess, just like yours.
  hit(n: number) {
    if (!this.out && !this.done) this.pending = Math.min(99, this.pending + n)
    this.on.changed(this)
  }

  // Tide: the clock can run out while it's thinking.
  tick() {
    if (!this.done && !this.out && this.S.mode === 'tide' && this.elapsed() >= this.S.tide * 60000) this.finish()
  }

  snapshot(): Me {
    const rows = this.rows.map((r, i) => (i === this.rows.length - 1 ? r.marks.slice(0, this.shown) : r.marks).map(x => x[0]).join(''))
    return {
      round: this.round, n: this.n, rows, typed: this.typed, sealed: this.sealed, pending: this.pending, score: this.score,
      energy: Math.round(energyOf(this.stats) * 100) / 100, out: this.out, done: this.done, stars: this.stars,
      said: [], squat: [], rigged: false, bag: '', guard: '', bot: this.id,
    }
  }
}

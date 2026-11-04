// Pure game rules, kept free of React and audio so they can be tested with plain node.

export type Mark = 'correct' | 'present' | 'absent'

export function score(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array(5).fill('absent')
  const left: Record<string, number> = {}
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) marks[i] = 'correct'
    else left[answer[i]] = (left[answer[i]] || 0) + 1
  }
  for (let i = 0; i < 5; i++) {
    if (marks[i] !== 'correct' && left[guess[i]] > 0) {
      marks[i] = 'present'
      left[guess[i]]--
    }
  }
  return marks
}

// Position of each green inside its run of adjacent greens (0, 1, 2…), or -1 for non-greens.
export function chains(marks: Mark[]) {
  const out: number[] = []
  marks.forEach((m, i) => out.push(m !== 'correct' ? -1 : i > 0 && out[i - 1] >= 0 ? out[i - 1] + 1 : 0))
  return out
}

export type Stats = { greens: Set<number>; found: Set<string>; guesses: number; streak: number }

// How awake the world is, 0..1, earned only by finding letters: greens most, misplaced ones a little.
// Solving the word is the only way to reach 1.
export function energyOf({ greens, found, streak }: Stats) {
  return Math.min(0.92, greens.size * 0.17 + found.size * 0.025 + streak * 0.03)
}

// Musical tension, 0..1: rises when only one or two letters are missing, or when only two rows are left.
export function tensionOf(greens: number, left: number) {
  return Math.min(1, Math.max(greens >= 3 ? (greens - 2) / 2 : 0, left <= 2 ? (3 - left) / 2 : 0))
}

// Points for one checked letter. New greens are worth the most, more inside a chain and on a streak.
export function points(mark: Mark, fresh: boolean, chain: number, streak: number) {
  if (mark === 'correct') return fresh ? Math.round(100 * (1 + Math.max(0, chain) * 0.5) * (1 + streak * 0.25)) : 10
  return mark === 'present' ? 25 : 0
}
export const winBonus = (guesses: number) => 500 * Math.max(1, 7 - guesses) // boards can be up to 8 rows tall

const RANK: Record<string, number> = { absent: 1, present: 2, correct: 3 }
export const best = (a: Mark | undefined, b: Mark): Mark => (a && RANK[a] >= RANK[b] ? a : b)

// ——— playing together ———

// A seeded shuffle (mulberry32), so everyone in a room walks the same list of words.
export function order(seed: number, n: number) {
  let s = seed >>> 0
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), s | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Locks a guess sends: a long streak keeps sending, a quick solve sends a burst.
export const locksFor = (streak: number, extended: boolean, won: boolean, guesses: number) =>
  (extended ? Math.floor(streak / 3) : 0) + (won ? Math.max(0, 4 - guesses) : 0)

// Locks you earn melt your own pending ones first; only the rest fly.
export function trade(earned: number, pending: number) {
  const melt = Math.min(earned, pending)
  return { sent: earned - melt, pending: pending - melt }
}

// How many pending locks seal rows now. Never the last free row: the rest melt, or wait under heavy frost.
export function land(pending: number, free: number, heavy = false) {
  const now = Math.min(pending, Math.max(0, free - 1))
  return { now, pending: heavy ? pending - now : 0 }
}

// The brightest other player still lit: light flows toward the leader.
export function target<T extends { score: number }>(players: T[], rand = Math.random): T | undefined {
  const top = Math.max(...players.map(p => p.score)), lead = players.filter(p => p.score === top)
  return lead[Math.floor(rand() * lead.length)]
}

// Strict trial: greens must stay put and ambers must come back. Returns the letter a guess drops, or null.
export function strictBreak(word: string, rows: { word: string; marks: Mark[] }[]) {
  for (const r of rows)
    for (let i = 0; i < 5; i++) {
      if (r.marks[i] === 'correct' && word[i] !== r.word[i]) return r.word[i]
      if (r.marks[i] === 'present' && !word.includes(r.word[i])) return r.word[i]
    }
  return null
}

export const trialBonus = (trials: number) => 1 + 0.25 * trials

// A short fingerprint of a guess (FNV-1a), so Jinx can spot two players typing the same word without sending letters.
export function hash(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}

// Squatter: a letter dropped into a free box of the next row. It is taken from a real word that still fits what
// you've found (greens in place, every amber somewhere) and any squatters already there, so the row stays solvable.
export function squatLetter(valid: Iterable<string>, greens: Record<number, string>, ambers: string[], squat: Record<number, string>, rand = Math.random) {
  const fixed = { ...greens, ...squat }, open = [0, 1, 2, 3, 4].filter(i => !(i in fixed))
  if (!open.length) return null
  const fits = [...valid].filter(w => Object.entries(fixed).every(([i, ch]) => w[+i] === ch) && ambers.every(ch => w.includes(ch)))
  if (!fits.length) return null
  const w = fits[Math.floor(rand() * fits.length)], pos = open[Math.floor(rand() * open.length)]
  return { pos, ch: w[pos] }
}

// The typed letters flow into the boxes a squatter left free.
export function compose(typed: string, squat: Record<number, string>) {
  let k = 0
  return Array.from({ length: 5 }, (_, i) => squat[i] ?? typed[k++] ?? '').join('')
}

// Rigged: the nastiest answers, by how rare their letters are and how often a letter repeats.
export function hardest(answers: string[], share = 0.15) {
  const freq: Record<string, number> = {}
  for (const w of answers) for (const ch of new Set(w)) freq[ch] = (freq[ch] ?? 0) + 1
  const hard = (w: string) => [...w].reduce((s, ch) => s - Math.log(freq[ch] / answers.length), 0) + (5 - new Set(w).size) * 2
  return [...answers].sort((a, b) => hard(b) - hard(a)).slice(0, Math.max(3, Math.round(answers.length * share)))
}

// Skills: a weighted spin of the reel.
export function roll<K extends string>(weights: Record<K, number>, rand = Math.random): K {
  const keys = Object.keys(weights) as K[], total = keys.reduce((s, k) => s + weights[k], 0)
  let x = rand() * total
  for (const k of keys) if ((x -= weights[k]) < 0) return k
  return keys[keys.length - 1]
}

// Teams: a newcomer joins the smaller side (dawn on a tie).
export const balance = (sides: Record<string, number>) => (Object.values(sides).filter(s => s === 1).length < Object.values(sides).filter(s => s === 0).length ? 1 : 0)

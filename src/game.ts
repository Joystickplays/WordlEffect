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

// Musical tension, 0..1: rises when only one or two letters are missing, or when guesses run low.
export function tensionOf(greens: number, used: number) {
  return Math.min(1, Math.max(greens >= 3 ? (greens - 2) / 2 : 0, used >= 4 ? (used - 3) / 2 : 0))
}

// Points for one checked letter. New greens are worth the most, more inside a chain and on a streak.
export function points(mark: Mark, fresh: boolean, chain: number, streak: number) {
  if (mark === 'correct') return fresh ? Math.round(100 * (1 + Math.max(0, chain) * 0.5) * (1 + streak * 0.25)) : 10
  return mark === 'present' ? 25 : 0
}
export const winBonus = (guesses: number) => 500 * (7 - guesses)

const RANK: Record<string, number> = { absent: 1, present: 2, correct: 3 }
export const best = (a: Mark | undefined, b: Mark): Mark => (a && RANK[a] >= RANK[b] ? a : b)

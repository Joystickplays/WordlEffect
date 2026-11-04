// The parts of playing together you can see: the room's settings, and everyone else's board in miniature.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { COLOURS, type Me, type Mode, type Settings } from './net.ts'
const MODES: Mode[] = ['light', 'tide', 'stars']
const MODE_NAMES = { light: 'last light', tide: 'tide', stars: 'stars' }
const LOCKS = ['off', 'gentle', 'fierce']
const TRIAL_NAMES = ['strict', 'undertow', 'fading', 'heavy frost']
const MARK = { c: 'correct', p: 'present', a: 'absent' } as const
const after = <T,>(list: readonly T[], v: T) => list[(list.indexOf(v) + 1) % list.length]
const still = (e: { preventDefault(): void }) => e.preventDefault() // keep focus off, so Enter still reaches the board

// What each mode and trial means, in plain words.
const ABOUT: Record<string, string> = {
  light: "Get a word wrong and you're out. The last player still going wins. Every 3 minutes, every board loses a row, so the match can't go on forever.",
  tide: 'A race against the clock. Solve as many words as you can before time runs out. The highest score wins.',
  stars: 'Every word you solve earns you a star. The first player to collect 3 stars (or 5) wins.',
  strict: "Letters you've found must stay in your next guesses. Green letters keep their spot, and yellow ones have to be used somewhere.",
  undertow: "You get about 23 seconds for each guess. Take longer and one of your rows freezes. If it's your last row, you lose that word.",
  fading: "Colours fade from your board a few seconds after each guess, and the keyboard doesn't keep them. You have to remember what you found.",
  'heavy frost': "Frozen rows stay frozen when you start a new word. Solving a word in 3 guesses or fewer melts one of them.",
}

// A small (i) that springs open a plain-English explanation. Clicking anywhere else, or Escape, closes it.
function Info({ about }: { about: string }) {
  const [open, setOpen] = useState(false), el = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: Event) => !el.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    addEventListener('pointerdown', away)
    addEventListener('keydown', esc)
    return () => {
      removeEventListener('pointerdown', away)
      removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <span className="info" ref={el}>
      <button aria-label={`What is ${MODE_NAMES[about as Mode] ?? about}?`} aria-expanded={open} onMouseDown={still} onClick={() => setOpen(!open)}>
        i
      </button>
      {open && (
        <span className="pop" role="tooltip">
          {ABOUT[about]}
        </span>
      )}
    </span>
  )
}

function Choice({ label, value, onClick, about }: { label: string; value: string | number; onClick?: () => void; about?: string }) {
  return (
    <p>
      <small>{label}</small>
      <b>
        {onClick ? <button className="cycle" onMouseDown={still} onClick={onClick}>{value}</button> : value}
        {about && <Info about={about} />}
      </b>
    </p>
  )
}

// Only the host gets `set`; everyone else sees the same values, unclickable.
export function Setup({ side, s, set }: { side: 'left' | 'right'; s: Settings; set?: (s: Settings) => void }) {
  const ch = (patch: Partial<Settings>) => set && (() => set({ ...s, ...patch }))
  if (side === 'left')
    return (
      <>
        <Choice label="Mode" value={MODE_NAMES[s.mode]} onClick={ch({ mode: after(MODES, s.mode) })} about={s.mode} />
        <Choice label="Rows" value={s.rows} onClick={ch({ rows: s.rows === 8 ? 4 : s.rows + 1 })} />
        <Choice label="Locks" value={LOCKS[s.locks]} onClick={ch({ locks: (s.locks + 1) % 3 })} />
        <Choice label="Words" value={s.lang === 'en' ? 'English' : 'Indonesian'} onClick={ch({ lang: s.lang === 'en' ? 'id' : 'en' })} />
      </>
    )
  return (
    <>
      <p>
        <small>Trials</small>
        <span className="trials">
          {TRIAL_NAMES.map((t, i) => {
            const on = !!(s.trials & (1 << i))
            return (
              <span key={t}>
                <button className={on ? 'on' : ''} aria-pressed={on} disabled={!set} onMouseDown={still} onClick={() => set?.({ ...s, trials: s.trials ^ (1 << i) })}>
                  {t}
                </button>
                <Info about={t} />
              </span>
            )
          })}
        </span>
      </p>
      <Choice label="Seats" value={s.seats} onClick={ch({ seats: s.seats === 8 ? 2 : s.seats + 1 })} />
      {s.mode === 'tide' && <Choice label="Length" value={`${s.tide} min`} onClick={ch({ tide: after([3, 5, 10], s.tide) })} />}
      {s.mode === 'stars' && <Choice label="Stars" value={s.stars} onClick={ch({ stars: s.stars === 3 ? 5 : 3 })} />}
    </>
  )
}

// Which word a player is on, under their board: "guessing the 2nd word", or that they've stopped.
export function Which({ n, out, done }: { n: number; out?: boolean; done?: boolean }) {
  const k = n + 1, th = k % 100 >= 11 && k % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][k % 10] ?? 'th')
  return <span className="which"> · {out ? 'light out' : done ? 'finished' : `guessing the ${k}${th} word`}</span>
}

// Someone else's board, the same size as yours: colours only, never letters.
export function Panel({ seat, snap, rows, live, el }: { seat: number; snap?: Me; rows: number; live: boolean; el: (e: HTMLElement | null) => void }) {
  const [name, h] = COLOURS[seat], marks = snap?.rows ?? [], sealed = snap?.sealed ?? 0
  return (
    <figure ref={el} className={`panel ${snap?.out ? 'out' : ''}`} style={{ '--h': h, '--pe': snap?.energy ?? 0 } as CSSProperties}>
      <div className="board peer" aria-hidden="true">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className={`row ${r >= rows - sealed ? 'sealed' : ''}`}>
            {Array.from({ length: 5 }, (_, c) => {
              const m = marks[r]?.[c] as keyof typeof MARK | undefined
              return <div key={c} className={`tile ${m ? `filled ${MARK[m]}` : r === marks.length && c < (snap?.typed ?? 0) ? 'filled' : ''}`} />
            })}
          </div>
        ))}
      </div>
      <figcaption>
        <span>
          {name}
          {!!snap?.stars.length && <span className="stars"> {'✦'.repeat(snap.stars.length)}</span>}
        </span>
        {live && <Which n={snap?.n ?? 0} out={snap?.out} done={snap?.done} />}
      </figcaption>
    </figure>
  )
}

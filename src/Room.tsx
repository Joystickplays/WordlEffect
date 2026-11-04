// The parts of playing together you can see: the room's settings, and everyone else's board in miniature.
import type { CSSProperties } from 'react'
import { COLOURS, type Me, type Mode, type Settings } from './net.ts'
const MODES: Mode[] = ['light', 'tide', 'stars']
const MODE_NAMES = { light: 'last light', tide: 'tide', stars: 'stars' }
const LOCKS = ['off', 'gentle', 'fierce']
const TRIAL_NAMES = ['strict', 'undertow', 'fading', 'heavy frost']
const MARK = { c: 'correct', p: 'present', a: 'absent' } as const
const after = <T,>(list: readonly T[], v: T) => list[(list.indexOf(v) + 1) % list.length]
const still = (e: { preventDefault(): void }) => e.preventDefault() // keep focus off, so Enter still reaches the board

function Choice({ label, value, onClick }: { label: string; value: string | number; onClick?: () => void }) {
  return (
    <p>
      <small>{label}</small>
      <b>{onClick ? <button className="cycle" onMouseDown={still} onClick={onClick}>{value}</button> : value}</b>
    </p>
  )
}

// Only the host gets `set`; everyone else sees the same values, unclickable.
export function Setup({ side, s, set }: { side: 'left' | 'right'; s: Settings; set?: (s: Settings) => void }) {
  const ch = (patch: Partial<Settings>) => set && (() => set({ ...s, ...patch }))
  if (side === 'left')
    return (
      <>
        <Choice label="Mode" value={MODE_NAMES[s.mode]} onClick={ch({ mode: after(MODES, s.mode) })} />
        <Choice label="Rows" value={s.rows} onClick={ch({ rows: s.rows === 8 ? 4 : s.rows + 1 })} />
        <Choice label="Locks" value={LOCKS[s.locks]} onClick={ch({ locks: (s.locks + 1) % 3 })} />
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
              <button key={t} className={on ? 'on' : ''} aria-pressed={on} disabled={!set} onMouseDown={still} onClick={() => set?.({ ...s, trials: s.trials ^ (1 << i) })}>
                {t}
              </button>
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

// Someone else's board: colours only, never letters, glowing in their hue as their world wakes.
export function Panel({ seat, snap, rows, el }: { seat: number; snap?: Me; rows: number; el: (e: HTMLElement | null) => void }) {
  const [name, h] = COLOURS[seat], marks = snap?.rows ?? [], sealed = snap?.sealed ?? 0
  return (
    <figure ref={el} className={`panel ${snap?.out ? 'out' : ''}`} style={{ '--h': h, '--pe': snap?.energy ?? 0 } as CSSProperties}>
      <div className="mini" aria-hidden="true">
        {Array.from({ length: rows * 5 }, (_, i) => {
          const r = Math.floor(i / 5), c = i % 5, m = marks[r]?.[c] as keyof typeof MARK | undefined
          const cls = r >= rows - sealed ? 'sealed' : m ? MARK[m] : r === marks.length && c < (snap?.typed ?? 0) ? 'typed' : ''
          return <i key={i} className={cls} />
        })}
      </div>
      <figcaption>
        {name}
        {!!snap?.stars.length && <span className="stars"> {'✦'.repeat(snap.stars.length)}</span>}
      </figcaption>
    </figure>
  )
}

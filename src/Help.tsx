// How to play: shown on your first visit, and from the ? in the corner. Escape, Enter or a click outside closes it.
import { useEffect, useState, type CSSProperties } from 'react'
import { Crown } from './Room.tsx'

const still = (e: { preventDefault(): void }) => e.preventDefault() // keep focus off, so keys still reach the board
const MARK = { c: 'correct', p: 'present', a: 'absent' } as Record<string, string>
const step = (i: number) => ({ '--i': i }) as CSSProperties // each line arrives a moment after the one before

export function Help({ together, close }: { together: boolean; close: () => void }) {
  const [tab, setTab] = useState(together ? 1 : 0)
  const [leaving, setLeaving] = useState(false)
  const shut = () => leaving || (setLeaving(true), setTimeout(close, 260))
  useEffect(() => {
    const key = (e: KeyboardEvent) => (e.key === 'Escape' || e.key === 'Enter') && (e.preventDefault(), setLeaving(true), setTimeout(close, 260))
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [close])
  return (
    <div className={`help ${leaving ? 'leaving' : ''}`} role="dialog" aria-modal="true" aria-label="How to play" onClick={shut}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <p className="tag" style={step(0)}>wordle, with eye candy</p>
        <nav style={step(1)}>
          {['alone', 'together'].map((t, i) => (
            <button key={t} className={tab === i ? 'on' : ''} aria-pressed={tab === i} onMouseDown={still} onClick={() => setTab(i)}>
              {t}
            </button>
          ))}
        </nav>
        {tab === 0 ? (
          <div className="page" key="alone">
            <p style={step(2)}>Five letters, six tries.</p>
            <div className="row" aria-hidden="true" style={step(3)}>
              {[...'light'].map((ch, i) => (
                <div key={i} className={`tile filled ${MARK['cpaaa'[i]]}`} style={step(4 + i)}>
                  <span>{ch}</span>
                </div>
              ))}
            </div>
            <p className="legend" style={step(5)}>
              <b className="g">right spot</b> <b className="y">elsewhere</b> <b className="d">not in it</b>
            </p>
            <p style={step(6)}>New greens back to back grow the light, and the music.</p>
          </div>
        ) : (
          <div className="page" key="together">
            <p style={step(2)}>A room is a word. Share the link, or type the word and press Enter.</p>
            <p style={step(3)}>Same words, your own pace. Others' boards show colours, never letters.</p>
            <p style={step(4)}><Crown /> picks the settings. Click your name to change it.</p>
            <p style={step(5)}>Every setting has an <i>i</i>.</p>
          </div>
        )}
        <button className="ok" style={step(7)} onMouseDown={still} onClick={shut}>
          got it
        </button>
      </div>
    </div>
  )
}

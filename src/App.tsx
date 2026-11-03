import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from 'react'
import { ANSWERS, VALID } from './words.ts'
import { score, chains, energyOf, tensionOf, best, points, winBonus, type Mark, type Stats } from './game.ts'
import { FX } from './fx.ts'
import { Sound, BEAT, EIGHTH, BAR } from './audio.ts'

const ROWS = 6
const COLS = 5
const KEYS = ['qwertyuiop', 'asdfghjkl', '⏎zxcvbnm⌫']
const NAMES = { correct: 'right', present: 'elsewhere', absent: 'not in word' }
const SHAKE = [0, -7, 6, -4, 3, -1, 0].map(x => ({ transform: `translateX(${x}px)` }))
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const pick = () => ANSWERS[Math.floor(Math.random() * ANSWERS.length)]
const fresh = (): Stats => ({ greens: new Set(), found: new Set(), guesses: 0, streak: 0 })
const clockText = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

// Numbers roll up to their new value instead of jumping.
function Tally({ value }: { value: number }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = from.current, t0 = performance.now()
    let raf = requestAnimationFrame(function step(now) {
      const k = Math.min(1, (now - t0) / 700)
      from.current = Math.round(start + (value - start) * (1 - (1 - k) ** 3))
      setShown(from.current)
      if (k < 1) raf = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{shown.toLocaleString('en-US')}</>
}

function Meter({ value }: { value: number }) {
  return (
    <svg className="meter" viewBox="0 0 40 40" role="img" aria-label={`${Math.round(value * 100)}%`}>
      <circle cx="20" cy="20" r="16" pathLength="100" />
      <circle cx="20" cy="20" r="16" pathLength="100" strokeDasharray={`${value * 100} 100`} />
    </svg>
  )
}

export default function App() {
  const [answer, setAnswer] = useState(pick)
  const [rows, setRows] = useState<{ word: string; marks: Mark[] }[]>([])
  const [cur, setCur] = useState('')
  const [shown, setShown] = useState(COLS) // tiles revealed so far in the newest row
  const [phase, setPhase] = useState<'play' | 'busy' | 'over'>('play')
  const [result, setResult] = useState<'won' | 'lost' | null>(null)
  const [keys, setKeys] = useState<Record<string, Mark>>({})
  const [ghost, setGhost] = useState(0) // answer letters shown after a loss
  const [energy, setEnergy] = useState(0)
  const [said, say] = useState('')
  const [woke, setWoke] = useState(false)
  const [streak, setStreak] = useState(0)
  const [scored, setPoints] = useState(0)
  const [total, setTotal] = useState(0)
  const [clock, setClock] = useState({ start: 0, end: 0, now: 0 })
  const [flare, setFlare] = useState(false) // the winning row's letters flaring HDR-white

  const canvas = useRef<HTMLCanvasElement>(null!), board = useRef<HTMLDivElement>(null!)
  const rowEls = useRef<HTMLDivElement[]>([]), tileEls = useRef<HTMLDivElement[]>([]), ghostEls = useRef<HTMLDivElement[]>([])
  const fx = useRef<FX>(null!), snd = useRef<Sound>(null!), stats = useRef(fresh())

  useEffect(() => {
    const f = (fx.current = new FX(canvas.current))
    const s = (snd.current = new Sound())
    s.onEvent = (type, data) => f[type](data) // the music drives the light: heartbeat, glints, chord colours
    const place = () => {
      f.setBoard(board.current.getBoundingClientRect())
      const cs = getComputedStyle(tileEls.current[0])
      f.letters(parseFloat(cs.fontSize), cs.fontFamily, cs.fontWeight)
    }
    place()
    addEventListener('resize', place)
    return () => {
      removeEventListener('resize', place)
      f.destroy()
      s.destroy()
    }
  }, [])

  const center = (el: Element) => {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, fs: parseFloat(getComputedStyle(el).fontSize) }
  }
  const tile = (r: number, c: number) => center(tileEls.current[r * COLS + c])

  useEffect(() => {
    if (!clock.start || clock.end) return
    const id = setInterval(() => setClock(c => ({ ...c, now: Date.now() })), 250)
    return () => clearInterval(id)
  }, [clock.start, clock.end])

  const earn = (n: number) => {
    setPoints(p => p + n)
    setTotal(p => p + n)
  }

  const charge = (e: number) => {
    fx.current.setEnergy(e)
    snd.current.setEnergy(e)
    setEnergy(e)
  }

  function onKey(k: string) {
    if (snd.current.wake()) fx.current.wake()
    if (!woke) setWoke(true)
    if (phase === 'over') return k === 'enter' && restart()
    if (phase !== 'play') return
    // oxlint-disable-next-line react/purity -- onKey only ever runs from input events, never during render
    if (!clock.start) setClock({ start: Date.now(), end: 0, now: Date.now() })
    const r = rows.length
    if (k === 'enter') return submit()
    if (k === 'back') {
      if (!cur) return
      snd.current.erase(cur[cur.length - 1])
      fx.current.erase(tile(r, cur.length - 1))
      setCur(cur.slice(0, -1))
    } else if (/^[a-z]$/.test(k) && cur.length < COLS) {
      snd.current.type(k)
      fx.current.type(tile(r, cur.length))
      setCur(cur + k)
    }
  }

  function submit() {
    if (cur.length < COLS || !VALID.has(cur)) {
      snd.current.invalid()
      fx.current.nope()
      if (!reduced) rowEls.current[rows.length].animate(SHAKE, { duration: 420, easing: 'ease-out' })
      say(cur.length < COLS ? 'Not enough letters' : 'Not in word list')
      return
    }
    const r = rows.length, word = cur, marks = score(word, answer), s = stats.current
    const chain = chains(marks), isNew = marks.map((m, i) => m === 'correct' && !s.greens.has(i))
    s.guesses++
    setRows([...rows, { word, marks }])
    setCur('')
    setShown(0)
    setPhase('busy')
    const t0 = snd.current.grid(EIGHTH)
    marks.forEach((m, i) => {
      const t = t0 + i * EIGHTH
      snd.current.reveal(i, m, t, { chain: chain[i], fresh: isNew[i] })
      snd.current.at(t, () => {
        if (m === 'correct') s.greens.add(i)
        if (m !== 'absent') s.found.add(word[i])
        fx.current.reveal(tile(r, i), m, { fresh: isNew[i], chain: chain[i], ch: word[i] })
        earn(points(m, isNew[i], chain[i], s.streak))
        charge(energyOf(s))
        setShown(i + 1)
        setKeys(k => ({ ...k, [word[i]]: best(k[word[i]], m) }))
      })
    })
    snd.current.at(t0 + COLS * EIGHTH, () => settle(r, word, marks, chain, isNew))
  }

  function settle(r: number, word: string, marks: Mark[], chain: number[], isNew: boolean[]) {
    const s = stats.current, won = marks.every(m => m === 'correct')
    s.streak = isNew.some(Boolean) ? s.streak + 1 : 0
    for (let i = 0; i < COLS - 1; i++) if (chain[i + 1] > 0) fx.current.beam(tile(r, i), tile(r, i + 1))
    fx.current.setStreak(s.streak)
    snd.current.setStreak(s.streak)
    setStreak(s.streak)
    say(`${word}: ${marks.map((m, i) => `${word[i]} ${NAMES[m]}`).join(', ')}`)
    if (!won) {
      snd.current.combo(snd.current.grid(EIGHTH), Math.max(...chain) + 1, s.streak)
      snd.current.setTension(tensionOf(s.greens.size, r + 1))
      charge(energyOf(s))
    }
    if (won) finish('won', r)
    else if (r === ROWS - 1) finish('lost', r)
    else setPhase('play')
  }

  function finish(res: 'won' | 'lost', r: number) {
    setResult(res)
    setClock(c => ({ ...c, end: Date.now() }))
    const t = snd.current.grid(BEAT)
    if (res === 'won') {
      earn(winBonus(r + 1))
      snd.current.win(t, answer)
      snd.current.at(t, () => {
        fx.current.setBoard(board.current.getBoundingClientRect())
        fx.current.supernova(1 + (ROWS - 1 - r) * 0.25) // the fewer the guesses, the brighter the star
        ;[...answer].forEach((ch, c) => fx.current.glyph(tile(r, c), ch, 4.5, 1.6))
        setFlare(true)
        setEnergy(1)
        say('Solved')
      })
      snd.current.at(t + BAR, () => setPhase('over'))
    } else {
      snd.current.lose(t, answer)
      fx.current.snow()
      ;[...answer].forEach((_, i) =>
        snd.current.at(t + BEAT + (i * BEAT) / 2, () => {
          setGhost(i + 1)
          fx.current.answer(center(ghostEls.current[i]), answer[i])
        }),
      )
      snd.current.at(t + BAR * 1.5, () => {
        setPhase('over')
        say(`The word was ${answer}`)
      })
    }
  }

  function restart() {
    fx.current.reset()
    snd.current.reset()
    stats.current = fresh()
    setAnswer(pick())
    setRows([])
    setCur('')
    setShown(COLS)
    setPhase('play')
    setResult(null)
    setKeys({})
    setGhost(0)
    setEnergy(0)
    setStreak(0)
    setPoints(0)
    setClock({ start: 0, end: 0, now: 0 })
    setFlare(false)
  }

  const press = useEffectEvent(onKey)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as Element).closest?.('button') && (e.key === 'Enter' || e.key === ' ')) return // the focused button handles it
      const k = e.key === 'Enter' ? 'enter' : e.key === 'Backspace' ? 'back' : e.key.toLowerCase()
      if (k === 'enter' || k === 'back' || /^[a-z]$/.test(k)) {
        e.preventDefault()
        press(k)
      }
    }
    addEventListener('keydown', h)
    return () => removeEventListener('keydown', h)
  }, [])

  return (
    <main className={`app ${woke ? 'awake' : ''}`} style={{ '--e': energy, '--bar': `${BAR}s` } as CSSProperties}>
      <div className="stage">
      <aside className="hud left">
        <p><small>Guess</small><b>{rows.length}<i>/{ROWS}</i></b></p>
        <p><small>Streak</small><b>{streak ? `×${streak}` : '–'}</b></p>
        <p><small>Light</small><Meter value={energy} /></p>
      </aside>
      <div className="board" ref={board} role="grid" aria-label="Guesses">
        {Array.from({ length: ROWS }, (_, r) => {
          const row = rows[r], word = row ? row.word : r === rows.length ? cur : ''
          return (
            <div key={r} role="row" ref={el => { rowEls.current[r] = el! }} className={`row ${result === 'won' && r !== rows.length - 1 ? 'dim' : ''} ${flare && r === rows.length - 1 ? 'flare' : ''}`}>
              {Array.from({ length: COLS }, (_, c) => {
                const mark = row && (r < rows.length - 1 || c < shown) ? row.marks[c] : ''
                const caret = phase === 'play' && r === rows.length && c === cur.length
                return (
                  <div key={c} role="gridcell" ref={el => { tileEls.current[r * COLS + c] = el! }} className={`tile ${word[c] ? 'filled' : ''} ${mark} ${caret ? 'caret' : ''}`}>
                    {word[c] && <span key={word[c]}>{word[c]}</span>}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      <aside className="hud right">
        <p><small>Time</small><b>{clockText(clock.start ? Math.max(0, Math.floor(((clock.end || clock.now) - clock.start) / 1000)) : 0)}</b></p>
        <p><small>Score</small><b><Tally value={scored} /></b></p>
        <p><small>Total</small><b><Tally value={total} /></b></p>
      </aside>
      </div>

      <div className="ghost" aria-hidden="true">
        {result === 'lost' &&
          [...answer].map((ch, i) => (
            <div key={i} ref={el => { ghostEls.current[i] = el! }} className={`tile mini ${i < ghost ? 'on' : ''}`}>
              {i < ghost && <span>{ch}</span>}
            </div>
          ))}
      </div>

      <div className="keys">
        {KEYS.map((line, i) => (
          <div className="krow" key={i}>
            {[...line].map(ch => {
              const k = ch === '⏎' ? 'enter' : ch === '⌫' ? 'back' : ch
              return (
                <button
                  key={k}
                  aria-label={k === 'enter' ? 'Enter' : k === 'back' ? 'Delete' : k}
                  className={`key ${keys[k] || ''} ${k.length > 1 ? 'wide' : ''} ${k === 'enter' && phase === 'over' ? 'beckon' : ''}`}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => onKey(k)}
                >
                  {ch}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div className="sr" aria-live="polite">{said}</div>
      <canvas className="fx" ref={canvas} aria-hidden="true" />
    </main>
  )
}

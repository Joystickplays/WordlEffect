import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from 'react'
import { ANSWERS, VALID } from './words.ts'
import { score, chains, energyOf, tensionOf, best, points, winBonus, order, type Mark, type Stats } from './game.ts'
import { FX } from './fx.ts'
import { Sound, BEAT, EIGHTH, BAR } from './audio.ts'
import { connect, selfId, COLOURS, DEFAULTS, type Net, type Room, type Me } from './net.ts'
import { Setup, Panel } from './Room.tsx'

const ROWS = 6
const COLS = 5
const KEYS = ['qwertyuiop', 'asdfghjkl', '⏎zxcvbnm⌫']
const NAMES = { correct: 'right', present: 'elsewhere', absent: 'not in word' }
const SHAKE = [0, -7, 6, -4, 3, -1, 0].map(x => ({ transform: `translateX(${x}px)` }))
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const pick = () => ANSWERS[Math.floor(Math.random() * ANSWERS.length)]
const fresh = (): Stats => ({ greens: new Set(), found: new Set(), guesses: 0, streak: 0 })
// One match, kept in a ref: scheduled reveals read it long after the render that started them.
const freshMatch = () => ({
  live: false, round: 0, S: DEFAULTS, seats: {} as Record<string, number>, order: [] as number[], n: 0, start: 0,
  score: 0, pending: 0, sealed: 0, locked: 0, carry: 0, out: false, done: false, ended: false, stars: [] as number[],
})
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
  const [full, setFull] = useState(false)
  const [woke, setWoke] = useState(false)
  const [streak, setStreak] = useState(0)
  const [scored, setPoints] = useState(0)
  const [total, setTotal] = useState(0)
  const [clock, setClock] = useState({ start: 0, end: 0, now: 0 })
  const [flare, setFlare] = useState(false) // the winning row's letters flaring HDR-white
  const [sealed, setSealed] = useState(0) // rows frozen shut at the bottom of the board
  // playing together
  const [code, setCode] = useState<string | null>(null) // the room's word
  const [room, setRoom] = useState<Room | null>(null)
  const [peers, setPeers] = useState<string[]>([])
  const [host, setHost] = useState(true)
  const [line, setLine] = useState('') // the one quiet line of text under the board
  const [live, setLive] = useState(false) // a match is being played
  const [snaps, setSnaps] = useState<Record<string, Me>>({}) // everyone else's panel

  const canvas = useRef<HTMLCanvasElement>(null!), board = useRef<HTMLDivElement>(null!)
  const rowEls = useRef<HTMLDivElement[]>([]), tileEls = useRef<HTMLDivElement[]>([]), ghostEls = useRef<HTMLDivElement[]>([])
  const fx = useRef<FX>(null!), snd = useRef<Sound>(null!), stats = useRef(fresh())
  const net = useRef<Net | null>(null), roomRef = useRef<Room | null>(null), peersRef = useRef<string[]>([])
  const mp = useRef(freshMatch()), snapsRef = useRef<Record<string, Me>>({}), panelEls = useRef<Record<string, HTMLElement | null>>({})
  const limit = room ? room.settings.rows : ROWS
  const lobby = !!code && !live
  const seated = room ? Object.keys(room.seats).filter(id => id === selfId || peers.includes(id)).length : 0
  const others = room ? Object.keys(room.seats).filter(id => id !== selfId && peers.includes(id)).sort((a, b) => room.seats[a] - room.seats[b]) : []
  const side = (id: string) => (others.indexOf(id) % 2 ? 0.6 : -0.6) // panels alternate left and right
  const hueOf = (id: string) => COLOURS[roomRef.current?.seats[id] ?? 0][1]

  useEffect(() => {
    const f = (fx.current = new FX(canvas.current))
    const s = (snd.current = new Sound())
    s.onEvent = (type, data) => f[type](data) // the music drives the light: heartbeat, glints, chord colours
    const fit = () => place()
    fit()
    addEventListener('resize', fit)
    return () => {
      removeEventListener('resize', fit)
      f.destroy()
      s.destroy()
    }
  }, [])

  // The light needs to know where the board is, and how big its letters are.
  const place = useEffectEvent(() => {
    fx.current.setBoard(board.current.getBoundingClientRect())
    const cs = getComputedStyle(tileEls.current[0])
    fx.current.letters(parseFloat(cs.fontSize), cs.fontFamily, cs.fontWeight)
  })
  useEffect(() => place(), [limit, code, others.length])

  const center = (el: Element) => {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, fs: parseFloat(getComputedStyle(el).fontSize) }
  }
  const tile = (r: number, c: number) => center(tileEls.current[r * COLS + c])

  useEffect(() => {
    const sync = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  useEffect(() => {
    if (!clock.start || clock.end) return
    const id = setInterval(() => setClock(c => ({ ...c, now: Date.now() })), 250)
    return () => clearInterval(id)
  }, [clock.start, clock.end])

  const earn = (n: number) => {
    if (mp.current.live) mp.current.score += n
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
    if (phase === 'over') return k === 'enter' && !code && restart()
    if (phase !== 'play') return
    // oxlint-disable-next-line react/purity -- onKey only ever runs from input events, never during render
    if (!clock.start && !code) setClock({ start: Date.now(), end: 0, now: Date.now() })
    const r = rows.length
    if (k === 'enter') return lobby ? lobbyEnter() : submit()
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

  function refuse(why: string) {
    snd.current.invalid()
    fx.current.nope()
    if (!reduced) rowEls.current[rows.length].animate(SHAKE, { duration: 420, easing: 'ease-out' })
    say(why)
  }

  function submit() {
    if (cur.length < COLS || !VALID.has(cur)) return refuse(cur.length < COLS ? 'Not enough letters' : 'Not in word list')
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
      snd.current.setTension(tensionOf(s.greens.size, limit - sealed - r - 1))
      charge(energyOf(s))
    }
    if (won) finish('won', r)
    else if (r + 1 >= limit - sealed) finish('lost', r)
    else setPhase('play')
  }

  function finish(res: 'won' | 'lost', r: number) {
    const m = mp.current
    setResult(res)
    if (!m.live) setClock(c => ({ ...c, end: Date.now() }))
    const t = snd.current.grid(BEAT)
    if (res === 'won') {
      earn(winBonus(r + 1))
      snd.current.win(t, answer)
      snd.current.at(t, () => {
        fx.current.setBoard(board.current.getBoundingClientRect())
        fx.current.supernova(1 + Math.max(0, 5 - r) * 0.25) // the fewer the guesses, the brighter the star
        ;[...answer].forEach((ch, c) => fx.current.glyph(tile(r, c), ch, 4.5, 1.6))
        setFlare(true)
        setEnergy(1)
        say('Solved')
      })
      snd.current.at(t + BAR, () => (m.live ? advance(true) : setPhase('over')))
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
        say(`The word was ${answer}`)
        if (m.live) advance(false)
        else setPhase('over')
      })
    }
  }

  // A fresh board. In a match the streak, score and clock carry on to the next word.
  function restart(word = pick(), keep = false) {
    fx.current.reset()
    snd.current.reset()
    stats.current = { ...fresh(), streak: keep ? stats.current.streak : 0 }
    setAnswer(word)
    setRows([])
    setCur('')
    setShown(COLS)
    setPhase('play')
    setResult(null)
    setKeys({})
    setGhost(0)
    setStreak(stats.current.streak)
    setPoints(0)
    setFlare(false)
    if (keep) {
      fx.current.setStreak(stats.current.streak)
      snd.current.setStreak(stats.current.streak)
      charge(energyOf(stats.current))
    } else {
      setEnergy(0)
      setClock({ start: 0, end: 0, now: 0 })
      setSealed(0)
    }
  }

  // ——— playing together ———

  const flash = (s: string) => {
    setLine(s)
    setTimeout(() => setLine(l => (l === s ? '' : l)), 2500)
  }

  function goTo(word: string, joined = false) {
    restart()
    setCode(word)
    history.replaceState(null, '', `#${word}`)
    peersRef.current = []
    setPeers([])
    setHost(true)
    applyRoom({ settings: roomRef.current?.settings ?? DEFAULTS, phase: 'lobby', seed: 0, round: 0, seats: { [selfId]: 0 } })
    setRows([{ word, marks: Array(COLS).fill('correct') }]) // the room's word, lit, on the first row
    setLine('')
    if (joined) setTimeout(() => !peersRef.current.length && location.hash === `#${word}` && setLine('still looking for them'), 20000)
  }

  function leave() {
    mp.current = freshMatch()
    setLive(false)
    snapsRef.current = {}
    setSnaps({})
    setCode(null)
    roomRef.current = null
    setRoom(null)
    peersRef.current = []
    setPeers([])
    setLine('')
    history.replaceState(null, '', location.pathname + location.search)
    restart()
  }

  function applyRoom(r: Room) {
    const prev = roomRef.current
    roomRef.current = r
    setRoom(r)
    for (const id in r.seats) if (id !== selfId && !(prev && id in prev.seats)) say(`${COLOURS[r.seats[id]][0]} is here`)
    const m = mp.current
    if (r.phase === 'play' && selfId in r.seats && r.round !== m.round) begin(r)
    else if (r.phase === 'lobby' && m.live) backToLobby()
    if (selfId in r.seats) setLine(l => (l.startsWith('this room') || l.startsWith("they're") ? '' : l))
    else setLine(r.phase === 'play' ? "they're mid-match, you'll join the next one" : Object.keys(r.seats).length >= r.settings.seats ? 'this room is full' : '')
  }

  // The host's word on the room goes to everyone.
  function publish(r: Room) {
    applyRoom(r)
    net.current?.room(r)
  }

  // Everyone here keeps their colour; newcomers take the first free one while seats last.
  function seat(r: Room, ids: string[]): Room {
    const seats: Record<string, number> = {}
    for (const id of [selfId, ...ids]) if (id in r.seats) seats[id] = r.seats[id]
    for (const id of [selfId, ...ids])
      if (!(id in seats) && Object.keys(seats).length < r.settings.seats) seats[id] = COLOURS.findIndex((_, i) => !Object.values(seats).includes(i))
    return { ...r, seats }
  }

  function peersChanged(ids: string[], h: string) {
    const r = roomRef.current
    for (const id of peersRef.current) if (!ids.includes(id) && r && id in r.seats) say(`${COLOURS[r.seats[id]][0]} drifted away`)
    if (ids.length) setLine(l => (l === 'still looking for them' ? '' : l))
    peersRef.current = ids
    setPeers(ids)
    setHost(h === selfId)
    if (h === selfId && r) publish(r.phase === 'lobby' ? seat(r, ids) : r)
    net.current?.me(snapshot()) // newcomers need to see us too
  }

  function lobbyEnter() {
    const r = roomRef.current
    if (cur.length === COLS) {
      if (!VALID.has(cur)) return refuse('Not in word list')
      if (cur !== code) goTo(cur, true)
      else setCur('')
    } else if (!cur && host && r && seated >= 2) publish({ ...seat(r, peersRef.current), phase: 'play', round: r.round + 1, seed: Math.floor(Math.random() * 2 ** 32) })
  }

  // The host said go: a four-beat count-in on the Cmaj7, then everyone's first word.
  function begin(r: Room) {
    const m = (mp.current = { ...freshMatch(), live: true, round: r.round, S: r.settings, seats: r.seats, order: order(r.seed, ANSWERS.length) })
    restart()
    setLive(true)
    setPhase('busy')
    setTotal(0)
    setLine('')
    const t = snd.current.grid(BEAT)
    snd.current.count(t)
    for (let i = 0; i < 4; i++) snd.current.at(t + i * BEAT, () => fx.current.poke(0.03 + i * 0.01, 0.4))
    snd.current.at(t + 4 * BEAT, () => {
      if (mp.current !== m) return // left, or a new match began
      m.start = performance.now()
      setClock({ start: Date.now(), end: 0, now: Date.now() })
      nextWord()
    })
  }

  function nextWord() {
    const m = mp.current
    m.sealed = 0
    setSealed(0)
    restart(ANSWERS[m.order[m.n % m.order.length]], true)
  }

  function advance(won: boolean) {
    const m = mp.current
    if (!m.live) return
    void won
    m.n++
    nextWord()
  }

  function backToLobby() {
    mp.current = freshMatch()
    setLive(false)
    restart()
    if (code) setRows([{ word: code, marks: Array(COLS).fill('correct') }])
  }

  // Everyone's panel, as they see it: marks only, never letters.
  const snapshot = (): Me => {
    const m = mp.current
    return {
      round: m.round, n: m.n, typed: m.live && phase === 'play' ? cur.length : 0, sealed: m.live ? m.sealed : 0, pending: m.pending,
      rows: m.live ? rows.map((row, i) => (i === rows.length - 1 ? row.marks.slice(0, shown) : row.marks).map(x => x[0]).join('')) : [],
      score: Math.round(m.score), energy: Math.round(energy * 100) / 100, out: m.out, done: m.done, stars: m.stars.map(Math.round),
    }
  }
  const sendMe = useEffectEvent(() => net.current?.me(snapshot()))
  useEffect(() => sendMe(), [rows, shown, cur.length, phase, sealed, energy, live, total])

  // Someone's panel changed. Their new greens sound faintly from their side of the screen.
  function gotMe(m: Me, id: string) {
    const prev = snapsRef.current[id], pan = side(id), el = panelEls.current[id]
    snapsRef.current = { ...snapsRef.current, [id]: m }
    setSnaps(snapsRef.current)
    if (!prev || prev.round !== m.round || prev.n !== m.n) return
    const r = m.rows.length - 1, was = prev.rows[r] ?? ''
    for (let c = was.length; c < (m.rows[r]?.length ?? 0); c++) if (m.rows[r][c] === 'c') snd.current.far(c, pan)
    if (!prev.out && m.out) {
      snd.current.fall(pan)
      if (el) fx.current.ember(center(el), hueOf(id))
      say(`${COLOURS[roomRef.current?.seats[id] ?? 0][0]}'s light rests`)
    }
  }

  const share = () => navigator.clipboard?.writeText(location.href).then(() => flash('link copied'), () => {})

  const onRoom = useEffectEvent((r: Room) => applyRoom(r))
  const onPeers = useEffectEvent(peersChanged)
  const onStale = useEffectEvent(() => setLine('refresh to play together'))
  const onMe = useEffectEvent(gotMe)
  useEffect(() => {
    if (!code) return
    const c = (net.current = connect(code, { room: r => onRoom(r), me: (m, id) => onMe(m, id), lock: () => {}, peers: (ids, h) => onPeers(ids, h), stale: () => onStale() }))
    return () => {
      c.leave()
      net.current = null
    }
  }, [code])

  // A #word link goes straight into that room.
  const follow = useEffectEvent(() => {
    const w = location.hash.slice(1).toLowerCase()
    if (w && w !== code && VALID.has(w)) goTo(w, true)
    else if (!w && code) leave()
  })
  useEffect(() => {
    const h = () => follow(), id = setTimeout(h) // after the light and sound exist
    addEventListener('hashchange', h)
    return () => {
      clearTimeout(id)
      removeEventListener('hashchange', h)
    }
  }, [])

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

  const panels = (ids: string[], where: string) => (
    <div className={`peers ${where}`}>
      {ids.map(id => (
        <Panel key={id} seat={room!.seats[id]} snap={snaps[id]?.round === mp.current.round ? snaps[id] : undefined} rows={limit} el={e => { panelEls.current[id] = e }} />
      ))}
    </div>
  )

  return (
    <main className={`app ${woke ? 'awake' : ''} ${code ? 'together' : ''}`} style={{ '--e': energy, '--bar': `${BAR}s`, '--rows': limit } as CSSProperties}>
      <div className="stage">
      {code && room && panels(others.filter((_, i) => i % 2 === 0), 'left')}
      <aside className="hud left">
        {lobby && room ? <Setup side="left" s={room.settings} set={host ? s => publish(seat({ ...room, settings: s }, peers)) : undefined} /> : <>
        <p><small>Guess</small><b>{rows.length}<i>/{limit}</i></b></p>
        <p><small>Streak</small><b>{streak ? `×${streak}` : '–'}</b></p>
        <p><small>Light</small><Meter value={energy} /></p>
        </>}
      </aside>
      <div className="board" ref={board} role="grid" aria-label="Guesses">
        {Array.from({ length: limit }, (_, r) => {
          const row = rows[r], word = row ? row.word : r === rows.length ? cur : ''
          return (
            <div key={r} role="row" ref={el => { rowEls.current[r] = el! }} className={`row ${result === 'won' && r !== rows.length - 1 ? 'dim' : ''} ${flare && r === rows.length - 1 ? 'flare' : ''} ${r >= limit - sealed ? 'sealed' : ''}`}>
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
        {lobby && room ? <Setup side="right" s={room.settings} set={host ? s => publish(seat({ ...room, settings: s }, peers)) : undefined} /> : <>
        <p><small>Time</small><b>{clockText(clock.start ? Math.max(0, Math.floor(((clock.end || clock.now) - clock.start) / 1000)) : 0)}</b></p>
        <p><small>Score</small><b><Tally value={scored} /></b></p>
        <p><small>Total</small><b><Tally value={total} /></b></p>
        </>}
      </aside>
      {code && room && panels(others.filter((_, i) => i % 2 === 1), 'right')}
      </div>

      <div className="ghost" aria-hidden="true">
        {result === 'lost' &&
          [...answer].map((ch, i) => (
            <div key={i} ref={el => { ghostEls.current[i] = el! }} className={`tile mini ${i < ghost ? 'on' : ''}`}>
              {i < ghost && <span>{ch}</span>}
            </div>
          ))}
      </div>

      {code && (
        <p className="line">
          {line || (lobby && <button onMouseDown={e => e.preventDefault()} onClick={share}>share the word</button>)}
          {lobby && room && selfId in room.seats && !line && (
            <span style={{ '--h': COLOURS[room.seats[selfId]][1] } as CSSProperties}> · you're {COLOURS[room.seats[selfId]][0]}</span>
          )}
        </p>
      )}

      <div className="keys">
        {KEYS.map((line, i) => (
          <div className="krow" key={i}>
            {[...line].map(ch => {
              const k = ch === '⏎' ? 'enter' : ch === '⌫' ? 'back' : ch
              return (
                <button
                  key={k}
                  aria-label={k === 'enter' ? 'Enter' : k === 'back' ? 'Delete' : k}
                  className={`key ${keys[k] || ''} ${k.length > 1 ? 'wide' : ''} ${k === 'enter' && (lobby ? host && seated >= 2 && !cur : phase === 'over') ? 'beckon' : ''}`}
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

      {document.fullscreenEnabled && (
        <button
          className="corner full"
          aria-label={full ? 'Exit fullscreen' : 'Fullscreen'}
          onMouseDown={e => e.preventDefault()} // keep focus off it, so Enter still submits guesses
          onClick={() => (full ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d={full ? 'M6 1v5H1M10 1v5h5M6 15v-5H1M10 15v-5h5' : 'M1 6V1h5M15 6V1h-5M1 10v5h5M15 10v5h-5'} />
          </svg>
        </button>
      )}
      <button
        className="corner together"
        aria-label={code ? 'Play alone' : 'Play together'}
        onMouseDown={e => e.preventDefault()}
        onClick={() => (code ? leave() : goTo(pick()))}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="1.5" y="5.5" width="9" height="9" rx="1.5" />
          <path d="M5.5 5.5v-2a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        </svg>
      </button>
      <a className="corner repo" href="https://github.com/Joystickplays/WordlEffect" target="_blank" rel="noopener noreferrer" aria-label="Source code on GitHub">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
        </svg>
      </a>
      <div className="sr" aria-live="polite">{said}</div>
      <canvas className="fx" ref={canvas} aria-hidden="true" />
    </main>
  )
}

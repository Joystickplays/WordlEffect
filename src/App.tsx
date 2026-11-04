import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from 'react'
import { WORDS, anyWord, type Lang } from './words.ts'
import { score, chains, balance, energyOf, tensionOf, best, points, winBonus, order, locksFor, trade, land, target, strictBreak, trialBonus, hash, squatLetter, compose, hardest, roll, type Mark, type Stats } from './game.ts'
import { FX } from './fx.ts'
import { Sound, BEAT, EIGHTH, BAR } from './audio.ts'
import { connect, selfId, COLOURS, DEFAULTS, has, type Net, type Room, type Settings, type Me, type Lock, type Ev, type Swap, type Board } from './net.ts'
import { Setup, Panel, Which, Icon } from './Room.tsx'
import { SKILLS, CODES, type Skill } from './skills.ts'
import { Echo } from './echoes.ts'

const ROWS = 6
const COLS = 5
const KEYS = ['qwertyuiop', 'asdfghjkl', '⏎zxcvbnm⌫']
const NAMES = { correct: 'right', present: 'elsewhere', absent: 'not in word' }
const SHAKE = [0, -7, 6, -4, 3, -1, 0].map(x => ({ transform: `translateX(${x}px)` }))
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const pick = (lang: Lang) => WORDS[lang].answers[Math.floor(Math.random() * WORDS[lang].answers.length)]
const NASTY = { en: hardest(WORDS.en.answers, 0.08), id: hardest(WORDS.id.answers, 0.08) }
// The reveal's own light: shards flung out from the reel when it lands, each with its own angle, reach and delay.
const SHARDS = Array.from({ length: 64 }, (_, i) => ({
  '--a': `${(i / 64) * 360 + Math.random() * 12}deg`, '--d': `${120 + Math.random() * 260}px`, '--s': `${2 + Math.random() * 3}px`, '--t': `${Math.random() * 0.25}s`,
}))
// Echoes are twins: echo0 belongs to the first player by seat, and so on. They wear their twin's colour.
const twinIn = (r: Room | null, id: string) => (r ? Object.keys(r.seats).sort((a, b) => r.seats[a] - r.seats[b])[+id.slice(4)] : undefined)
const seatIn = (r: Room | null, id: string) => (r ? (r.seats[id] ?? r.seats[twinIn(r, id) ?? ''] ?? 0) : 0)
const nameIn = (r: Room | null, id: string) => COLOURS[seatIn(r, id)][0] + (id.startsWith('echo') ? "'s echo" : '')

// Which team a player is on: -1 when it's everyone for themselves.
function teamIn(r: Room | null, id: string) {
  if (!r || r.settings.versus === 'all') return -1
  if (r.settings.versus === 'echoes') return id.startsWith('echo') ? 1 : 0
  return r.sides[id] ?? 0
}
const saved = (): Lang => (localStorage.getItem('lang') === 'id' ? 'id' : 'en')
const fresh = (): Stats => ({ greens: new Set(), found: new Set(), guesses: 0, streak: 0 })
// One match, kept in a ref: scheduled reveals read it long after the render that started them.
const freshMatch = () => ({
  live: false, round: 0, S: DEFAULTS, seats: {} as Record<string, number>, order: [] as number[], n: 0, start: 0,
  score: 0, pending: 0, sealed: 0, locked: 0, carry: 0, out: false, done: false, ended: false, stars: [] as number[], claim: 0,
  said: [] as number[], jinxed: [] as string[], // this word's guess fingerprints, and jinxes already settled
  from: [] as string[], // who sent the locks waiting for us, oldest first
  rig: null as { word: string; by: string } | null, // Rigged: the next word someone picked for us
  bag: [] as Skill[], dusk: 0, wind: false, decoy: 0, mirror: false, // Skills: what we hold, and what's switched on
  swap: '', // Swap: who we've asked, while we wait for their board
  echoes: [] as string[], echoHost: '', // Echoes: their ids, and who runs them
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
  const [solo, setSolo] = useState(saved) // the language you play alone in
  const [answer, setAnswer] = useState(() => pick(saved()))
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
  const [pending, setPending] = useState(0) // locks waiting to land on the next guess
  // playing together
  const [code, setCode] = useState<string | null>(null) // the room's word
  const [room, setRoom] = useState<Room | null>(null)
  const [peers, setPeers] = useState<string[]>([])
  const [host, setHost] = useState(true)
  const [line, setLine] = useState('') // the one quiet line of text under the board
  const [live, setLive] = useState(false) // a match is being played
  const [snaps, setSnaps] = useState<Record<string, Me>>({}) // everyone else's panel
  const [faded, setFaded] = useState(0) // Fading trial: rows that have drained back to clear glass
  const [squat, setSquat] = useState<Record<number, { ch: string; by: string }>>({}) // Squatter: letters stuck in the next row
  const [bag, setBag] = useState<Skill[]>([]) // Skills: up to three, slot by slot
  const [gamble, setGamble] = useState<{ s: Skill; strip: Skill[]; landed: boolean } | null>(null) // the full-screen reel
  const [hint, setHint] = useState<{ pos: number; ch: string } | null>(null) // Lantern: a letter lit in its box
  const [aim, setAim] = useState(-1) // Swap: the slot waiting for you to pick a board
  const [guard, setGuard] = useState('') // skills switched on: m(irror), d(ecoy), w(ind)
  const [rig, setRig] = useState<{ to: string; words: string[]; until: number } | null>(null) // Rigged: our pick of their next word
  const [late, setLate] = useState(false) // Undertow trial: the clock on this guess is nearly out
  const [run, setRun] = useState({ n: 0, out: false, done: false, stars: 0 }) // the match ref, as render needs it
  const [ended, setEnded] = useState<{ line: string; rank: { id: string; score: number }[] } | null>(null)

  const canvas = useRef<HTMLCanvasElement>(null!), board = useRef<HTMLDivElement>(null!)
  const rowEls = useRef<HTMLDivElement[]>([]), tileEls = useRef<HTMLDivElement[]>([]), ghostEls = useRef<HTMLDivElement[]>([])
  const fx = useRef<FX>(null!), snd = useRef<Sound>(null!), stats = useRef(fresh())
  const net = useRef<Net | null>(null), roomRef = useRef<Room | null>(null), peersRef = useRef<string[]>([]), hostRef = useRef('')
  const bots = useRef<Record<string, Echo>>({}) // echoes, when we're the host running them
  const mp = useRef(freshMatch()), snapsRef = useRef<Record<string, Me>>({}), panelEls = useRef<Record<string, HTMLElement | null>>({})
  const limit = room ? room.settings.rows : ROWS
  const lang = room ? room.settings.lang : solo
  const lobby = !!code && !live
  const seated = room ? Object.keys(room.seats).filter(id => id === selfId || peers.includes(id)).length : 0
  const teams = !!room && room.settings.versus !== 'all'
  const teamOf = (id: string) => teamIn(room, id)
  // your team first, then the other; within a team, by seat
  const humans = room ? Object.keys(room.seats).filter(id => id !== selfId && peers.includes(id)).sort((a, b) => (teams ? Math.abs(teamOf(a) - teamOf(selfId)) - Math.abs(teamOf(b) - teamOf(selfId)) : 0) || room.seats[a] - room.seats[b]) : []
  const echoes = live && room ? [...room.echoes].sort((a, b) => [selfId, ...humans].indexOf(twinIn(room, a) ?? '') - [selfId, ...humans].indexOf(twinIn(room, b) ?? '')) : [] // each under its twin
  const others = [...humans, ...echoes]
  const boards = 1 + others.length, mates = teams ? 1 + others.filter(id => teamOf(id) === teamOf(selfId)).length : 0
  const cols = teams ? Math.max(mates, boards - mates, 1) : boards <= 4 ? boards : Math.ceil(boards / 2)
  const side = (id: string) => (cols > 1 ? -0.6 + (1.2 * ((others.indexOf(id) + 1) % cols)) / (cols - 1) : 0) // pan by which column their board is in
  const here = room ? Object.keys(room.seats).filter(id => id === selfId || peers.includes(id)) : []
  // who can start: two or more, one on each side for teams, and one is enough against the echoes
  const ready = !room ? false : room.settings.versus === 'echoes' ? seated >= 1 : room.settings.versus === 'teams' ? [0, 1].every(t => here.some(id => teamOf(id) === t)) : seated >= 2
  const trial = (t: Parameters<typeof has>[1]) => live && !!room && has(room.settings, t)
  // team totals, for the HUD: your own score plus everyone else's latest
  const score2 = [0, 1].map(t => (teams ? (teamOf(selfId) === t ? total : 0) + others.filter(id => teamOf(id) === t).reduce((s, id) => s + (snaps[id]?.round === room?.round ? snaps[id].score : 0), 0) : 0))
  const TEAM_NAMES = room?.settings.versus === 'echoes' ? ['team', 'echoes'] : ['dawn', 'dusk']
  const hueOf = (id: string) => COLOURS[seatIn(room, id)][1]
  const nameOf = (id: string) => nameIn(room, id)

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
  useEffect(() => place(), [limit, code, others.length, live, cols])

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

  // Tide: when the time is up, you stop; the match ends once everyone has.
  const tideCheck = useEffectEvent(() => {
    const m = mp.current
    for (const e of Object.values(bots.current)) e.tick()
    if (!m.live || m.S.mode !== 'tide' || m.done || m.ended || !m.start || performance.now() - m.start < m.S.tide * 60000) return
    m.done = true
    bump()
    setCur('')
    if (phase === 'play') setPhase('over')
    net.current?.me(snapshot())
    checkEnd()
  })
  useEffect(() => {
    if (!clock.start || clock.end) return
    const id = setInterval(() => {
      setClock(c => ({ ...c, now: Date.now() }))
      tideCheck()
    }, 250)
    return () => clearInterval(id)
  }, [clock.start, clock.end])

  const earn = (n: number) => {
    const m = mp.current
    if (m.live) n = Math.round(n * trialBonus([...m.S.trials.toString(2)].filter(b => b === '1').length)) // harder rooms score higher
    if (m.live) m.score += n
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
    if (gamble) return (k === 'enter' || k === ' ' || k === 'escape') && closeGamble()
    if (/^[123]$/.test(k)) return rig ? rigWith(rig.words[+k - 1]) : cast(+k - 1)
    if (phase === 'over') {
      if (k === 'enter' && !code) restart()
      else if (k === 'enter' && ended && host && roomRef.current) publish(seat({ ...roomRef.current, phase: 'lobby' }, peersRef.current))
      return
    }
    if (phase !== 'play') return
    // oxlint-disable-next-line react/purity -- onKey only ever runs from input events, never during render
    if (!clock.start && !code) setClock({ start: Date.now(), end: 0, now: Date.now() })
    const r = rows.length, open = [0, 1, 2, 3, 4].filter(i => !(i in squat)) // squatted boxes are skipped
    if (k === 'enter') return lobby ? lobbyEnter() : submit()
    if (k === 'back') {
      if (!cur) return
      snd.current.erase(cur[cur.length - 1])
      fx.current.erase(tile(r, open[cur.length - 1]))
      setCur(cur.slice(0, -1))
    } else if (/^[a-z]$/.test(k) && cur.length < open.length) {
      snd.current.type(k)
      fx.current.type(tile(r, open[cur.length]))
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
    const word = compose(cur, Object.fromEntries(Object.entries(squat).map(([i, q]) => [i, q.ch])))
    if (word.length < COLS || !WORDS[mp.current.live ? mp.current.S.lang : lang].valid.has(word)) return refuse(word.length < COLS ? 'Not enough letters' : 'Not in word list')
    if (trial('strict') && strictBreak(word, rows)) {
      refuse('Keep the letters you found')
      return flash('keep the light you found')
    }
    setLate(false)
    setSquat({})
    const r = rows.length, marks = score(word, answer), s = stats.current, m = mp.current
    if (m.live) {
      const h = hash(`${m.round}:${m.n}:${word}`)
      m.said = [...m.said, h]
      for (const id of peersRef.current) if (snapsRef.current[id]?.round === m.round && snapsRef.current[id].said.includes(h)) jinx(id, h, r + 1)
    }
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
    const s = stats.current, won = marks.every(m => m === 'correct'), m = mp.current, extended = isNew.some(Boolean)
    s.streak = extended ? s.streak + 1 : 0
    for (let i = 0; i < COLS - 1; i++) if (chain[i + 1] > 0) fx.current.beam(tile(r, i), tile(r, i + 1))
    fx.current.setStreak(s.streak)
    snd.current.setStreak(s.streak)
    setStreak(s.streak)
    say(`${word}: ${marks.map((m, i) => `${word[i]} ${NAMES[m]}`).join(', ')}`)
    const rowsAll = m.live ? m.S.rows : ROWS
    // Second wind: a wrong guess blows away instead of using up its row (its colours stay on the keyboard)
    const blown = m.live && !won && m.wind, used = blown ? r : r + 1
    if (blown) {
      m.wind = false
      setGuard(guards())
      fx.current.wind(Array.from({ length: COLS }, (_, c) => tile(r, c)))
      snd.current.wind()
      setRows(rs => rs.slice(0, -1))
      s.guesses--
    }
    if (m.live) {
      // a long streak or a quick solve sends locks; they melt your own pending ones first
      const t = trade(Math.min(6, locksFor(s.streak, extended, won, r + 1) * m.S.locks), m.pending)
      m.pending = t.pending
      if (t.sent) fire(t.sent)
      if (!won && has(m.S, 'squatter')) squatters(used, marks, word)
      else if (!won) {
        const l = land(m.pending, rowsAll - m.sealed - used, has(m.S, 'frost'))
        m.pending = l.pending
        m.from = m.from.slice(-m.pending)
        if (l.now) seal(l.now, true)
      }
      setPending(m.pending)
    }
    if (!won) {
      snd.current.combo(snd.current.grid(EIGHTH), Math.max(...chain) + 1, s.streak)
      snd.current.setTension(tensionOf(s.greens.size, rowsAll - m.sealed - used))
      charge(energyOf(s))
    }
    if (won) finish('won', r)
    else if (used >= rowsAll - m.sealed) finish('lost', r)
    else setPhase(m.ended ? 'over' : 'play')
    if (m.live && has(m.S, 'fading')) {
      const word = `${m.round}:${m.n}`
      snd.current.at(snd.current.now() + 2 * BAR, () => `${mp.current.round}:${mp.current.n}` === word && setFaded(f => Math.max(f, r + 1)))
    }
  }

  function finish(res: 'won' | 'lost', r: number) {
    const m = mp.current
    setResult(res)
    if (!m.live) setClock(c => ({ ...c, end: Date.now() }))
    if (m.live && res === 'won' && m.S.mode === 'stars') m.stars = [...m.stars, performance.now() - m.start]
    if (m.live && res === 'won' && m.S.skills && m.bag.length < 3) spinReel()
    // heavy frost carries this word's locked rows into the next one; a solve in 3 or fewer thaws one
    m.carry = has(m.S, 'frost') ? Math.max(0, m.locked - (res === 'won' && r < 3 ? 1 : 0)) : 0
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
  function restart(word = pick(lang), keep = false) {
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
    setFaded(0)
    setLate(false)
    setSquat({})
    setHint(null)
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
    applyRoom({ settings: roomRef.current?.settings ?? { ...DEFAULTS, lang: solo }, phase: 'lobby', seed: 0, round: 0, seats: { [selfId]: 0 }, sides: { [selfId]: 0 }, echoes: [] })
    setRows([{ word, marks: Array(COLS).fill('correct') }]) // the room's word, lit, on the first row
    setLine('')
    if (joined) setTimeout(() => !peersRef.current.length && location.hash === `#${word}` && setLine('still looking for them'), 20000)
  }

  function leave() {
    sleep()
    mp.current = freshMatch()
    setLive(false)
    setEnded(null)
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
    for (const id in r.seats) if (id !== selfId && !(prev && id in prev.seats)) say(`${nameOf(id)} is here`)
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
      if (!(id in seats) && Object.keys(seats).length < (r.settings.versus === 'echoes' ? Math.min(4, r.settings.seats) : r.settings.seats)) seats[id] = COLOURS.findIndex((_, i) => !Object.values(seats).includes(i))
    // sides: everyone keeps theirs, newcomers even the teams out
    const sides: Record<string, number> = {}
    for (const id in seats) if (id in r.sides) sides[id] = r.sides[id]
    for (const id in seats) if (!(id in sides)) sides[id] = balance(sides)
    return { ...r, seats, sides }
  }

  function peersChanged(ids: string[], h: string) {
    const r = roomRef.current
    for (const id of peersRef.current) if (!ids.includes(id) && r && id in r.seats) say(`${nameOf(id)} drifted away`)
    if (ids.length) setLine(l => (l === 'still looking for them' ? '' : l))
    peersRef.current = ids
    setPeers(ids)
    setHost(h === selfId)
    hostRef.current = h
    // a match nobody is still playing in is over: open the lobby again
    const playing = r && Object.keys(r.seats).some(id => (id === selfId ? mp.current.live : ids.includes(id)))
    if (h === selfId && r) publish(r.phase === 'lobby' || !playing ? seat({ ...r, phase: 'lobby' }, ids) : r)
    net.current?.me(snapshot()) // newcomers need to see us too
    checkEnd()
  }

  // The host changes a setting: always on top of the latest room.
  function setUp(f: (s: Settings) => Partial<Settings>) {
    const r = roomRef.current
    if (r) publish(seat({ ...r, settings: { ...r.settings, ...f(r.settings) } }, peersRef.current))
  }

  // Switching sides: ask the host, who keeps the teams within one player of each other.
  function switchSide() {
    const r = roomRef.current
    if (!r) return
    const want = 1 - (r.sides[selfId] ?? 0), sides = { ...r.sides, [selfId]: want }
    if (Math.abs(Object.keys(sides).length - 2 * Object.values(sides).filter(x => x === 1).length) > 1) return flash('the teams would be uneven')
    if (host) gotSide({ k: 'side', to: selfId, side: want }, selfId)
    else net.current?.ev({ k: 'side', to: hostRef.current, side: want }, hostRef.current)
  }

  function gotSide(e: Extract<Ev, { k: 'side' }>, from: string) {
    const r = roomRef.current
    if (!host || !r || r.phase !== 'lobby' || !(from in r.seats)) return
    const sides = { ...r.sides, [from]: e.side }, dusk = Object.values(sides).filter(s => s === 1).length
    if (Math.abs(Object.keys(sides).length - 2 * dusk) > 1) return flash('the teams would be uneven')
    publish({ ...r, sides })
  }

  function lobbyEnter() {
    const r = roomRef.current
    if (cur.length === COLS) {
      if (!anyWord(cur)) return refuse('Not in word list')
      if (cur !== code) goTo(cur, true)
      else setCur('')
    } else if (!cur && host && r && ready) {
      const s = seat(r, peersRef.current)
      publish({ ...s, phase: 'play', round: r.round + 1, seed: Math.floor(Math.random() * 2 ** 32), echoes: r.settings.versus === 'echoes' ? Object.keys(s.seats).map((_, i) => `echo${i}`) : [] })
    }
  }

  // The host said go: a four-beat count-in on the Cmaj7, then everyone's first word.
  function begin(r: Room) {
    const m = (mp.current = { ...freshMatch(), live: true, round: r.round, S: r.settings, seats: r.seats, order: order(r.seed, WORDS[r.settings.lang].answers.length), echoes: r.echoes, echoHost: hostRef.current || selfId })
    restart()
    setLive(true)
    setRig(null)
    setBag([])
    setGuard('')
    setAim(-1)
    fx.current.shield(false)
    setEnded(null)
    setPending(0)
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
      if (m.echoHost === selfId) wake(m)
    })
  }

  function nextWord() {
    const m = mp.current
    m.said = []
    // dusk: in Last light, every 3 minutes every board loses a row for good, down to 3, so matches always end
    const dusk = m.S.mode === 'light' ? Math.min(m.S.rows - 3, Math.floor((performance.now() - m.start) / 180000)) : 0
    m.dusk = dusk
    m.locked = Math.min(m.carry, m.S.rows - 1 - dusk)
    m.sealed = dusk + m.locked
    setSealed(m.sealed)
    const rigged = m.rig
    m.rig = null
    restart(rigged?.word ?? WORDS[m.S.lang].answers[m.order[m.n % m.order.length]], true)
    bump()
    if (rigged) {
      flash(`${nameOf(rigged.by)} picked this word`)
      snd.current.rigged(side(rigged.by))
      fx.current.rigged(center(board.current), hueOf(rigged.by))
    }
  }

  function advance(won: boolean) {
    const m = mp.current
    if (!m.live) return
    if (m.S.mode === 'light' && !won) {
      m.out = true
      setLine('your light rests')
    }
    bump()
    if (m.out || m.done || m.ended || (m.S.mode === 'stars' && tm(selfId) < 0 && m.stars.length >= m.S.stars)) {
      setPhase('over')
      net.current?.me(snapshot())
      return checkEnd()
    }
    m.n++
    nextWord()
    offerRig()
  }

  // Rigged: after each of your words, if you're in last place, you choose the leader's next word from three nasty ones.
  function offerRig() {
    const m = mp.current, others = foes().filter(p => !p.id.startsWith('echo')), snaps = snapsRef.current
    if (!has(m.S, 'rigged') || !others.length) return
    const lead = target(others)!
    if (tm(selfId) >= 0) {
      // teams: the trailing team's lowest scorer picks for the leading team's top scorer
      const [ours, theirs] = [tm(selfId), 1 - tm(selfId)].map(t => players().filter(p => tm(p.id) === t))
      const sum = (ps: { score: number }[]) => ps.reduce((s, p) => s + p.score, 0)
      if (sum(ours) >= sum(theirs) || ours.some(p => p.id !== selfId && p.score < m.score) || snaps[lead.id]?.rigged) return
    } else if (lead.score <= m.score || others.some(p => p.score < m.score) || snaps[lead.id]?.rigged) return
    const pool = NASTY[m.S.lang], words = new Set<string>()
    while (words.size < 3) words.add(pool[Math.floor(Math.random() * pool.length)])
    setRig({ to: lead.id, words: [...words], until: Date.now() + 10000 })
  }

  function rigWith(word: string) {
    const r = rig
    if (!r) return
    setRig(null)
    net.current?.ev({ k: 'rig', to: r.to, word })
    const el = panelEls.current[r.to]
    if (el) fx.current.stream(center(board.current), center(el), 275, 2)
    snd.current.launch(side(r.to))
    flash(`you rigged ${nameOf(r.to)}'s next word`)
  }

  function gotRig(e: Extract<Ev, { k: 'rig' }>, from: string) {
    const m = mp.current
    if (e.to !== selfId || !m.live || !has(m.S, 'rigged') || m.rig || !WORDS[m.S.lang].answers.includes(e.word)) return
    m.rig = { word: e.word, by: from }
    flash(`${nameOf(from)} rigged your next word`)
    net.current?.me(snapshot())
  }

  // Everyone still here who was dealt into this match, with their latest panel.
  function players() {
    const m = mp.current, snaps = snapsRef.current
    return [...Object.keys(m.seats), ...m.echoes]
      .filter(present)
      .map(id => (id === selfId ? { id, ...snapshot() } : id.startsWith('echo') && !echoesAlive() ? { id, score: snaps[id]?.score ?? 0, out: true, done: true, stars: snaps[id]?.stars ?? [] } : { id, ...(snaps[id]?.round === m.round ? snaps[id] : { score: 0, out: false, done: false, stars: [] }) }))
  }

  function checkEnd() {
    const m = mp.current
    if (!m.live || m.ended) return
    const all = players()
    if (tm(selfId) >= 0) return checkTeams(all)
    if (m.S.mode === 'light') {
      const lit = all.filter(p => !p.out)
      if (lit.length <= 1) end(lit[0]?.id ?? [...all].sort((a, b) => b.score - a.score)[0].id)
    } else if (m.S.mode === 'tide' && all.every(p => p.done)) end([...all].sort((a, b) => b.score - a.score)[0].id)
    else if (m.S.mode === 'stars' && !m.claim && all.some(p => p.stars.length >= m.S.stars)) {
      // wait a moment for close finishes to arrive, then the earliest time wins; everyone does the same sum
      m.claim = window.setTimeout(() => {
        if (mp.current !== m || m.ended) return
        const k = m.S.stars - 1, done = players().filter(p => p.stars.length > k)
        end(done.sort((a, b) => a.stars[k] - b.stars[k] || (a.id < b.id ? -1 : 1))[0].id)
      }, 1000)
    }
  }

  // Teams: the mode decides how a team wins. Everyone does the same sum, so every screen names the same team.
  function checkTeams(all: ReturnType<typeof players>) {
    const m = mp.current, side = [0, 1].map(t => all.filter(p => tm(p.id) === t))
    const sum = side.map(ps => ps.reduce((s, p) => s + p.score, 0)), lead = sum[0] === sum[1] ? -1 : sum[0] > sum[1] ? 0 : 1
    if (m.S.mode === 'light') {
      const lit = [0, 1].filter(t => side[t].some(p => !p.out))
      if (lit.length <= 1) endTeam(lit[0] ?? lead)
    } else if (m.S.mode === 'tide') {
      if (all.every(p => p.done)) endTeam(lead)
    } else if (!m.claim) {
      const need = (t: number) => m.S.stars * side[t].length, got = (t: number) => side[t].flatMap(p => p.stars).sort((a, b) => a - b)
      if ([0, 1].some(t => side[t].length && got(t).length >= need(t)))
        m.claim = window.setTimeout(() => {
          if (mp.current !== m || m.ended) return
          const now = [0, 1].map(t => players().filter(p => tm(p.id) === t)), when = now.map(ps => (ps.length ? (ps.flatMap(p => p.stars).sort((a, b) => a - b)[m.S.stars * ps.length - 1] ?? Infinity) : Infinity))
          endTeam(when[0] === when[1] ? -1 : when[0] < when[1] ? 0 : 1)
        }, 1000)
    }
  }

  function endTeam(t: number) {
    const m = mp.current, mine = t >= 0 && t === tm(selfId), echoes = m.S.versus === 'echoes', names = echoes ? ['the team', 'the echoes'] : ['dawn', 'dusk']
    const line = t < 0 ? 'even light' : echoes ? (t === 0 ? 'you outshone the echoes' : 'the echoes shone brighter') : `${names[t]} outshone ${names[1 - t]}`
    const rank = players().sort((a, b) => (tm(a.id) === t ? 0 : 1) - (tm(b.id) === t ? 0 : 1) || b.score - a.score)
    wrapUp(line, rank, mine, t < 0 ? 'The match is a tie' : `${names[t]} won the match`)
  }

  function end(winner: string) {
    const m = mp.current, name = nameOf(winner), mine = winner === selfId
    m.ended = true
    const rank = players().sort((a, b) => (a.id === winner ? -1 : b.id === winner ? 1 : b.score - a.score))
    const words = { light: mine ? 'last light' : `${name} shone longest`, tide: 'the tide is out', stars: mine ? (m.S.stars === 3 ? 'three stars' : 'five stars') : `${name} reached them first` }
    wrapUp(words[m.S.mode], rank, mine, mine ? 'You won the match' : `${name} won the match`)
  }

  function wrapUp(line: string, rank: { id: string; score: number }[], mine: boolean, words: string) {
    mp.current.ended = true
    sleep()
    setEnded({ line, rank })
    setCur('')
    setPhase('over')
    setClock(c => ({ ...c, end: Date.now() }))
    say(words)
    if (mine) {
      snd.current.win(snd.current.grid(BEAT), answer)
      fx.current.supernova(1.2)
    }
  }

  function backToLobby() {
    sleep()
    mp.current = freshMatch()
    setLive(false)
    setEnded(null)
    setLine('')
    restart()
    if (code) setRows([{ word: code, marks: Array(COLS).fill('correct') }])
  }

  // Freeze the next free rows from the bottom up.
  function seal(n: number, fromLocks: boolean) {
    const m = mp.current, rowsAll = m.S.rows
    for (let i = 0; i < n; i++) {
      const r = rowsAll - m.sealed - 1
      fx.current.frost(Array.from({ length: COLS }, (_, c) => tile(r, c)))
      m.sealed++
      if (fromLocks) m.locked++
    }
    setSealed(m.sealed)
    snd.current.seal()
  }

  // ——— skills ———

  const guards = () => { const m = mp.current; return (m.mirror ? 'm' : '') + (m.decoy ? 'd' : '') + (m.wind ? 'w' : '') }

  // Solving spins the reel in the next free slot; it lands after a moment, rarer skills less often.
  function spinReel() {
    const m = mp.current, s = roll(Object.fromEntries(CODES.map(k => [k, SKILLS[k].weight])) as Record<Skill, number>)
    m.bag = [...m.bag, s]
    setBag(m.bag)
    // the strip: three shuffled laps of every skill, landing on the one you won
    const lap = () => [...CODES].sort(() => Math.random() - 0.5)
    setGamble({ s, strip: [...lap(), ...lap(), ...lap(), s], landed: false })
    snd.current.spin(SKILLS[s].rarity)
    setTimeout(() => {
      setGamble(g => g && { ...g, landed: true })
      say(`New skill: ${SKILLS[s].name}. ${SKILLS[s].about} Press Enter to continue.`)
    }, 1300)
  }

  // Click (or Enter) once it's landed: the skill flies down into its slot.
  function closeGamble() {
    if (!gamble?.landed) return
    const i = mp.current.bag.lastIndexOf(gamble.s)
    setGamble(null)
    requestAnimationFrame(() => {
      const el = document.querySelectorAll('.bag.mine button')[i]
      if (el) fx.current.spin(center(el), SKILLS[gamble.s].rarity)
    })
  }

  function cast(i: number, at?: string) {
    const m = mp.current, s = m.bag[i]
    if (!s || !m.live || m.out || m.done || m.ended || gamble) return
    if (s === 's') return swapWith(i, at)
    const ok = skill(s)
    if (!ok) return snd.current.invalid()
    m.bag = m.bag.filter((_, j) => j !== i)
    setBag(m.bag)
    setGuard(guards())
  }

  // Each skill does its thing and returns whether it could.
  function skill(s: Skill) {
    const m = mp.current, st = stats.current
    if (s === 't') {
      if (m.sealed === m.dusk && !m.pending && !Object.keys(squat).length) return false
      const thawed = Array.from({ length: m.sealed - m.dusk }, (_, k) => m.S.rows - m.sealed + k)
      fx.current.thaw(thawed.flatMap(r => Array.from({ length: COLS }, (_, c) => tile(r, c))), center(board.current))
      Object.assign(m, { sealed: m.dusk, locked: 0, carry: 0, pending: 0, from: [] })
      setSealed(m.sealed)
      setPending(0)
      setSquat({})
      snd.current.thaw()
      flash('thawed')
      return true
    }
    if (s === 'l') {
      const open = [0, 1, 2, 3, 4].filter(i => !st.greens.has(i) && hint?.pos !== i)
      if (!open.length || phase === 'over') return false
      const pos = open[Math.floor(Math.random() * open.length)]
      setHint({ pos, ch: answer[pos] })
      fx.current.lantern(center(board.current), tile(Math.min(rows.length, m.S.rows - 1), pos))
      snd.current.lantern()
      return true
    }
    if (s === 'd') {
      if (m.decoy) return false
      m.decoy = 2
      fx.current.decoy(center(board.current), hueOf(selfId))
      snd.current.decoy()
      flash('a decoy is up')
      return true
    }
    if (s === 'm') {
      if (m.mirror) return false
      m.mirror = true
      fx.current.shield(true)
      snd.current.shield()
      flash('your mirror shield is up')
      return true
    }
    if (s === 'w') {
      if (m.wind) return false
      m.wind = true
      fx.current.gust(center(board.current))
      snd.current.wind()
      flash('second wind is ready')
      return true
    }
    return false
  }

  // Swap: the first press aims (click a board), a second press swaps with the leader.
  function swapWith(i: number, at?: string) {
    const m = mp.current, free = m.S.rows - m.sealed - rows.length
    if (!at && aim !== i) {
      setAim(i)
      return flash('click a board to swap with, or press again for the leader')
    }
    setAim(-1)
    const to = at ?? target(foes().filter(p => !p.id.startsWith('echo')))?.id
    if (!to || phase !== 'play' || free <= 1 || m.swap) return snd.current.invalid()
    m.swap = to
    setPhase('busy')
    net.current?.ev({ k: 'swap', to, reply: false, ok: false, bounced: false, board: mine() }, to)
    setTimeout(() => m.swap === to && endSwap(i, "they didn't answer"), 3000)
  }

  const mine = (): Board => {
    const m = mp.current
    return { answer, rows: rows.map(r => r.word), sealed: m.sealed - m.dusk }
  }

  function endSwap(i: number, why: string, used = false) {
    const m = mp.current
    m.swap = ''
    setPhase('play')
    flash(why)
    if (used) {
      m.bag = m.bag.filter((_, j) => j !== i)
      setBag(m.bag)
    }
  }

  function gotSwap(e: Swap, from: string) {
    const m = mp.current, name = nameOf(from)
    if (e.to !== selfId || !m.live) return
    if (e.reply) {
      if (m.swap !== from) return
      const i = m.bag.indexOf('s')
      if (e.ok && e.board) {
        endSwap(i, `you swapped boards with ${name}`, true)
        take(e.board, from)
      } else endSwap(i, e.bounced ? `it bounced off ${name}'s mirror` : `${name} is busy, try again`, e.bounced)
      return
    }
    const free = m.S.rows - m.sealed - rows.length, el = panelEls.current[from]
    const reply = (ok: boolean, bounced: boolean, board: Board | null) => net.current?.ev({ k: 'swap', to: from, reply: true, ok, bounced, board }, from)
    if (m.mirror) {
      m.mirror = false
      setGuard(guards())
      fx.current.shield(false)
      if (el) fx.current.bounce(center(board.current), center(el), hueOf(from))
      snd.current.bounce()
      flash(`${name}'s swap bounced off your mirror`)
      return reply(false, true, null)
    }
    if (phase !== 'play' || m.out || m.done || m.ended || free <= 1 || !e.board) return reply(false, false, null)
    reply(true, false, mine())
    take(e.board, from)
    flash(`${name} swapped boards with you`)
  }

  // Take over someone's board: their word, rows, colours and frozen rows. Marks are worked out here, not trusted.
  function take(b: Board, from: string) {
    const m = mp.current, words = WORDS[m.S.lang]
    if (!words.valid.has(b.answer) || !b.rows.every(w => words.valid.has(w))) return
    const next = b.rows.map(word => ({ word, marks: score(word, b.answer) })), st = stats.current, keys: Record<string, Mark> = {}
    st.greens = new Set()
    st.found = new Set()
    st.guesses = next.length
    for (const row of next)
      row.marks.forEach((x, i) => {
        if (x === 'correct') st.greens.add(i)
        if (x !== 'absent') st.found.add(row.word[i])
        keys[row.word[i]] = best(keys[row.word[i]], x)
      })
    m.locked = Math.min(b.sealed, m.S.rows - 1 - m.dusk - next.length)
    m.sealed = m.dusk + m.locked
    setSealed(m.sealed)
    setAnswer(b.answer)
    setRows(next)
    setKeys(keys)
    setCur('')
    setShown(COLS)
    setSquat({})
    setHint(null)
    setFaded(0)
    charge(energyOf(st))
    snd.current.setTension(tensionOf(st.greens.size, m.S.rows - m.sealed - next.length))
    const el = panelEls.current[from]
    if (el) fx.current.swap(center(board.current), center(el), hueOf(selfId), hueOf(from))
    snd.current.swap()
  }

  // In teams, only the other team can be aimed at.
  const tm = (id: string) => teamIn(roomRef.current, id)
  const foes = (exclude = selfId) => lit(exclude).filter(p => tm(p.id) < 0 || tm(p.id) !== tm(selfId))
  const teammates = () => lit().filter(p => tm(p.id) >= 0 && tm(p.id) === tm(selfId))

  function bump() {
    const m = mp.current
    setRun({ n: m.n, out: m.out, done: m.done, stars: m.stars.length })
  }

  // ——— echoes (the host runs them) ———

  function wake(m: ReturnType<typeof freshMatch>) {
    const bonus = trialBonus([...m.S.trials.toString(2)].filter(b => b === '1').length)
    for (const id of m.echoes) {
      const e = new Echo(id, m.round, m.S, WORDS[m.S.lang].answers, m.order, m.start, bonus, {
        changed: e => {
          net.current?.me(e.snapshot())
        },
        lock: (e, n) => {
          const to = target(players().filter(p => !p.id.startsWith('echo') && !p.out && !p.done))?.id // at the leading player
          if (!to) return
          net.current?.lock({ to, n, by: e.id })
        },
        over: () => checkEnd(),
      })
      bots.current[id] = e
      e.run()
    }
  }

  function sleep() {
    for (const e of Object.values(bots.current)) e.stop()
    bots.current = {}
  }

  // Echoes keep playing only while the host who runs them is still here.
  function echoesAlive() {
    return mp.current.echoHost === selfId || peersRef.current.includes(mp.current.echoHost)
  }
  function present(id: string) {
    return id === selfId || peersRef.current.includes(id) || mp.current.echoes.includes(id)
  }

  // Everyone else still playing this match, with their scores.
  function lit(exclude = selfId) {
    const m = mp.current, snaps = snapsRef.current
    return [...Object.keys(m.seats), ...(echoesAlive() ? m.echoes : [])]
      .filter(id => id !== exclude && present(id) && snaps[id]?.round === m.round && !snaps[id].out && !snaps[id].done)
      .map(id => ({ id, score: snaps[id].score }))
  }

  // Squatter: waiting locks drop letters into the next row (two at most) instead of freezing rows. The rest wait.
  function squatters(r: number, marks: Mark[], word: string) {
    const m = mp.current
    if (r >= m.S.rows - m.sealed || !m.pending) return
    const greens: Record<number, string> = {}, ambers: string[] = [], next: Record<number, { ch: string; by: string }> = {}
    rows.forEach(row => row.marks.forEach((x, i) => (x === 'correct' ? (greens[i] = row.word[i]) : x === 'present' && ambers.push(row.word[i]))))
    marks.forEach((x, i) => (x === 'correct' ? (greens[i] = word[i]) : x === 'present' && ambers.push(word[i])))
    for (let k = 0; k < 2 && m.pending; k++) {
      const q = squatLetter(WORDS[m.S.lang].valid, greens, ambers, Object.fromEntries(Object.entries(next).map(([i, v]) => [i, v.ch])))
      if (!q) break
      const by = m.from.shift() ?? selfId
      next[q.pos] = { ch: q.ch, by }
      m.pending--
      fx.current.squat(tile(r, q.pos), q.ch, hueOf(by))
    }
    if (Object.keys(next).length) snd.current.squat()
    setSquat(next)
  }

  // Jinx: you and someone else guessed the same word on the same word number. You both lose a row.
  function jinx(id: string, h: number, used: number) {
    const m = mp.current, key = `${id}:${h}`, el = panelEls.current[id]
    if (!has(m.S, 'jinx') || m.jinxed.includes(key) || m.out || m.done || m.ended || (tm(id) >= 0 && tm(id) === tm(selfId))) return // teammates can't jinx
    m.jinxed = [...m.jinxed, key]
    const name = nameOf(id)
    flash(`jinx! · ${name}`)
    say(`Jinx with ${name}: you both lose a row`)
    snd.current.jinx(side(id))
    if (el) fx.current.jinx(center(board.current), center(el), hueOf(selfId), hueOf(id))
    if (m.S.rows - m.sealed - used > 1) seal(1, false)
  }

  // Send locks to the brightest other player still lit.
  function fire(n: number) {
    // teams shield each other first: what you earn melts your most-frosted teammate's waiting locks
    const snaps = snapsRef.current, frosted = teammates().filter(p => snaps[p.id]?.pending).sort((a, b) => snaps[b.id].pending - snaps[a.id].pending)[0]
    if (frosted) {
      const k = Math.min(n, snaps[frosted.id].pending), el = panelEls.current[frosted.id]
      net.current?.ev({ k: 'melt', to: frosted.id, n: k })
      if (el) fx.current.melt(center(board.current), center(el))
      n -= k
      if (!n) return
    }
    const to = target(foes())?.id
    if (!to) return
    net.current?.lock({ to, n })
    bots.current[to]?.hit(n)
    const el = panelEls.current[to]
    if (el) fx.current.stream(center(board.current), center(el), hueOf(selfId), n)
    snd.current.launch(side(to))
  }

  function gotMelt(e: Extract<Ev, { k: 'melt' }>, from: string) {
    const m = mp.current
    if (e.to !== selfId || !m.live || tm(from) !== tm(selfId)) return
    m.pending = Math.max(0, m.pending - e.n)
    m.from = m.from.slice(-m.pending || m.from.length)
    setPending(m.pending)
    const el = panelEls.current[from]
    if (el) fx.current.melt(center(el), center(board.current))
    flash(`${nameOf(from)} melted your frost`)
  }

  // Locks in flight are drawn on every screen; only the target's board takes them.
  function gotLock(l: Lock, from: string) {
    const m = mp.current, a = panelEls.current[from]
    if (l.to.startsWith('echo')) {
      bots.current[l.to]?.hit(l.n) // only the host has the echo itself
      const b = panelEls.current[l.to]
      if (a && b) fx.current.stream(center(a), center(b), hueOf(from), l.n)
      else if (from === selfId && b) fx.current.stream(center(board.current), center(b), hueOf(selfId), l.n)
      return
    }
    if (l.to === selfId) {
      if (a) fx.current.stream(center(a), center(board.current), hueOf(from), l.n)
      const name = nameOf(from)
      if (m.live && m.mirror) {
        // Mirror shield: straight back where it came from
        m.mirror = false
        setGuard(guards())
        net.current?.lock({ to: from, n: l.n })
        bots.current[from]?.hit(l.n)
        setTimeout(() => {
          fx.current.shield(false)
          if (a) fx.current.bounce(center(board.current), center(a), hueOf(selfId))
          snd.current.bounce()
          flash(`bounced back at ${name}`)
        }, 900)
        return
      }
      const decoys = foes().filter(p => p.id !== from)
      if (m.live && m.decoy && decoys.length) {
        // Decoy: passed on to someone random
        const to = decoys[Math.floor(Math.random() * decoys.length)].id, b = panelEls.current[to]
        m.decoy--
        setGuard(guards())
        net.current?.lock({ to, n: l.n })
        bots.current[to]?.hit(l.n)
        setTimeout(() => {
          if (b) fx.current.stream(center(board.current), center(b), hueOf(from), l.n)
          snd.current.decoy()
          flash(`decoy! it went to ${nameOf(to)}`)
        }, 900)
        return
      }
      if (m.live && !m.out && !m.done && !m.ended) {
        m.pending = Math.min(99, m.pending + l.n)
        m.from = [...m.from, ...Array(l.n).fill(from)]
        setPending(m.pending)
        snd.current.cold(side(from))
      }
    } else {
      const b = panelEls.current[l.to]
      if (a && b) fx.current.stream(center(a), center(b), hueOf(from), l.n)
    }
  }

  // Everyone's panel, as they see it: marks only, never letters.
  const snapshot = (): Me => {
    const m = mp.current
    return {
      round: m.round, n: m.n, typed: m.live && phase === 'play' ? cur.length : 0, sealed: m.live ? m.sealed : 0, pending: m.pending,
      rows: m.live ? rows.map((row, i) => (i === rows.length - 1 ? row.marks.slice(0, shown) : row.marks).map(x => x[0]).join('')) : [],
      score: Math.round(m.score), energy: Math.round(energy * 100) / 100, out: m.out, done: m.done, stars: m.stars.map(Math.round),
      said: m.live ? m.said : [],
      squat: Object.keys(squat).map(Number),
      rigged: !!m.rig,
      bag: m.live ? m.bag.join('') : '',
      guard: m.live ? guards() : '',
    }
  }
  const sendMe = useEffectEvent(() => net.current?.me(snapshot()))
  useEffect(() => sendMe(), [rows, shown, cur.length, phase, sealed, pending, energy, live, total, squat, bag, guard])

  // Someone's panel changed. Their new greens sound faintly from their side of the screen.
  function gotMe(m: Me, id: string) {
    const prev = snapsRef.current[id], pan = side(id), el = panelEls.current[id]
    snapsRef.current = { ...snapsRef.current, [id]: m }
    setSnaps(snapsRef.current)
    checkEnd()
    const me = mp.current
    if (me.live && m.round === me.round) for (const h of m.said) if (me.said.includes(h)) jinx(id, h, rows.length)
    if (!prev || prev.round !== m.round || prev.n !== m.n) return
    const r = m.rows.length - 1, was = prev.rows[r] ?? ''
    for (let c = was.length; c < (m.rows[r]?.length ?? 0); c++) if (m.rows[r][c] === 'c') snd.current.far(c, pan, id.startsWith('echo'))
    if (!prev.out && m.out) {
      snd.current.fall(pan)
      if (el) fx.current.ember(center(el), hueOf(id))
      say(`${nameOf(id)}'s light rests`)
    }
  }

  const share = () => navigator.clipboard?.writeText(location.href).then(() => flash('link copied'), () => {})

  const onRoom = useEffectEvent((r: Room) => applyRoom(r))
  const onPeers = useEffectEvent(peersChanged)
  const onStale = useEffectEvent(() => setLine('refresh to play together'))
  const onMe = useEffectEvent(gotMe)
  const rigLate = useEffectEvent(() => rig && rigWith(rig.words[Math.floor(Math.random() * 3)]))
  useEffect(() => {
    if (!rig) return
    const id = setTimeout(() => rigLate(), rig.until - Date.now()) // too slow: one of the three, at random
    return () => clearTimeout(id)
  }, [rig])
  const onLock = useEffectEvent(gotLock)
  const onEv = useEffectEvent((e: Ev, from: string) => (e.k === 'rig' ? gotRig(e, from) : e.k === 'side' ? gotSide(e, from) : e.k === 'melt' ? gotMelt(e, from) : gotSwap(e, from)))
  useEffect(() => {
    if (!code) return
    const c = (net.current = connect(code, { room: r => onRoom(r), me: (m, id) => onMe(m, id), lock: (l, id) => onLock(l, id), ev: (e, id) => onEv(e, id), peers: (ids, h) => onPeers(ids, h), stale: () => onStale() }))
    return () => {
      c.leave()
      net.current = null
    }
  }, [code])

  // A #word link goes straight into that room.
  const follow = useEffectEvent(() => {
    const w = location.hash.slice(1).toLowerCase()
    if (w && w !== code && anyWord(w)) goTo(w, true)
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

  // Undertow trial: each guess gets 8 bars. Past that, a row freezes; on the last row, the word is lost.
  const hurry = useEffectEvent(() => {
    setLate(true)
    snd.current.setTension(1)
  })
  const expire = useEffectEvent(() => {
    const m = mp.current, r = rows.length
    if (phase !== 'play' || !m.live) return
    setLate(false)
    if (m.S.rows - m.sealed - r > 1) {
      seal(1, false)
      say('The undertow took a row')
    } else {
      setCur('')
      setPhase('busy')
      finish('lost', r - 1)
    }
  })
  const undertow = trial('undertow') && phase === 'play' && !ended && !gamble // the clock waits while you read
  useEffect(() => {
    if (!undertow) return
    const a = setTimeout(() => hurry(), 6 * BAR * 1000), b = setTimeout(() => expire(), 8 * BAR * 1000)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [undertow, rows.length, sealed, answer])

  const press = useEffectEvent(onKey)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as Element).closest?.('button') && (e.key === 'Enter' || e.key === ' ')) return // the focused button handles it
      const k = e.key === 'Enter' ? 'enter' : e.key === 'Backspace' ? 'back' : e.key.toLowerCase()
      if (e.key === 'Escape') setAim(-1)
      if (k === 'enter' || k === 'back' || k === ' ' || k === 'escape' || /^[a-z1-3]$/.test(k)) {
        e.preventDefault()
        press(k)
      }
    }
    addEventListener('keydown', h)
    return () => removeEventListener('keydown', h)
  }, [])

  return (
    <main className={`app ${woke ? 'awake' : ''} ${code ? 'together' : ''} ${lobby ? 'lobby' : ''} ${late ? 'late' : ''}`} style={{ '--e': energy, '--bar': `${BAR}s`, '--rows': limit, '--cols': cols, '--brows': Math.ceil(boards / cols) } as CSSProperties}>
      <div className="stage">
      <aside className="hud left">
        {lobby && room ? <Setup side="left" s={room.settings} set={host ? setUp : undefined} /> : <>
        <p><small>Guess</small><b>{rows.length}<i>/{limit}</i></b></p>
        <p><small>Streak</small><b>{streak ? `×${streak}` : '–'}</b></p>
        <p><small>Light</small><Meter value={energy} /></p>
        </>}
      </aside>
      <div className="boards">
      <figure className={`panel ${teams ? `side-${teamOf(selfId)}` : ''}`} style={teams ? { gridRow: 1 } : undefined}>
      <div className="board" ref={board} role="grid" aria-label="Guesses">
        {live && pending > 0 && (
          <div className="frostq" aria-label={`${pending} locks waiting`}>
            {Array.from({ length: Math.min(pending, 8) }, (_, i) => <i key={i} />)}
          </div>
        )}
        {Array.from({ length: limit }, (_, r) => {
          const row = rows[r], now = r === rows.length && !lobby, word = row ? row.word : now ? compose(cur, Object.fromEntries(Object.entries(squat).map(([i, q]) => [i, q.ch]))).padEnd(COLS) : r === rows.length ? cur : ''
          const open = [0, 1, 2, 3, 4].filter(i => !(now && i in squat))
          return (
            <div key={r} role="row" ref={el => { rowEls.current[r] = el! }} className={`row ${result === 'won' && r !== rows.length - 1 ? 'dim' : ''} ${flare && r === rows.length - 1 ? 'flare' : ''} ${r >= limit - sealed ? 'sealed' : ''}`}>
              {Array.from({ length: COLS }, (_, c) => {
                const mark = row && (r < rows.length - 1 || c < shown) ? row.marks[c] : ''
                const drain = trial('fading') && r < faded
                const caret = phase === 'play' && r === rows.length && c === open[cur.length]
                const sq = now ? squat[c] : undefined
                const lit = now && hint?.pos === c && !word[c]?.trim()
                return (
                  <div key={c} role="gridcell" ref={el => { tileEls.current[r * COLS + c] = el! }} className={`tile ${word[c]?.trim() ? 'filled' : ''} ${mark} ${caret ? 'caret' : ''} ${drain ? 'drain' : ''} ${sq ? 'squat' : ''} ${lit ? 'hint' : ''}`} style={sq ? ({ '--h': hueOf(sq.by) } as CSSProperties) : undefined}>
                    {word[c]?.trim() ? <span key={word[c]}>{word[c]}</span> : lit && <span className="ghost-letter">{hint.ch}</span>}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      {code && room && selfId in room.seats && (
        <figcaption style={{ '--h': hueOf(selfId) } as CSSProperties}>
          you{live && <Which n={run.n} out={run.out} done={run.done} />}
        </figcaption>
      )}
      {live && room?.settings.skills && (
        <div className="bag mine" aria-label="Your skills">
          {[0, 1, 2].map(i => {
            const s = gamble && i === bag.length - 1 ? undefined : bag[i] // the new one arrives when the reveal closes
            return (
              <button key={i} className={s ? SKILLS[s].rarity : 'empty'} disabled={!s} onMouseDown={e => e.preventDefault()} onClick={() => cast(i)} aria-label={s ? `${i + 1}: ${SKILLS[s].name}. ${SKILLS[s].about}` : `Slot ${i + 1}: empty`} title={s ? `${SKILLS[s].name}: ${SKILLS[s].about}` : 'Solve a word to win a skill'}>
                <i>{s && <Icon s={s} />}</i>
              </button>
            )
          })}
          {[...guard].map(g => <b key={g} className="on" title={g === 'm' ? 'Mirror shield is up' : g === 'd' ? 'Decoy is up' : 'Second wind is ready'}><Icon s={g as Skill} /></b>)}
        </div>
      )}
      </figure>
      {code && room && others.map(id => (
        <Panel key={id} side={teams ? teamOf(id) : -1} row={teams ? (teamOf(id) === teamOf(selfId) ? 1 : 2) : 0} seat={seatIn(room, id)} snap={snaps[id]?.round === room.round ? snaps[id] : undefined} rows={limit} live={live} pick={aim >= 0 && !id.startsWith('echo') ? () => cast(aim, id) : undefined} echo={id.startsWith('echo') ? nameOf(id) : undefined} el={e => { panelEls.current[id] = e }} />
      ))}
      </div>
      <aside className="hud right">
        {lobby && room ? <Setup side="right" s={room.settings} set={host ? setUp : undefined} /> : <>
        <p><small>Time</small><b>{clockText(Math.max(0, (live && room?.settings.mode === 'tide' ? room.settings.tide * 60 : 0) + (live && room?.settings.mode === 'tide' ? -1 : 1) * (clock.start ? Math.floor(((clock.end || clock.now) - clock.start) / 1000) : 0)))}</b></p>
        <p><small>Score</small><b><Tally value={scored} /></b></p>
        {live && teams ? (
          <>
            {[teamOf(selfId), 1 - teamOf(selfId)].map((t, i) => (
              <p key={t} className={`side-${t}`}>
                <small>{TEAM_NAMES[t]}</small>
                <b><Tally value={score2[t]} /></b>
                {i === 0 && <span className="tug" style={{ '--k': score2[t] + score2[1 - t] ? score2[t] / (score2[t] + score2[1 - t]) : 0.5 } as CSSProperties}><i /></span>}
              </p>
            ))}
          </>
        ) : live && room?.settings.mode === 'stars' ? (
          <p><small>Stars</small><b>{run.stars}<i>/{room.settings.stars}</i></b></p>
        ) : (
          <p><small>Total</small><b><Tally value={total} /></b></p>
        )}
        </>}
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

      {ended && (
        <ol className="rank">
          {ended.rank.map(p => (
            <li key={p.id} className={teams ? `side-${teamOf(p.id)}` : ''} style={{ '--h': hueOf(p.id) } as CSSProperties}>
              {p.id === selfId ? 'you' : nameOf(p.id)} <b>{p.score.toLocaleString('en-US')}</b>
            </li>
          ))}
        </ol>
      )}
      {rig && (
        <div className="rig" style={{ '--h': hueOf(rig.to) } as CSSProperties}>
          <small>pick {nameOf(rig.to)}'s next word</small>
          <div>
            {rig.words.map((w, i) => (
              <button key={w} onMouseDown={e => e.preventDefault()} onClick={() => rigWith(w)}>
                <i>{i + 1}</i>
                {w}
              </button>
            ))}
          </div>
          <span className="fuse" />
        </div>
      )}
      {code && (
        <p className="line">
          {ended ? ended.line : line || (lobby && <button onMouseDown={e => e.preventDefault()} onClick={share}>share the word</button>)}
          {lobby && room && selfId in room.seats && !line && (
            <span style={{ '--h': COLOURS[room.seats[selfId]][1] } as CSSProperties}> · you're {COLOURS[room.seats[selfId]][0]}</span>
          )}
          {lobby && room && room.settings.versus === 'teams' && selfId in room.seats && !line && (
            <span className="sides">
              {[0, 1].map(t => (
                <span key={t} className={`side-${t}`}>
                  {TEAM_NAMES[t]}: {Object.keys(room.seats).filter(id => (id === selfId || peers.includes(id)) && teamOf(id) === t).map(id => (id === selfId ? 'you' : COLOURS[room.seats[id]][0])).join(', ') || '–'}
                </span>
              ))}
              <button onMouseDown={e => e.preventDefault()} onClick={switchSide}>switch to {TEAM_NAMES[1 - teamOf(selfId)]}</button>
            </span>
          )}
          {lobby && room && room.settings.versus === 'echoes' && selfId in room.seats && !line && (
            <span className="sides">you'll face {seated} {seated === 1 ? 'echo' : 'echoes'}</span>
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
                  className={`key ${(!trial('fading') && keys[k]) || ''} ${k.length > 1 ? 'wide' : ''} ${k === 'enter' && (lobby ? host && ready && !cur : live ? !!ended && host : phase === 'over') ? 'beckon' : ''}`}
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
        onClick={() => (code ? leave() : goTo(pick(lang)))}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="1.5" y="5.5" width="9" height="9" rx="1.5" />
          <path d="M5.5 5.5v-2a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        </svg>
      </button>
      {!code && (
        <button
          className="corner lang"
          aria-label={solo === 'en' ? 'Play in Indonesian' : 'Play in English'}
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            const next = solo === 'en' ? 'id' : 'en'
            localStorage.setItem('lang', next)
            setSolo(next)
            restart(pick(next))
          }}
        >
          {solo}
        </button>
      )}
      <a className="corner repo" href="https://github.com/Joystickplays/WordlEffect" target="_blank" rel="noopener noreferrer" aria-label="Source code on GitHub">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
        </svg>
      </a>
      {gamble && (
        <div className={`gamble ${SKILLS[gamble.s].rarity} ${gamble.landed ? 'landed' : ''}`} role="dialog" aria-modal="true" aria-label="New skill" onClick={closeGamble}>
          <div className="reel-window">
            <div className="shards" aria-hidden="true">
              {SHARDS.map((p, i) => <i key={i} style={p as CSSProperties} />)}
            </div>
            <div className="strip" style={{ '--n': gamble.strip.length - 1 } as CSSProperties}>
              {gamble.strip.map((k, i) => <span key={i}><Icon s={k} /></span>)}
            </div>
          </div>
          <small className="rarity">{SKILLS[gamble.s].rarity}</small>
          <h2>{SKILLS[gamble.s].name}</h2>
          <p>{SKILLS[gamble.s].about}</p>
          <em>click to continue</em>
        </div>
      )}
      <div className="sr" aria-live="polite">{said}</div>
      <canvas className="fx" ref={canvas} aria-hidden="true" />
    </main>
  )
}

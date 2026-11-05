// Playing together, peer to peer. Public Nostr relays only carry the WebRTC handshake; the game itself flows
// directly between browsers. Every message is checked before use: a peer is someone else's code.
import { joinRoom, selfId } from 'trystero'
import type { Lang } from './words.ts'

export { selfId }
export const V = 4 // bump when messages change shape, so mismatched versions say so instead of misbehaving

export type Mode = 'light' | 'tide' | 'stars'
export type Versus = 'all' | 'teams' | 'echoes'
export const TRIALS = ['strict', 'undertow', 'fading', 'frost', 'squatter', 'rigged', 'jinx'] as const
export type Trial = (typeof TRIALS)[number]
export type Settings = { mode: Mode; rows: number; locks: number; trials: number; seats: number; tide: number; stars: number; lang: Lang; skills: boolean; versus: Versus; echoes: number }
export const DEFAULTS: Settings = { mode: 'light', rows: 6, locks: 1, trials: 0, seats: 8, tide: 5, stars: 3, lang: 'en', skills: false, versus: 'all', echoes: 1 }
export const has = (s: Settings, t: Trial) => !!(s.trials & (1 << TRIALS.indexOf(t)))

// Players are their colours, by seat.
export const COLOURS = [['rose', 340], ['gold', 45], ['fern', 100], ['mint', 150], ['teal', 180], ['sky', 205], ['iris', 240], ['violet', 285]] as const

// sides: each player's team (0 dawn, 1 dusk); echoes: the bots' ids in an echoes match
export type Room = { settings: Settings; phase: 'lobby' | 'play'; seed: number; round: number; seats: Record<string, number>; sides: Record<string, number>; echoes: string[] }
// One player's whole panel. Marks only ("ccpaa"), never letters.
export type Me = { round: number; n: number; rows: string[]; typed: number; sealed: number; pending: number; score: number; energy: number; out: boolean; done: boolean; stars: number[]; said: number[]; squat: number[]; rigged: boolean; bag: string; guard: string; bot?: string }
// bot / by: an echo's snapshot or lock, sent on its behalf by the host
export type Lock = { to: string; n: number; by?: string }
// Everything else players do to each other: rigging a word, swapping boards.
export type Board = { answer: string; rows: string[]; sealed: number }
export type Swap = { k: 'swap'; to: string; reply: boolean; ok: boolean; bounced: boolean; board: Board | null }
export type Ev = { k: 'rig'; to: string; word: string } | Swap | { k: 'side'; to: string; side: number } | { k: 'melt'; to: string; n: number }
type Hello = { v: number; since: number }

type Obj = Record<string, unknown>
const obj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x)
const num = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi
const int = (x: unknown, lo: number, hi: number) => num(x, lo, hi) && Number.isInteger(x)

const okSettings = (s: unknown) =>
  obj(s) && ['light', 'tide', 'stars'].includes(s.mode as string) && int(s.rows, 4, 8) && int(s.locks, 0, 2) && int(s.trials, 0, 127) &&
  int(s.seats, 2, 8) && [3, 5, 10].includes(s.tide as number) && [3, 5].includes(s.stars as number) && (s.lang === 'en' || s.lang === 'id') && typeof s.skills === 'boolean' &&
  ['all', 'teams', 'echoes'].includes(s.versus as string) && int(s.echoes, 0, 2)
const okRoom = (r: unknown): r is Room =>
  obj(r) && okSettings(r.settings) && (r.phase === 'lobby' || r.phase === 'play') && int(r.seed, 0, 2 ** 32) && int(r.round, 0, 1e6) &&
  obj(r.seats) && Object.keys(r.seats).length <= 8 && Object.values(r.seats).every(v => int(v, 0, 7)) &&
  obj(r.sides) && Object.keys(r.sides).length <= 8 && Object.values(r.sides).every(v => int(v, 0, 1)) &&
  Array.isArray(r.echoes) && r.echoes.length <= 4 && r.echoes.every(e => typeof e === 'string' && /^echo\d$/.test(e))
const okMe = (m: unknown): m is Me =>
  obj(m) && int(m.round, 0, 1e6) && int(m.n, 0, 1e5) && Array.isArray(m.rows) && m.rows.length <= 8 &&
  m.rows.every(r => typeof r === 'string' && /^[cpa]{0,5}$/.test(r)) && int(m.typed, 0, 5) && int(m.sealed, 0, 8) &&
  int(m.pending, 0, 99) && num(m.score, 0, 1e9) && num(m.energy, 0, 1) && typeof m.out === 'boolean' && typeof m.done === 'boolean' &&
  Array.isArray(m.stars) && m.stars.length <= 5 && m.stars.every(t => num(t, 0, 1e8)) &&
  Array.isArray(m.said) && m.said.length <= 8 && m.said.every(h => int(h, 0, 2 ** 32)) &&
  Array.isArray(m.squat) && m.squat.length <= 5 && m.squat.every(i => int(i, 0, 4)) && typeof m.rigged === 'boolean' &&
  typeof m.bag === 'string' && /^[tlwdms]{0,3}$/.test(m.bag) && typeof m.guard === 'string' && /^[mdw]{0,3}$/.test(m.guard)
const echo = (x: unknown) => x === undefined || (typeof x === 'string' && /^echo\d$/.test(x))
// A name you pick for yourself: short, plain letters and a little punctuation.
export const okName = (n: unknown): n is string => typeof n === 'string' && /^[\p{L}\p{N}][\p{L}\p{N} '._-]{0,11}$/u.test(n)
const okLock = (l: unknown): l is Lock => obj(l) && typeof l.to === 'string' && l.to.length < 64 && int(l.n, 1, 6) && echo(l.by)
const id = (x: unknown) => typeof x === 'string' && x.length < 64
const okEv = (e: unknown): e is Ev =>
  obj(e) && id(e.to) &&
  ((e.k === 'rig' && typeof e.word === 'string' && /^[a-z]{5}$/.test(e.word)) ||
    (e.k === 'side' && int(e.side, 0, 1)) ||
    (e.k === 'melt' && int(e.n, 1, 6)) ||
    (e.k === 'swap' && typeof e.reply === 'boolean' && typeof e.ok === 'boolean' && typeof e.bounced === 'boolean' && (e.board === null || okBoard(e.board))))
const five = (w: unknown) => typeof w === 'string' && /^[a-z]{5}$/.test(w)
const okBoard = (b: unknown) => obj(b) && five(b.answer) && Array.isArray(b.rows) && b.rows.length <= 7 && b.rows.every(five) && int(b.sealed, 0, 7)

export type Handlers = {
  room(r: Room): void
  me(m: Me, from: string): void
  lock(l: Lock, from: string): void
  ev(e: Ev, from: string): void
  peers(ids: string[], host: string): void // whenever someone arrives or leaves
  name(id: string, name: string): void // someone named themselves
  stale(): void // someone is running a different version
}

type Wire = { from: string; t: 'hi' | 'msg' | 'bye'; to?: string | null; ns?: string; data?: unknown }
type Action<T> = { send(data: T, o?: { target?: string }): Promise<void>; onMessage: ((data: T, c: { peerId: string }) => void) | null }

// With ?local in the URL, tabs of one browser play over a BroadcastChannel instead: for testing with no network,
// or behind a VPN that blocks WebRTC.
function localRoom(word: string) {
  const ch = new BroadcastChannel(`wordleffect:${word}`), actions = new Map<string, Action<unknown>>(), peers = new Set<string>()
  const post = (m: Omit<Wire, 'from'>) => ch.postMessage({ from: selfId, ...m })
  const r = {
    onPeerJoin: null as ((id: string) => void) | null,
    onPeerLeave: null as ((id: string) => void) | null,
    makeAction<T>(ns: string) {
      const a: Action<T> = { onMessage: null, send: async (data, o) => post({ t: 'msg', ns, data, to: o?.target ?? null }) }
      actions.set(ns, a as Action<unknown>)
      return a
    },
    leave: async () => {
      post({ t: 'bye' })
      ch.close()
    },
  }
  ch.onmessage = ({ data: m }: MessageEvent<Wire>) => {
    if (m.to && m.to !== selfId) return
    if (m.t === 'bye') return peers.delete(m.from) && r.onPeerLeave?.(m.from)
    if (!peers.has(m.from)) {
      peers.add(m.from)
      if (m.t === 'hi') post({ t: 'hi', to: m.from })
      r.onPeerJoin?.(m.from)
    }
    if (m.t === 'msg') actions.get(m.ns!)?.onMessage?.(m.data, { peerId: m.from })
  }
  addEventListener('pagehide', () => post({ t: 'bye' }))
  post({ t: 'hi' })
  return r
}

// TURN servers (api/turn.js): a relay for when two networks won't connect directly. Fetched once a visit, and given
// up on after 2 seconds, so a slow or missing relay never holds up players who can connect directly.
// shortcut: the credentials last 12 hours; a page left open longer plays without the relay until reloaded.
const local = () => new URLSearchParams(location.search).has('local')
let turn: Promise<RTCIceServer[]> | null = null
export function ice() {
  if (local()) return Promise.resolve([])
  return (turn ??= Promise.race([
    fetch('/api/turn').then(r => r.json()).then((d: { iceServers?: unknown }) => (Array.isArray(d.iceServers) ? (d.iceServers as RTCIceServer[]) : [])),
    new Promise<RTCIceServer[]>(r => setTimeout(() => r([]), 2000)),
  ])
    .catch(() => [])
    .then(s => ((turn = s.length ? turn : null), s))) // try again next time if it didn't come
}

export function connect(word: string, on: Handlers, turnConfig: RTCIceServer[] = []) {
  const room: ReturnType<typeof localRoom> = local() ? localRoom(word) : (joinRoom({ appId: 'wordleffect', ...(turnConfig.length && { turnConfig }) }, word) as never)
  const since = Date.now(), known = new Map<string, number>()
  const hello = room.makeAction<Hello>('hello'), roomA = room.makeAction<Room>('room')
  const meA = room.makeAction<Me>('me'), lockA = room.makeAction<Lock>('lock'), evA = room.makeAction<Ev>('ev')
  const nameA = room.makeAction<string>('name')
  let mine = ''
  // The host is whoever has been here longest: everyone works it out the same way, so no election is needed.
  const host = () => [...known, [selfId, since] as const].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))[0][0]
  const changed = () => on.peers([...known.keys()], host())

  room.onPeerJoin = id => {
    hello.send({ v: V, since }, { target: id })
    if (mine) nameA.send(mine, { target: id })
  }
  room.onPeerLeave = id => known.delete(id) && changed()
  hello.onMessage = (h, { peerId }) => {
    if (!obj(h) || !num(h.since, 0, 1e15)) return
    if (h.v !== V) return on.stale()
    known.set(peerId, h.since)
    changed()
  }
  roomA.onMessage = (r, { peerId }) => void (known.has(peerId) && peerId === host() && okRoom(r) && on.room(r))
  // only the host speaks for echoes
  meA.onMessage = (m, { peerId }) => void (known.has(peerId) && okMe(m) && echo(m.bot) && (!m.bot || peerId === host()) && on.me(m, m.bot ?? peerId))
  lockA.onMessage = (l, { peerId }) => void (known.has(peerId) && okLock(l) && (!l.by || peerId === host()) && on.lock(l, l.by ?? peerId))
  nameA.onMessage = (n, { peerId }) => void ((n === '' || okName(n)) && on.name(peerId, n)) // '' goes back to their colour
  evA.onMessage = (e, { peerId }) => void (known.has(peerId) && okEv(e) && on.ev(e, peerId))

  return {
    room: (r: Room) => void roomA.send(r),
    // an echo's board and locks reach the host too, the same way they reach everyone else
    me: (m: Me) => void (meA.send(m), m.bot && on.me(m, m.bot)),
    lock: (l: Lock) => void (lockA.send(l), l.by && on.lock(l, l.by)),
    ev: (e: Ev, to?: string) => void evA.send(e, { target: to }),
    name: (n: string) => void ((mine = n), nameA.send(n)),
    leave: () => void room.leave(),
  }
}
export type Net = ReturnType<typeof connect>

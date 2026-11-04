// Playing together, peer to peer. Public Nostr relays only carry the WebRTC handshake; the game itself flows
// directly between browsers. Every message is checked before use: a peer is someone else's code.
// shortcut: STUN only, so strict NATs (some mobile and office networks) can't connect; add TURN via turnConfig.
import { joinRoom, selfId } from 'trystero'

export { selfId }
export const V = 1 // bump when messages change shape, so mismatched versions say so instead of misbehaving

export type Mode = 'light' | 'tide' | 'stars'
export const TRIALS = ['strict', 'undertow', 'fading', 'frost'] as const
export type Trial = (typeof TRIALS)[number]
export type Settings = { mode: Mode; rows: number; locks: number; trials: number; seats: number; tide: number; stars: number }
export const DEFAULTS: Settings = { mode: 'light', rows: 6, locks: 1, trials: 0, seats: 8, tide: 5, stars: 3 }
export const has = (s: Settings, t: Trial) => !!(s.trials & (1 << TRIALS.indexOf(t)))

// Players are their colours, by seat.
export const COLOURS = [['rose', 340], ['gold', 45], ['fern', 100], ['mint', 150], ['teal', 180], ['sky', 205], ['iris', 240], ['violet', 285]] as const

export type Room = { settings: Settings; phase: 'lobby' | 'play'; seed: number; round: number; seats: Record<string, number> }
// One player's whole panel. Marks only ("ccpaa"), never letters.
export type Me = { round: number; n: number; rows: string[]; typed: number; sealed: number; pending: number; score: number; energy: number; out: boolean; done: boolean; stars: number[] }
export type Lock = { to: string; n: number }
type Hello = { v: number; since: number }

type Obj = Record<string, unknown>
const obj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x)
const num = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi
const int = (x: unknown, lo: number, hi: number) => num(x, lo, hi) && Number.isInteger(x)

const okSettings = (s: unknown) =>
  obj(s) && ['light', 'tide', 'stars'].includes(s.mode as string) && int(s.rows, 4, 8) && int(s.locks, 0, 2) && int(s.trials, 0, 15) &&
  int(s.seats, 2, 8) && [3, 5, 10].includes(s.tide as number) && [3, 5].includes(s.stars as number)
const okRoom = (r: unknown): r is Room =>
  obj(r) && okSettings(r.settings) && (r.phase === 'lobby' || r.phase === 'play') && int(r.seed, 0, 2 ** 32) && int(r.round, 0, 1e6) &&
  obj(r.seats) && Object.keys(r.seats).length <= 8 && Object.values(r.seats).every(v => int(v, 0, 7))
const okMe = (m: unknown): m is Me =>
  obj(m) && int(m.round, 0, 1e6) && int(m.n, 0, 1e5) && Array.isArray(m.rows) && m.rows.length <= 8 &&
  m.rows.every(r => typeof r === 'string' && /^[cpa]{0,5}$/.test(r)) && int(m.typed, 0, 5) && int(m.sealed, 0, 8) &&
  int(m.pending, 0, 99) && num(m.score, 0, 1e9) && num(m.energy, 0, 1) && typeof m.out === 'boolean' && typeof m.done === 'boolean' &&
  Array.isArray(m.stars) && m.stars.length <= 5 && m.stars.every(t => num(t, 0, 1e8))
const okLock = (l: unknown): l is Lock => obj(l) && typeof l.to === 'string' && l.to.length < 64 && int(l.n, 1, 6)

export type Handlers = {
  room(r: Room): void
  me(m: Me, from: string): void
  lock(l: Lock, from: string): void
  peers(ids: string[], host: string): void // whenever someone arrives or leaves
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

export function connect(word: string, on: Handlers) {
  const local = new URLSearchParams(location.search).has('local')
  const since = Date.now(), room: ReturnType<typeof localRoom> = local ? localRoom(word) : (joinRoom({ appId: 'wordleffect' }, word) as never), known = new Map<string, number>()
  const hello = room.makeAction<Hello>('hello'), roomA = room.makeAction<Room>('room')
  const meA = room.makeAction<Me>('me'), lockA = room.makeAction<Lock>('lock')
  // The host is whoever has been here longest: everyone works it out the same way, so no election is needed.
  const host = () => [...known, [selfId, since] as const].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))[0][0]
  const changed = () => on.peers([...known.keys()], host())

  room.onPeerJoin = id => void hello.send({ v: V, since }, { target: id })
  room.onPeerLeave = id => known.delete(id) && changed()
  hello.onMessage = (h, { peerId }) => {
    if (!obj(h) || !num(h.since, 0, 1e15)) return
    if (h.v !== V) return on.stale()
    known.set(peerId, h.since)
    changed()
  }
  roomA.onMessage = (r, { peerId }) => void (known.has(peerId) && peerId === host() && okRoom(r) && on.room(r))
  meA.onMessage = (m, { peerId }) => void (known.has(peerId) && okMe(m) && on.me(m, peerId))
  lockA.onMessage = (l, { peerId }) => void (known.has(peerId) && okLock(l) && on.lock(l, peerId))

  return {
    room: (r: Room) => void roomA.send(r),
    me: (m: Me) => void meA.send(m),
    lock: (l: Lock) => void lockA.send(l),
    leave: () => void room.leave(),
  }
}
export type Net = ReturnType<typeof connect>

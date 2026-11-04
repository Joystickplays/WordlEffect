/// <reference types="node" />
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { score, chains, energyOf, tensionOf, best, points, winBonus, order, locksFor, trade, land, target, strictBreak, hash, squatLetter, compose } from './game.ts'

test('score handles exact, misplaced and duplicate letters', () => {
  assert.deepEqual(score('crane', 'crane'), Array(5).fill('correct'))
  assert.deepEqual(score('papal', 'apple'), ['present', 'present', 'correct', 'absent', 'present'])
  assert.deepEqual(score('ooooo', 'robot'), ['absent', 'correct', 'absent', 'correct', 'absent'])
})

test('chains count runs of adjacent greens', () => {
  assert.deepEqual(chains(['correct', 'correct', 'absent', 'correct', 'correct']), [0, 1, -1, 0, 1])
  assert.deepEqual(chains(['present', 'correct', 'correct', 'correct', 'absent']), [-1, 0, 1, 2, -1])
})

test('energy stays below 1 until the word is solved', () => {
  const s = { greens: new Set([0, 1, 2, 3]), found: new Set('abcde'), guesses: 6, streak: 4 }
  assert.ok(energyOf(s) < 1)
  assert.equal(energyOf({ greens: new Set(), found: new Set(), guesses: 0, streak: 0 }), 0)
})

test('keyboard keeps the strongest state', () => {
  assert.equal(best('correct', 'present'), 'correct')
  assert.equal(best(undefined, 'absent'), 'absent')
  assert.equal(best('absent', 'present'), 'present')
})

test('points reward new greens, chains and streaks', () => {
  assert.equal(points('correct', true, 0, 0), 100)
  assert.equal(points('correct', true, 2, 1), 250)
  assert.equal(points('correct', false, 3, 4), 10)
  assert.equal(points('present', false, -1, 3), 25)
  assert.equal(points('absent', false, -1, 3), 0)
  assert.equal(winBonus(1), 3000)
  assert.equal(winBonus(6), 500)
  assert.equal(winBonus(8), 500)
})

test('energy comes from letters found, not from guessing', () => {
  assert.equal(energyOf({ greens: new Set(), found: new Set(), guesses: 5, streak: 0 }), 0)
  assert.ok(energyOf({ greens: new Set([0]), found: new Set('a'), guesses: 1, streak: 1 }) < 0.25)
})

test('tension builds near the answer or near the last guess', () => {
  assert.equal(tensionOf(2, 3), 0)
  assert.equal(tensionOf(3, 5), 0.5)
  assert.equal(tensionOf(4, 4), 1)
  assert.equal(tensionOf(0, 2), 0.5)
  assert.equal(tensionOf(1, 1), 1)
  assert.equal(tensionOf(0, 0), 1)
})

test('every player in a room gets the same word order', () => {
  const a = order(42, 801)
  assert.deepEqual(a, order(42, 801))
  assert.notDeepEqual(a, order(43, 801))
  assert.deepEqual([...a].sort((x, y) => x - y), Array.from({ length: 801 }, (_, i) => i))
})

test('streaks and quick solves send locks', () => {
  assert.equal(locksFor(2, true, false, 2), 0)
  assert.equal(locksFor(3, true, false, 3), 1)
  assert.equal(locksFor(6, true, false, 4), 2)
  assert.equal(locksFor(6, false, false, 4), 0)
  assert.equal(locksFor(1, true, true, 2), 2)
  assert.equal(locksFor(3, true, true, 3), 2)
  assert.equal(locksFor(0, false, true, 5), 0)
})

test('earned locks melt pending ones first', () => {
  assert.deepEqual(trade(3, 1), { sent: 2, pending: 0 })
  assert.deepEqual(trade(1, 3), { sent: 0, pending: 2 })
  assert.deepEqual(trade(0, 2), { sent: 0, pending: 2 })
})

test('locks never take the last free row', () => {
  assert.deepEqual(land(2, 5), { now: 2, pending: 0 })
  assert.deepEqual(land(3, 2), { now: 1, pending: 0 })
  assert.deepEqual(land(3, 2, true), { now: 1, pending: 2 })
  assert.deepEqual(land(2, 1), { now: 0, pending: 0 })
  assert.deepEqual(land(2, 0, true), { now: 0, pending: 2 })
})

test('locks fly toward the brightest player', () => {
  assert.equal(target([{ id: 'a', score: 10 }, { id: 'b', score: 90 }, { id: 'c', score: 40 }])?.id, 'b')
  assert.equal(target([{ id: 'a', score: 5 }, { id: 'b', score: 5 }], () => 0.99)?.id, 'b')
  assert.equal(target([]), undefined)
})

test('strict keeps the light you found', () => {
  const rows = [{ word: 'crane', marks: score('crane', 'cloud') }]
  assert.equal(strictBreak('cloth', rows), null)
  assert.equal(strictBreak('slosh', rows), 'c')
  const amber = [{ word: 'stare', marks: score('stare', 'react') }]
  assert.equal(strictBreak('irate', amber), null)
  assert.equal(strictBreak('grand', amber), 't')
})

test('jinx fingerprints match only the same guess on the same word', () => {
  assert.equal(hash('1:3:crane'), hash('1:3:crane'))
  assert.notEqual(hash('1:3:crane'), hash('1:4:crane'))
  assert.notEqual(hash('1:3:crane'), hash('1:3:crate'))
  assert.ok(hash('x') >= 0 && hash('x') < 2 ** 32)
})

test('squatters always leave the row solvable', () => {
  const valid = ['crane', 'crate', 'trace', 'zebra']
  for (let i = 0; i < 50; i++) {
    const q = squatLetter(valid, { 0: 'c' }, ['t'], {})!
    assert.notEqual(q.pos, 0)
    assert.ok(valid.some(w => w[0] === 'c' && w.includes('t') && w[q.pos] === q.ch))
  }
  assert.equal(squatLetter(valid, { 0: 'q' }, [], {}), null)
  assert.equal(compose('cne', { 1: 'r', 2: 'a' }), 'crane')
  assert.equal(compose('c', { 1: 'r' }), 'cr')
})

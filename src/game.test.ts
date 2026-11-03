/// <reference types="node" />
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { score, chains, energyOf, tensionOf, best, points, winBonus } from './game.ts'

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
})

test('energy comes from letters found, not from guessing', () => {
  assert.equal(energyOf({ greens: new Set(), found: new Set(), guesses: 5, streak: 0 }), 0)
  assert.ok(energyOf({ greens: new Set([0]), found: new Set('a'), guesses: 1, streak: 1 }) < 0.25)
})

test('tension builds near the answer or near the last guess', () => {
  assert.equal(tensionOf(2, 3), 0)
  assert.equal(tensionOf(3, 1), 0.5)
  assert.equal(tensionOf(4, 2), 1)
  assert.equal(tensionOf(0, 4), 0.5)
  assert.equal(tensionOf(1, 5), 1)
})

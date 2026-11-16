// Testy jádra (scoresheet-core.js). Spuštění: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Chess } = require('../vendor/chess.js');
const S = require('../scoresheet-core.js');

const ply = (n, c, written, san, extra) => Object.assign({ move_number: n, color: c, written, san: san || '', alternatives: [], confidence: 'high' }, extra);

test('normalizeWritten převede českou notaci', () => {
  assert.deepStrictEqual(S.normalizeWritten('Jf3', 'czech'), ['Nf3']);
  assert.deepStrictEqual(S.normalizeWritten('S:c4+', 'czech'), ['Bc4']);
  assert.deepStrictEqual(S.normalizeWritten('0-0-0', 'czech'), ['O-O-O']);
  assert.deepStrictEqual(S.normalizeWritten('e8D', 'czech'), ['e8Q']);
});

test('reconcile složí čistý zápis v české notaci', () => {
  const plies = S.orderPlies([
    ply(1, 'w', 'e4'), ply(1, 'b', 'e5'), ply(2, 'w', 'Jf3'), ply(2, 'b', 'Jc6'), ply(3, 'w', 'Sb5'), ply(3, 'b', 'a6')
  ]);
  const r = S.reconcile(plies, { Chess, lang: 'czech' });
  assert.strictEqual(r.stoppedAt, -1);
  assert.deepStrictEqual(r.plies.map(p => p.san), ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
});

test('reconcile opraví záměnu S a 5 podle pozice', () => {
  // "S5" nedává smysl, "Sb5" ano; střelec na b5 je jediný rozumný výklad
  const plies = S.orderPlies([
    ply(1, 'w', 'e4'), ply(1, 'b', 'e5'), ply(2, 'w', 'Jf3'), ply(2, 'b', 'Jc6'), ply(3, 'w', '5b5', '', { confidence: 'low' })
  ]);
  const r = S.reconcile(plies, { Chess, lang: 'czech' });
  assert.strictEqual(r.plies[4].san, 'Bb5');
  assert.ok(r.plies[4].flagged, 'nejistý tah má být označený');
});

test('reconcile se zastaví u nesmyslného tahu a ruční volba ho opraví', () => {
  const plies = S.orderPlies([ply(1, 'w', 'e4'), ply(1, 'b', 'Dh1'), ply(2, 'w', 'Jf3')]);
  const r = S.reconcile(plies, { Chess, lang: 'czech' });
  assert.strictEqual(r.stoppedAt, 1);
  const r2 = S.reconcile(plies, { Chess, lang: 'czech', forced: { 1: 'e5' } });
  assert.strictEqual(r2.stoppedAt, -1);
  assert.deepStrictEqual(r2.plies.map(p => p.san), ['e4', 'e5', 'Nf3']);
});

test('orderPlies doplní přeskočený tah', () => {
  const p = S.orderPlies([ply(1, 'w', 'e4'), ply(2, 'w', 'Jf3')]);
  assert.strictEqual(p.length, 3);
  assert.ok(p[1].missing);
});

test('buildPgn sestaví hlavičku a tahy', () => {
  const pgn = S.buildPgn({ white: 'Novák, Jan', black: 'Dvořák, Petr', date: '12. 11. 2026', result: '1-0' }, ['e4', 'e5', 'Nf3']);
  assert.match(pgn, /\[White "Novák, Jan"\]/);
  assert.match(pgn, /\[Date "2026\.11\.12"\]/);
  assert.match(pgn, /1\. e4 e5 2\. Nf3 1-0/);
});

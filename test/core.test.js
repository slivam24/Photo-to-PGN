'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const S = require('../src/scoresheet-core.js');

// Morphy – vévoda Brunšvický a hrabě Isouard, Paříž 1858
const OPERA = 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#'.split(' ');

// Převod do české notace tak, jak by ji psal hráč rukou
function toCzech(san) {
  return san.replace(/[NBRQ]/g, c => ({ N: 'J', B: 'S', R: 'V', Q: 'D' })[c]).replace('O-O-O', '0-0-0');
}
function plies(written, sans) {
  return written.map((w, i) => ({ move_number: Math.floor(i / 2) + 1, color: i % 2 ? 'b' : 'w', written: w, san: sans ? sans[i] : '', alternatives: [], confidence: 'high' }));
}

test('normalizace zápisu', () => {
  assert.deepEqual(S.normalizeWritten('Jf3', 'czech'), ['Nf3']);
  assert.deepEqual(S.normalizeWritten('S:c4+', 'czech'), ['Bc4']);
  assert.deepEqual(S.normalizeWritten('e2-e4', 'czech'), ['e2e4']);
  assert.deepEqual(S.normalizeWritten('exd5', 'czech'), ['ed5']);
  assert.deepEqual(S.normalizeWritten('e8D', 'czech'), ['e8Q']);
  assert.deepEqual(S.normalizeWritten('e8=Q', 'english'), ['e8Q']);
  assert.deepEqual(S.normalizeWritten('0-0', 'czech'), ['O-O']);
  assert.deepEqual(S.normalizeWritten('O-O-O', null), ['O-O-O']);
  assert.deepEqual(S.normalizeWritten('Sf3', 'german'), ['Nf3']);
  assert.deepEqual(S.normalizeWritten('♘f3', 'czech'), ['Nf3']);
  assert.deepEqual(S.normalizeWritten('Крe2', 'russian'), ['Ke2']);
  assert.ok(S.normalizeWritten('Sf3', null).includes('Bf3'));
  assert.ok(S.normalizeWritten('Sf3', null).includes('Nf3'));
});

test('čistý český zápis projde celý a bez označení', () => {
  const r = S.reconcile(plies(OPERA.map(toCzech)), { Chess, lang: 'czech' });
  assert.equal(r.stoppedAt, -1);
  assert.deepEqual(r.plies.map(p => p.san), OPERA);
  assert.ok(r.gameOver);
});

test('rukopisné chyby se opraví podle pravidel', () => {
  const w = OPERA.map(toCzech);
  w[5] = '5g4';     // S jako 5
  w[6] = 'de';      // dxe5 zkráceně
  w[7] = 'S:f3';
  w[9] = 'de5';
  w[11] = 'Jf6';
  w[17] = '65';     // b5 jako 65
  w[22] = '000';    // dlouhá rošáda bez pomlček
  w[30] = 'Db8';
  const r = S.reconcile(plies(w), { Chess, lang: 'czech' });
  assert.equal(r.stoppedAt, -1);
  assert.deepEqual(r.plies.map(p => p.san), OPERA);
  assert.ok(r.plies[5].flagged, '5g4 má být označený jako nejistý');
  assert.ok(r.plies[17].flagged);
  assert.ok(!r.plies[0].flagged);
});

test('neznámý jazyk notace se pozná z legality', () => {
  const r = S.reconcile(plies(OPERA.map(toCzech)), { Chess });
  assert.deepEqual(r.plies.map(p => p.san), OPERA);
});

test('nejednoznačný tah figurou je označený', () => {
  const w = OPERA.map(toCzech);
  w[21] = 'Jd7'; // Jbd7 i Jfd7 jsou možné
  const r = S.reconcile(plies(w), { Chess, lang: 'czech' });
  assert.equal(r.stoppedAt, -1);
  assert.ok(r.plies[21].flagged);
  assert.ok(['Nbd7', 'Nfd7'].includes(r.plies[21].san));
  assert.ok(r.plies[21].options.some(o => o.san === 'Nbd7') && r.plies[21].options.some(o => o.san === 'Nfd7'));
});

test('Claudův odhad rozhodne nejednoznačnost', () => {
  const w = OPERA.map(toCzech);
  w[21] = 'Jd7';
  const r = S.reconcile(plies(w, OPERA), { Chess, lang: 'czech' });
  assert.equal(r.plies[21].san, 'Nbd7');
});

test('nesmyslný tah zastaví přepis a vynucená oprava pokračuje', () => {
  const w = OPERA.map(toCzech);
  w[12] = 'Kh8'; // bílý král na h8 nemůže
  const r = S.reconcile(plies(w), { Chess, lang: 'czech' });
  assert.equal(r.stoppedAt, 12);
  assert.deepEqual(r.plies.slice(0, 12).map(p => p.san), OPERA.slice(0, 12));
  assert.ok(r.plies[12].legal.includes('Qb3'));
  const r2 = S.reconcile(plies(w), { Chess, lang: 'czech', forced: { 12: 'Qb3' } });
  assert.equal(r2.stoppedAt, -1);
  assert.deepEqual(r2.plies.map(p => p.san), OPERA);
});

test('špatná ruční oprava zastaví přepis místo vymýšlení tahů', () => {
  // S Jfd7 zůstane jezdec na b8 a 12... Vd8 není možné
  const r = S.reconcile(plies(OPERA.map(toCzech)), { Chess, lang: 'czech', forced: { 21: 'Nfd7' } });
  assert.equal(r.plies[21].san, 'Nfd7');
  assert.equal(r.stoppedAt, 23);
});

test('přeskočený tah v partiáři se doplní jako prázdné místo', () => {
  const p = plies(OPERA.map(toCzech)).filter((x, i) => i !== 9);
  const ordered = S.orderPlies(p);
  assert.equal(ordered.length, OPERA.length);
  assert.ok(ordered[9].missing);
  const r = S.reconcile(ordered, { Chess, lang: 'czech' });
  assert.equal(r.stoppedAt, 9);
});

test('PGN', () => {
  const pgn = S.buildPgn({ white: 'Morphy, Paul', black: 'Duke Karl / Count Isouard', event: 'Paris', date: '2. 11. 1858', result: '1-0' }, OPERA);
  assert.match(pgn, /\[Date "1858\.11\.02"\]/);
  assert.match(pgn, /\[Result "1-0"\]/);
  assert.match(pgn, /17\. Rd8# 1-0\n$/);
  const g = new Chess();
  assert.ok(g.load_pgn(pgn));
  assert.equal(g.history().length, OPERA.length);
});

test('rychlost: 120 půltahů bez určeného jazyka', () => {
  const g = new Chess();
  const sans = [];
  // deterministická dlouhá partie: vždy první tah v abecedním pořadí, který nedává mat ani pat
  while (sans.length < 120 && !g.game_over()) {
    const m = g.moves().sort()[sans.length % 7] || g.moves()[0];
    g.move(m); sans.push(m);
  }
  const t = Date.now();
  const r = S.reconcile(plies(sans.map(toCzech)), { Chess });
  const ms = Date.now() - t;
  assert.deepEqual(r.plies.map(p => p.san), sans);
  assert.ok(ms < 5000, 'trvalo ' + ms + ' ms');
  console.log('120 půltahů:', ms, 'ms');
});

test('OCR: varianty typických záměn', () => {
  assert.equal(S.ocrVariants('√3')[0][0], 'J3');
  assert.equal(S.ocrVariants('S94')[0][0], 'Sg4');
  assert.ok(S.ocrVariants('ax&5').some(([v]) => v === 'axb5'));
});

test('OCR: chyby rozpoznávání se opraví podle pravidel', () => {
  const w = OPERA.map(toCzech);
  w[5] = 'S94'; w[17] = '65'; w[18] = 'Jx65'; w[19] = 'cx&5'; w[13] = 'De7\''; w[22] = '0-O-0';
  const p = plies(w).map(x => Object.assign(x, { ocr: true, confidence: 'low' }));
  const r = S.reconcile(p, { Chess, lang: 'czech' });
  assert.equal(r.stoppedAt, -1);
  assert.deepEqual(r.plies.map(x => x.san), OPERA);
  assert.ok(r.plies.filter(x => x.flagged).length <= 6, 'k ověření jen nejisté tahy');
});

test('OCR: statistika záměn doplní výchozí tabulku', () => {
  S.setOcrStats({ 'q': { 'g': 5 }, '6': { 'b': 3, '6': 1 } });
  assert.equal(S.ocrVariants('q4')[0][0], 'g4');
  assert.equal(S.ocrVariants('6')[0][0], 'b');
  S.setOcrStats({});
});

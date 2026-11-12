// Statistika chyb OCR: porovná, co Google Cloud Vision přečetl z fotky partiáře, se správnou partií.
//
// Do složky testdata/ dej dvojice se stejným názvem:  <název>.jpg|png|webp  a  <název>.pgn (správná partie).
// Spuštění:  node scripts/chyby.mjs [--jazyk czech] [--znovu]
//   - odpovědi OCR se ukládají do testdata/<název>.vision.json (každá fotka stojí 1 z 1000 bezplatných jednotek
//     měsíčně jen poprvé; --znovu je načte znovu),
//   - klíč: proměnná GOOGLE_VISION_KEY, nebo ho doplní síťová proxy prostředí,
//   - výsledek: nejčastější záměny znaků, data/zameny.json (pro scoresheet-core.js) a odhad,
//     kolik tahů by bylo nutné zadat ručně (u každé fotky se tabulka spočítá jen z ostatních fotek).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { Chess } = require('chess.js');
const S = require('../src/scoresheet-core.js');
const L = require('../src/ocr-layout.js');
const V = require('../src/vision-ocr.js');

const args = process.argv.slice(2);
const lang = args.includes('--jazyk') ? args[args.indexOf('--jazyk') + 1] : 'czech';
const DIR = 'testdata';
const ids = readdirSync(DIR).filter(f => f.endsWith('.pgn')).map(f => f.slice(0, -4))
  .filter(id => ['jpg', 'jpeg', 'png', 'webp'].some(e => existsSync(join(DIR, id + '.' + e))));
if (!ids.length) { console.log('V testdata/ není žádná dvojice fotka + PGN.'); process.exit(0); }

// Zápis tahu tak, jak ho hráči obvykle píšou (několik podob)
const LETTERS = { czech: { N: 'J', B: 'S', R: 'V', Q: 'D', K: 'K' }, english: { N: 'N', B: 'B', R: 'R', Q: 'Q', K: 'K' }, german: { N: 'S', B: 'L', R: 'T', Q: 'D', K: 'K' } }[lang] || {};
function writtenForms(san) {
  let t = san.replace(/[+#]/g, '').replace(/=/, '').replace(/[NBRQK]/g, c => LETTERS[c] || c);
  if (t === 'O-O') return ['0-0', '00', 'O-O'];
  if (t === 'O-O-O') return ['0-0-0', '000', 'O-O-O'];
  const forms = new Set([t, t.replace('x', ''), t.replace('x', ':')]);
  [...forms].forEach(f => { forms.add(f.replace(/^([A-Z])[a-h1-8](?=x?:?[a-h][1-8])/, '$1')); });
  return [...forms];
}
function align(a, b) { // a = OCR, b = skutečnost; vrací dvojice [přečteno, skutečnost]
  const n = a.length, m = b.length, d = [];
  for (let i = 0; i <= n; i++) { d.push([]); for (let j = 0; j <= m; j++) d[i][j] = i === 0 ? j : j === 0 ? i : 0; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const pairs = []; let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) { pairs.push([a[i - 1], b[j - 1]]); i--; j--; }
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { pairs.push([a[i - 1], '']); i--; }
    else { pairs.push(['', b[j - 1]]); j--; }
  }
  return { cost: d[n][m], pairs };
}

async function ocrOf(id) {
  const cache = join(DIR, id + '.vision.json');
  if (existsSync(cache) && !args.includes('--znovu')) return JSON.parse(readFileSync(cache, 'utf8'));
  const ext = ['jpg', 'jpeg', 'png', 'webp'].find(e => existsSync(join(DIR, id + '.' + e)));
  const r = await V.annotate(readFileSync(join(DIR, id + '.' + ext)).toString('base64'), { apiKey: process.env.GOOGLE_VISION_KEY });
  const json = { responses: [r] };
  writeFileSync(cache, JSON.stringify(json));
  return json;
}

const sheets = [];
for (const id of ids) {
  const g = new Chess();
  if (!g.load_pgn(readFileSync(join(DIR, id + '.pgn'), 'utf8'), { sloppy: true })) { console.log(id + ': PGN nejde načíst, přeskakuji.'); continue; }
  const truth = g.history();
  const lay = L.layout((await ocrOf(id)).responses[0]);
  const byKey = new Map(lay.plies.map(p => [p.move_number + p.color, p]));
  const counts = {}, missing = {};
  let exact = 0, read = 0, empty = 0;
  truth.forEach((san, i) => {
    const p = byKey.get((Math.floor(i / 2) + 1) + (i % 2 ? 'b' : 'w'));
    if (!p) { empty++; return; }
    read++;
    const best = writtenForms(san).map(f => align(p.written, f)).sort((x, y) => x.cost - y.cost)[0];
    if (best.cost === 0) exact++;
    best.pairs.forEach(([o, t]) => {
      if (o === '') { missing[t] = (missing[t] || 0) + 1; return; }
      counts[o] = counts[o] || {}; counts[o][t] = (counts[o][t] || 0) + 1;
    });
  });
  sheets.push({ id, truth, lay, counts, missing, exact, read, empty });
}

function sum(list) {
  const c = {};
  list.forEach(s => Object.keys(s.counts).forEach(o => Object.keys(s.counts[o]).forEach(t => { c[o] = c[o] || {}; c[o][t] = (c[o][t] || 0) + s.counts[o][t]; })));
  return c;
}
function simulate(sheet, stats) {
  S.setOcrStats(stats);
  const plies = S.orderPlies(sheet.lay.plies.map(p => Object.assign({}, p))).slice(0, sheet.truth.length);
  while (plies.length < sheet.truth.length) plies.push({ move_number: Math.floor(plies.length / 2) + 1, color: plies.length % 2 ? 'b' : 'w', written: '', san: '', alternatives: [], missing: true });
  const forced = {}; let fixes = 0, r;
  for (;;) {
    r = S.reconcile(plies, { Chess, lang, forced });
    if (r.stoppedAt < 0) break;
    forced[r.stoppedAt] = sheet.truth[r.stoppedAt]; fixes++;
  }
  const wrong = r.plies.filter((p, i) => p.san !== sheet.truth[i]);
  const flagged = r.plies.filter((p, i) => p.flagged && !forced[i]);
  return { fixes, wrong, flagged, wrongUnflagged: wrong.filter(p => !p.flagged) };
}

const all = sum(sheets);
console.log('Fotky:', sheets.length, '| jazyk notace:', lang);
sheets.forEach(s => {
  const loo = sum(sheets.filter(o => o !== s));
  const base = simulate(s, {});
  const tuned = simulate(s, loo);
  console.log('\n== ' + s.id);
  console.log('  půltahů ' + s.truth.length + ', OCR něco přečetlo u ' + s.read + ', přesně ' + s.exact + ', prázdných ' + s.empty);
  console.log('  ručně zadat: ' + base.fixes + ' s výchozí tabulkou záměn, ' + tuned.fixes + ' s tabulkou z ostatních fotek');
  console.log('  k ověření: ' + tuned.flagged.length + ', špatně vybráno: ' + tuned.wrong.length + ' (neoznačeno: ' + tuned.wrongUnflagged.length + ')');
  tuned.wrong.forEach(p => console.log('    ' + p.move_number + (p.color === 'w' ? '. ' : '… ') + p.san + ' místo ' + s.truth[p.index] + ' (OCR „' + p.written + '“)'));
});

console.log('\nNejčastější záměny (přečteno → skutečnost):');
const list = [];
Object.keys(all).forEach(o => Object.keys(all[o]).forEach(t => { if (o !== t) list.push([all[o][t], o, t]); }));
list.sort((a, b) => b[0] - a[0]).slice(0, 25).forEach(([n, o, t]) => console.log('  ' + String(n).padStart(3) + '×  „' + o + '“ → ' + (t ? '„' + t + '“' : 'nic (znak navíc)')));
const miss = {};
sheets.forEach(s => Object.keys(s.missing).forEach(t => { miss[t] = (miss[t] || 0) + s.missing[t]; }));
const ml = Object.entries(miss).sort((a, b) => b[1] - a[1]).slice(0, 8);
if (ml.length) console.log('Nepřečtené znaky: ' + ml.map(([t, n]) => '„' + t + '“ ' + n + '×').join(', '));

mkdirSync('data', { recursive: true });
writeFileSync('data/zameny.json', JSON.stringify({ popis: 'Statistika záměn Google Cloud Vision: přečteno -> skutečnost -> počet. Vytváří scripts/chyby.mjs.', jazyk: lang, fotek: sheets.length, zameny: all }, null, 1) + '\n');
console.log('\nUloženo do data/zameny.json');

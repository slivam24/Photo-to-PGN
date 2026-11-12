// Zkouška celé stránky v prohlížeči bez skutečného Claude API: odpověď API se nahradí připravenou.
// Spuštění: node scripts/e2e-mock.mjs [složka pro snímky]
// Ověří, že stránka pošle správný požadavek (model, obrázek, schéma) a z odpovědi složí platné PGN.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const outDir = process.argv[2] || 'scripts/out';
mkdirSync(outDir, { recursive: true });

// Partie Morphy – Brunšvik a Isouard v české notaci, s několika chybami, jaké dělá ruka nebo čtení
const OPERA = 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#'.split(' ');
const cz = s => s.replace(/[NBRQ]/g, c => ({ N: 'J', B: 'S', R: 'V', Q: 'D' })[c]).replace('O-O-O', '0-0-0');
const plies = OPERA.map((san, i) => ({ move_number: Math.floor(i / 2) + 1, color: i % 2 ? 'b' : 'w', written: cz(san), san, alternatives: [], confidence: 'high' }));
Object.assign(plies[5], { written: '5g4', confidence: 'medium', alternatives: ['Sg4'] });
Object.assign(plies[12], { written: 'Dh3', san: 'Qh3', confidence: 'low', alternatives: ['Db3'] }); // špatně přečteno, legalita to opraví
Object.assign(plies[21], { written: 'Jd7', confidence: 'medium' });
Object.assign(plies[25], { written: 'V:d7' });
const DATA = {
  headers: { white: 'Morphy, Paul', black: 'Brunšvik a Isouard', white_elo: '', black_elo: '', event: 'Pařížská opera', site: 'Paříž', date: '2. 11. 1858', round: '', result: '1-0' },
  notation: 'czech', plies, notes: 'Tah 7 bílého je špatně čitelný.'
};

function sse(text) {
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify(Object.assign({ type }, data))}\n\n`;
  let out = ev('message_start', { message: { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5200, output_tokens: 1 } } });
  out += ev('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } });
  out += ev('content_block_delta', { index: 0, delta: { type: 'signature_delta', signature: 'sig' } });
  out += ev('content_block_stop', { index: 0 });
  out += ev('content_block_start', { index: 1, content_block: { type: 'text', text: '' } });
  for (let i = 0; i < text.length; i += 500) out += ev('content_block_delta', { index: 1, delta: { type: 'text_delta', text: text.slice(i, i + 500) } });
  out += ev('content_block_stop', { index: 1 });
  out += ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 6100 } });
  out += ev('message_stop', {});
  return out;
}

// Malý server pro složku web/
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = join('web', decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html'));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Vyrobit „fotku“ partiáře na plátně (rukopisné písmo jen napodobené)
const sheet = await page.evaluate(({ moves }) => {
  const c = document.createElement('canvas'); c.width = 1240; c.height = 1754;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#222'; g.font = 'bold 44px serif'; g.fillText('PARTIÁŘ', 520, 90);
  g.font = '28px sans-serif'; g.fillText('Bílý:', 80, 170); g.fillText('Černý:', 80, 220); g.fillText('Turnaj:', 700, 170); g.fillText('Datum:', 700, 220);
  g.fillStyle = '#1b3fa0'; g.font = 'italic 34px "Comic Sans MS", cursive';
  g.fillText('Morphy', 180, 170); g.fillText('Brunšvik + Isouard', 190, 220); g.fillText('Opera Paříž', 820, 170); g.fillText('2.11.1858', 820, 220);
  g.strokeStyle = '#999'; g.lineWidth = 1.5;
  for (let r = 0; r <= 30; r++) { g.beginPath(); g.moveTo(80, 280 + r * 46); g.lineTo(1160, 280 + r * 46); g.stroke(); }
  [80, 140, 340, 540, 620, 680, 880, 1080, 1160].forEach(x => { g.beginPath(); g.moveTo(x, 280); g.lineTo(x, 280 + 30 * 46); g.stroke(); });
  g.fillStyle = '#444'; g.font = '22px sans-serif';
  for (let r = 0; r < 30; r++) { g.fillText(String(r + 1), 92, 313 + r * 46); g.fillText(String(r + 31), 632, 313 + r * 46); }
  g.fillStyle = '#1b3fa0'; g.font = 'italic 32px "Comic Sans MS", cursive';
  moves.forEach((m, i) => { const row = Math.floor(i / 2); g.fillText(m, i % 2 ? 360 : 160, 314 + row * 46 + (i % 3) - 1); });
  g.font = 'italic 40px "Comic Sans MS", cursive'; g.fillText('1 - 0', 900, 1740 - 40);
  return c.toDataURL('image/png').split(',')[1];
}, { moves: plies.map(p => p.written) });
const sheetPath = join(outDir, 'partiar-ukazka.png');
(await import('node:fs')).writeFileSync(sheetPath, Buffer.from(sheet, 'base64'));

let request = null;
await page.route('https://api.anthropic.com/**', async route => {
  const r = route.request();
  request = { url: r.url(), headers: r.headers(), body: JSON.parse(r.postData()) };
  await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: sse(JSON.stringify(DATA)) });
});

await page.goto(`http://localhost:${port}/`);
await page.fill('#apiKey', 'sk-ant-test');
await page.setInputFiles('#fileInput', sheetPath);
await page.waitForSelector('.thumb img');
await page.click('#readBtn');
await page.waitForSelector('#result:not([hidden])', { timeout: 20000 });

const check = (cond, msg) => { if (!cond) { console.error('CHYBA: ' + msg); process.exitCode = 1; } else console.log('ok  ' + msg); };
check(request && request.url.includes('/v1/messages'), 'požadavek na /v1/messages');
check(request.body.model === 'claude-opus-5-5', 'model claude-opus-5-5');
check(request.body.stream === true, 'streamování');
check((request.headers['anthropic-beta'] || '').includes('server-side-fallback-2026-07-01'), 'beta záhlaví fallbacku');
check(request.body.fallbacks === 'default', 'fallbacks: default');
check(request.headers['authorization'] === 'Bearer sk-ant-test' || request.headers['x-api-key'] === 'sk-ant-test', 'klíč v záhlaví požadavku');
check(request.body.output_config && request.body.output_config.format.type === 'json_schema', 'strukturovaný výstup');
check(request.body.thinking && request.body.thinking.type === 'adaptive', 'adaptivní přemýšlení');
const img = request.body.messages[0].content.find(c => c.type === 'image');
check(img && img.source.media_type === 'image/jpeg' && img.source.data.length > 10000, 'obrázek JPEG v požadavku');

let pgn = await page.inputValue('#pgnOut');
check(pgn.includes('[White "Morphy, Paul"]') && pgn.includes('[Date "1858.11.02"]'), 'hlavička v PGN');
check(/12\. O-O-O Rd8/.test(pgn), 'tahy v PGN');
check(pgn.includes('7. Qb3 Qe7'), 'špatně přečtené Dh3 opraveno na Qb3 podle pravidel');
check(pgn.trim().endsWith('17. Rd8# 1-0'), 'celá partie až do matu');
const flagged = await page.$$eval('.ss-mv.flag', els => els.length);
check(flagged >= 2, 'nejisté tahy zvýrazněné (' + flagged + ')');
await page.screenshot({ path: join(outDir, 'web-vysledek.png'), fullPage: true });

// Oprava tahu ručně: u 11... vybrat Jfd7 místo Jbd7
await page.click('.ss-mv[aria-label^="11. černý"]');
await page.selectOption('.ss-detail select', 'Nfd7');
pgn = await page.inputValue('#pgnOut');
check(pgn.includes('Nfd7'), 'ruční oprava se promítne do PGN');

// Mobilní šířka
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: join(outDir, 'web-mobil.png'), fullPage: false });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check(!overflow, 'na telefonu nic nepřetéká do strany');

check(!errors.length, 'bez chyb v konzoli' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
server.close();

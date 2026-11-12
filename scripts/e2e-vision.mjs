// Zkouška hlavní stránky (web/index.html) v prohlížeči bez volání Google Cloud Vision:
// odpověď Vision se nahradí uloženou skutečnou odpovědí z testdata/<název>.vision.json.
// Spuštění: node scripts/e2e-vision.mjs [složka pro snímky]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const outDir = process.argv[2] || 'scripts/out';
mkdirSync(outDir, { recursive: true });
const ID = 'pachman-vichorec-1963';
if (!existsSync(`testdata/${ID}.png`) || !existsSync(`testdata/${ID}.vision.json`)) { console.log('Chybí testdata/' + ID + '.png nebo .vision.json, zkouška se přeskakuje.'); process.exit(0); }
const vision = readFileSync(`testdata/${ID}.vision.json`, 'utf8');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = join('web', decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html'));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
let request = null;
await page.route('https://vision.googleapis.com/**', async route => {
  request = { headers: route.request().headers(), body: JSON.parse(route.request().postData()) };
  await route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: vision });
});
await page.goto(`http://localhost:${server.address().port}/`);
await page.fill('#apiKey', 'AIza-test');
await page.setInputFiles('#fileInput', `testdata/${ID}.png`);
await page.waitForSelector('.thumb img');
await page.click('#readBtn');
await page.waitForSelector('#result:not([hidden])', { timeout: 20000 });

const check = (cond, msg) => { if (!cond) { console.error('CHYBA: ' + msg); process.exitCode = 1; } else console.log('ok  ' + msg); };
check(request.headers['x-goog-api-key'] === 'AIza-test', 'klíč v záhlaví X-Goog-Api-Key');
check(request.body.requests[0].features[0].type === 'DOCUMENT_TEXT_DETECTION', 'rozpoznání ručně psaného textu');
const img = request.body.requests[0].image.content;
check(img && img.length > 100000, 'malá fotka se před odesláním zvětšila');
let pgn = await page.inputValue('#pgnOut');
check(pgn.startsWith('[Event') && pgn.includes('1. e4 e5 2. f4 Nc6'), 'začátek partie');
check(pgn.includes('[Date "1963.06.09"]'), 'datum z hlavičky');
check(pgn.includes('Nepřečteno, doplnit ručně: 3. √3'), 'zbytek zápisu jako komentář k doplnění');
await page.screenshot({ path: join(outDir, 'vision-zastaveno.png'), fullPage: true });

// Uživatel opraví 3. tah a přepis pokračuje
await page.selectOption('.ss-detail select', 'Nf3');
pgn = await page.inputValue('#pgnOut');
const moves = (pgn.split('\n\n')[1] || '').split(/\s+/).filter(t => /^[a-hKQRBNO]/.test(t)).length;
check(moves > 10, 'po opravě 3. tahu pokračuje přepis dál (' + moves + ' půltahů)');
await page.screenshot({ path: join(outDir, 'vision-po-oprave.png'), fullPage: true });
check(!errors.length, 'bez chyb v konzoli' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
server.close();

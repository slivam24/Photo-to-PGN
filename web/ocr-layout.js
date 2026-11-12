/*
 * Photo-to-PGN: rozložení partiáře z výsledku OCR (Google Cloud Vision).
 *
 * OCR vrací jen znaky a jejich polohu na fotce. Tady se z toho pozná, který zápis patří
 * ke kterému tahu a barvě. Využívá se to, co OCR čte spolehlivě, protože je to vytištěné:
 *  - čísla tahů (1, 2, 3 … 40) v číselných sloupcích dají polohu řádků,
 *  - nadpisy sloupců (Bílý / Černý, White / Black, Weiss / Schwarz) dají polohu sloupců.
 * Funguje tak pro české formuláře (číslo vlevo, pak bílý a černý) i pro formuláře s číslem
 * uprostřed (bílý vlevo, černý vpravo).
 *
 * Licence: GNU GPL 3 nebo novější.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OcrLayout = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const strip = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function lev(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i++) { d.push([i]); for (let j = 1; j <= b.length; j++) d[i][j] = i ? 0 : j; }
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  const WHITE = ['bily', 'white', 'weiss', 'biale', 'feher', 'blancs'];
  const BLACK = ['cerny', 'black', 'schwarz', 'czarne', 'fekete', 'noirs'];
  function labelKind(text) {
    const t = strip(text).replace(/[^a-z]/g, '');
    if (t.length < 4 || t.length > 8) return null;
    const dist = list => Math.min(...list.map(w => lev(t, w) - (w.length > 4 ? 2 : 1)));
    const dw = dist(WHITE), db = dist(BLACK);
    if (Math.min(dw, db) > 0 || dw === db) return null;
    return dw < db ? 'w' : 'b';
  }

  function boxOf(bb) {
    const v = (bb.vertices || []).map(q => ({ x: q.x || 0, y: q.y || 0 }));
    const xs = v.map(q => q.x), ys = v.map(q => q.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  }

  /** Slova a znaky z odpovědi Vision (images:annotate, DOCUMENT_TEXT_DETECTION). */
  function wordsFrom(response) {
    const words = [];
    const fta = response && response.fullTextAnnotation;
    if (!fta) return words;
    fta.pages.forEach(page => page.blocks.forEach(b => b.paragraphs.forEach(p => p.words.forEach(w => {
      const symbols = w.symbols.map(s => Object.assign(boxOf(s.boundingBox), { t: s.text, conf: s.confidence == null ? 1 : s.confidence }));
      words.push(Object.assign(boxOf(w.boundingBox), { text: symbols.map(s => s.t).join(''), symbols, conf: w.confidence == null ? 1 : w.confidence }));
    }))));
    return words;
  }

  /* ---------- Číselné sloupce: řádky tahů ---------- */

  // Kandidáti na vytištěná čísla tahů: samostatná čísla 1–99, nebo číslo na začátku slova ("2f4")
  function numberTokens(words) {
    const out = [];
    words.forEach(w => {
      const m = w.text.match(/^(\d{1,2})(?=\D|$)/);
      if (!m) return;
      const n = +m[1];
      if (n < 1 || n > 99) return;
      const syms = w.symbols.slice(0, m[1].length);
      const b = { x0: Math.min(...syms.map(s => s.x0)), x1: Math.max(...syms.map(s => s.x1)), y0: Math.min(...syms.map(s => s.y0)), y1: Math.max(...syms.map(s => s.y1)) };
      out.push({ n, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, x0: b.x0, x1: b.x1, h: b.y1 - b.y0, pure: m[1].length === w.text.length, word: w, len: m[1].length });
    });
    return out;
  }

  // Najde sloupce s čísly tahů: přímka y = a + b·n, na které leží aspoň 5 čísel
  function findNumberColumns(tokens) {
    const cols = [];
    let rest = tokens.slice();
    for (let guard = 0; guard < 6 && rest.length >= 5; guard++) {
      let best = null;
      for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
        const p = rest[i], q = rest[j];
        if (p.n === q.n || Math.abs(p.cx - q.cx) > 3 * Math.max(p.h, q.h, 8)) continue;
        const b = (q.cy - p.cy) / (q.n - p.n);
        if (b < 4) continue; // řádky jdou shora dolů a mají nějakou výšku
        const a = p.cy - b * p.n;
        const xs = (p.cx + q.cx) / 2;
        const inl = rest.filter(t => Math.abs(a + b * t.n - t.cy) < 0.3 * b && Math.abs(t.cx - xs) < Math.max(2.5 * b, 30));
        // jedno číslo na řádek
        const uniq = new Set(inl.map(t => t.n));
        if (uniq.size >= 5 && (!best || uniq.size > best.count || (uniq.size === best.count && inl.filter(t => t.pure).length > best.pure)))
          best = { a, b, count: uniq.size, pure: inl.filter(t => t.pure).length, inl };
      }
      if (!best) break;
      // zpřesnit přímku metodou nejmenších čtverců
      const ins = best.inl;
      const mn = ins.reduce((s, t) => s + t.n, 0) / ins.length, my = ins.reduce((s, t) => s + t.cy, 0) / ins.length;
      const sxx = ins.reduce((s, t) => s + (t.n - mn) ** 2, 0), sxy = ins.reduce((s, t) => s + (t.n - mn) * (t.cy - my), 0);
      const b = sxx ? sxy / sxx : best.b, a = my - b * mn;
      const ns = ins.map(t => t.n);
      let from = Math.min(...ns), to = Math.max(...ns);
      // Formuláře mají bloky po 10 řádcích (1–20, 21–40, 1–30 …); doplnit nepřečtená čísla na okrajích
      from = Math.floor((from - 1) / 10) * 10 + 1;
      to = Math.ceil(to / 10) * 10;
      const xs = ins.map(t => t.cx).sort((p, q) => p - q);
      cols.push({ a, b, from, to, x: xs[Math.floor(xs.length / 2)], x0: Math.min(...ins.map(t => t.x0)), x1: Math.max(...ins.map(t => t.x1)), tokens: ins });
      rest = rest.filter(t => !ins.includes(t));
    }
    // Překrývající se rozsahy čísel: nechat sloupec s více nalezenými čísly
    cols.sort((p, q) => q.tokens.length - p.tokens.length);
    const kept = [];
    cols.forEach(c => { if (!kept.some(k => c.from <= k.to && k.from <= c.to)) kept.push(c); });
    return kept.sort((p, q) => p.from - q.from);
  }

  /* ---------- Sloupce bílý / černý ---------- */

  function findLabels(words) {
    return words.map(w => ({ w, kind: labelKind(w.text) })).filter(x => x.kind).map(x => Object.assign({}, x.w, { kind: x.kind }));
  }

  // Ke každému číselnému sloupci najde dvojici nadpisů Bílý a Černý těsně nad tabulkou
  function assignColumns(numCols, labels) {
    const used = new Set();
    numCols.forEach(c => {
      const top = c.a + c.b * c.from;
      const near = labels.filter(l => l.cy < top - 0.3 * c.b && l.cy > top - 3.5 * c.b && !used.has(l));
      const others = numCols.filter(o => o !== c).map(o => o.x);
      let best = null;
      near.filter(l => l.kind === 'w').forEach(w => near.filter(l => l.kind === 'b').forEach(b => {
        if (b.cx <= w.cx || Math.abs(w.cy - b.cy) > 0.8 * c.b) return;
        const lo = Math.min(w.cx, c.x), hi = Math.max(b.cx, c.x);
        if (others.some(ox => ox > lo && ox < hi)) return;
        const score = Math.abs(w.cx - c.x) + Math.abs(b.cx - c.x) + 2 * (top - Math.max(w.cy, b.cy));
        if (!best || score < best.score) best = { w, b, score };
      }));
      if (best) { used.add(best.w); used.add(best.b); c.white = best.w.cx; c.black = best.b.cx; return; }
      // Bez nadpisů: běžný český formulář, bílý a černý vpravo od čísla, každý zhruba stejně široký
      const next = others.filter(ox => ox > c.x).sort((p, q) => p - q)[0];
      const width = next ? (next - c.x1) / 2 : Math.max(c.b * 4, 60);
      c.white = c.x1 + width / 2; c.black = c.x1 + width * 1.5;
      c.guessed = true;
    });
    return numCols;
  }

  /**
   * Hlavní funkce: z odpovědi Vision vytvoří půltahy { move_number, color, written, confidence }.
   * Vrací { plies, columns, headers, words }.
   */
  function layout(response) {
    const words = wordsFrom(response);
    const numCols = assignColumns(findNumberColumns(numberTokens(words)), findLabels(words));
    if (!numCols.length) return { plies: [], columns: [], headers: headerInfo(words, null), words, error: 'Na fotce se nepodařilo najít čísla tahů.' };
    const numberSyms = new Set();
    numCols.forEach(c => c.tokens.forEach(t => t.word.symbols.slice(0, t.len).forEach(s => numberSyms.add(s))));
    const tableTop = Math.min(...numCols.map(c => c.a + c.b * (c.from - 0.5)));
    const tableBottom = Math.max(...numCols.map(c => c.a + c.b * (c.to + 0.5)));
    const labelWords = new Set(findLabels(words).map(l => l.text + '@' + l.cx + ',' + l.cy));
    // Geometrie pro šikmou nebo perspektivně zkreslenou fotku:
    //  - sklon sloupců: poloha čísla tahu ve sloupci x = xc + xd·n,
    //  - sklon řádků: řádek k v levém bloku a řádek k v pravém bloku leží na stejné tištěné čáře.
    numCols.forEach(c => {
      const ts = c.tokens, mn = ts.reduce((a, t) => a + t.n, 0) / ts.length, mx = ts.reduce((a, t) => a + t.cx, 0) / ts.length;
      const sxx = ts.reduce((a, t) => a + (t.n - mn) ** 2, 0);
      c.xd = sxx ? ts.reduce((a, t) => a + (t.n - mn) * (t.cx - mx), 0) / sxx : 0;
      c.xc = mx - c.xd * mn;
    });
    const numX = (c, n) => c.xc + c.xd * n;
    const numY = (c, n) => c.a + c.b * n;
    function slopeAt(c, n) {
      const k = n - c.from;
      const partners = numCols.filter(p => p !== c && p.to - p.from === c.to - c.from);
      if (!partners.length) return globalSlope;
      const p = partners.sort((u, v) => Math.abs(numX(v, v.from) - numX(c, c.from)) - Math.abs(numX(u, u.from) - numX(c, c.from)))[0];
      const m = p.from + k, dx = numX(p, m) - numX(c, n);
      return Math.abs(dx) > 1 ? (numY(p, m) - numY(c, n)) / dx : 0;
    }
    let globalSlope = 0;
    globalSlope = numCols.length > 1 ? slopeAt(numCols[0], numCols[0].from + Math.round((numCols[0].to - numCols[0].from) / 2)) : 0;
    const rowY = (c, n, x) => numY(c, n) + slopeAt(c, n) * (x - numX(c, n));
    const colX = (c, x0, n) => x0 + c.xd * (n - (c.from - 1));

    const cells = new Map();
    words.forEach(w => {
      if (labelWords.has(w.text + '@' + w.cx + ',' + w.cy)) return;
      w.symbols.forEach(s => {
        if (numberSyms.has(s)) return;
        // číslice v kterémkoli číselném sloupci je vytištěné číslo tahu
        if (/\d/.test(s.t) && numCols.some(c => { const n = Math.round((s.cy - c.a) / c.b), x = numX(c, n), half = (c.x1 - c.x0) / 2 + 0.3 * c.b; return Math.abs(s.cx - x) < half; })) return;
        // nejbližší řádek a sloupec bílý/černý ze všech bloků
        let best = null;
        numCols.forEach(c => {
          let n0 = Math.round((s.cy - c.a) / c.b), n = null, dy = Infinity;
          for (let k = n0 - 2; k <= n0 + 2; k++) {
            const d = Math.abs(s.cy - rowY(c, k, s.cx));
            if (d < dy) { dy = d; n = k; }
          }
          if (n < c.from || n > c.to || dy > 0.75 * c.b) return;
          [['w', colX(c, c.white, n)], ['b', colX(c, c.black, n)]].forEach(([color, x]) => {
            const d = Math.abs(s.cx - x);
            if (!best || d < best.d) best = { d, n, color };
          });
        });
        if (!best) return;
        const key = best.n + best.color;
        if (!cells.has(key)) cells.set(key, { move_number: best.n, color: best.color, syms: [] });
        cells.get(key).syms.push(s);
      });
    });
    const plies = [...cells.values()].map(c => {
      c.syms.sort((p, q) => p.cx - q.cx);
      const text = c.syms.map(s => s.t).join('');
      const conf = Math.min(...c.syms.map(s => s.conf));
      return { move_number: c.move_number, color: c.color, written: text, san: '', alternatives: [], ocr: true, ocrConfidence: Math.round(conf * 100) / 100,
        confidence: conf > 0.85 ? 'high' : conf > 0.6 ? 'medium' : 'low' };
    }).filter(p => /[a-h1-8]/i.test(p.written) || /^[0O]/.test(p.written))
      .sort((p, q) => p.move_number - q.move_number || (p.color === 'w' ? -1 : 1));
    return { plies, columns: numCols.map(c => ({ from: c.from, to: c.to, x: c.x, rowHeight: c.b, white: c.white, black: c.black, guessed: !!c.guessed })),
      headers: headerInfo(words, tableTop), result: resultInfo(words, tableBottom, numCols), words };
  }

  /* ---------- Hlavička partie ---------- */

  const HEAD = [
    ['white', /^(b[ií]l[ýy]|white|weiss)/i],
    ['black', /^([čc]ern[ýy]|black|schwarz)/i],
    ['event', /^(turnaj|tournament|turnier|event)/i],
    ['site', /^(m[ií]sto|site|ort)/i],
    ['date', /^(datum|date)/i],
    ['round', /^(kolo|round|runde)/i]
  ];
  function headerInfo(words, tableTop) {
    const area = words.filter(w => tableTop == null || w.cy < tableTop);
    const lines = [];
    area.slice().sort((p, q) => p.cy - q.cy).forEach(w => {
      const line = lines.find(l => Math.abs(l.cy - w.cy) < Math.max(l.h, w.h) * 0.6);
      if (line) { line.words.push(w); line.cy = (line.cy * (line.words.length - 1) + w.cy) / line.words.length; }
      else lines.push({ cy: w.cy, h: w.h, words: [w] });
    });
    const out = {};
    lines.forEach(l => {
      l.words.sort((p, q) => p.cx - q.cx);
      let cur = null;
      l.words.forEach(w => {
        const t = w.text.replace(/[.:…_-]+$/, '');
        const kind = labelKind(t);
        const lab = (kind ? [kind === 'w' ? 'white' : 'black'] : null) || HEAD.find(([, re]) => re.test(t)) ||
          (/^(výk|vyk|elo|třída|trida|utk[aá]n[ií]|mr)$/i.test(strip(t)) || /^(výk|vyk)/i.test(t) ? ['skip'] : null);
        // spojky a části nadpisů ("Místo a datum", "Turnaj - zápas")
        if (/^(a|-|–|,|z[aá]pas|match)$/i.test(t)) return;
        if (lab) { cur = lab[0]; return; }
        if (!cur || cur === 'skip' || /^[.:…_-]+$/.test(w.text)) return;
        if (out[cur] && out[cur].done) return;
        out[cur] = out[cur] || { text: '' };
        out[cur].text += (out[cur].text ? ' ' : '') + w.text.replace(/^[.:…]+|[.…]+$/g, '');
      });
      Object.values(out).forEach(v => { v.done = true; });
    });
    const h = {};
    Object.keys(out).forEach(k => { const v = out[k].text.trim().replace(/^[,.\s]+|[,.\s]+$/g, ''); if ((v.match(/\p{L}/gu) || []).length >= 2 || /\d/.test(v)) h[k] = v; });
    const all = area.map(w => w.text).join(' ');
    const dm = all.match(/(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})/);
    if (dm) h.date = dm[3] + '.' + dm[2].padStart(2, '0') + '.' + dm[1].padStart(2, '0');
    else if (h.date && !/\d/.test(h.date)) delete h.date;
    return h;
  }
  // Výsledek zapsaný rukou v tabulce ("bílý vzdal", "1-0"); vytištěné volby pod tabulkou se nepočítají
  function resultInfo(words, tableBottom, numCols) {
    const top = Math.min(...numCols.map(c => c.a + c.b * (c.from - 0.5)));
    const txt = strip(words.filter(w => w.cy > top && w.cy < tableBottom).map(w => w.text).join(' '));
    if (/bil[yý]\s*v?zdal|white\s*resign/.test(txt)) return '0-1';
    if (/[cč]ern[yý]\s*v?zdal|black\s*resign/.test(txt)) return '1-0';
    return '';
  }

  return { wordsFrom, layout, labelKind };
});

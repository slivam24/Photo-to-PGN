/*
 * Photo-to-PGN: rozpoznání textu z fotky přes Google Cloud Vision (DOCUMENT_TEXT_DETECTION).
 * Prvních 1000 fotek měsíčně je zdarma. Klíč si každý zakládá sám v Google Cloud.
 *
 * Funguje v prohlížeči (window.VisionOcr) i v Node.js 18+ (require).
 * Licence: GNU GPL 3 nebo novější.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VisionOcr = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const URL_ANNOTATE = 'https://vision.googleapis.com/v1/images:annotate';

  function friendly(status, err) {
    const msg = (err && err.message) || '';
    if (status === 400 && /API key not valid/i.test(msg)) return 'Klíč ke Google Cloud Vision není platný. Zkontroluj ho v nastavení.';
    if (status === 403 && /billing/i.test(msg)) return 'Google Cloud Vision vyžaduje připojený platební účet (prvních 1000 fotek měsíčně je zdarma).';
    if (status === 403 && /(not been used|disabled)/i.test(msg)) return 'V Google Cloud není zapnuté Cloud Vision API.';
    if (status === 403) return 'Google Cloud Vision přístup odmítl: ' + msg;
    if (status === 429) return 'Překročen limit požadavků u Google Cloud Vision. Zkus to později.';
    return 'Chyba Google Cloud Vision (' + status + '): ' + (msg || 'neznámá');
  }

  /**
   * Pošle obrázek (base64 bez hlavičky data:) a vrátí odpověď pro jeden obrázek
   * (s fullTextAnnotation). opts: { apiKey, signal, languageHints }
   */
  async function annotate(base64, opts) {
    opts = opts || {};
    const headers = { 'Content-Type': 'application/json' };
    if (opts.apiKey) headers['X-Goog-Api-Key'] = opts.apiKey.trim();
    const body = {
      requests: [{
        image: { content: base64 },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        imageContext: { languageHints: opts.languageHints || ['cs', 'en'] }
      }]
    };
    let res;
    try {
      res = await fetch(URL_ANNOTATE, { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal });
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('Čtení zrušeno.');
      throw new Error('Nepodařilo se spojit s Google Cloud Vision. Je zařízení připojené k internetu?');
    }
    let json = null;
    try { json = await res.json(); } catch (e) { /* prázdná odpověď */ }
    if (!res.ok) throw new Error(friendly(res.status, json && json.error));
    const r = json && json.responses && json.responses[0];
    if (!r) throw new Error('Google Cloud Vision nevrátil žádný výsledek.');
    if (r.error) throw new Error(friendly(r.error.code || 400, r.error));
    return r;
  }

  /**
   * Připraví fotku v prohlížeči: malé fotky zvětší (OCR pak čte rukopis výrazně lépe),
   * velké zmenší. Vrací { data (base64 JPEG), preview (data URL), width, height, name }.
   */
  async function prepareImage(file, opts) {
    opts = opts || {};
    const target = opts.target || 2400, max = opts.max || 3200;
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('Obrázek se nepodařilo otevřít.'));
        i.src = url;
      });
      const w = img.naturalWidth, h = img.naturalHeight, long = Math.max(w, h);
      const scale = long < target ? target / long : long > max ? max / long : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const preview = canvas.toDataURL('image/jpeg', 0.92);
      return { data: preview.split(',')[1], preview, width: canvas.width, height: canvas.height, name: file.name || 'partiar' };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return { annotate, prepareImage };
});

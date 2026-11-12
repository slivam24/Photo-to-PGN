# Photo-to-PGN

Přepis šachového partiáře z fotky nebo skenu do PGN.

Ručně psaný partiář přečte **Claude** (Claude API od Anthropicu, model Claude Opus 5.5). Rukopis je ale často nejednoznačný (S a 5, b a 6, 1 a 7, chybějící braní, přeskočený řádek), proto aplikace výsledek nebere naslepo: každý přečtený tah porovná se všemi tahy, které jsou v dané pozici podle pravidel možné, a vybere posloupnost **legálních** tahů, která přečtenému textu odpovídá nejlépe. Nejistá místa označí a nechá člověka rozhodnout.

## Jak to funguje

1. **Příprava fotky** (`src/scoresheet-reader.js`): fotka se zmenší na nejvyšší rozlišení, které model využije (2576 px na delší straně), PDF se pošle beze změny. Až 4 strany najednou.
2. **Čtení** (`src/scoresheet-reader.js`): Claude dostane fotku a návod a vrátí strukturovanou odpověď (JSON schema): hlavičku (hráči, turnaj, datum, kolo, výsledek), jazyk notace a pro každý půltah
   - `written` – přesně co je napsané (česky `Jf3`, `S:c4`, `0-0`…),
   - `san` – Claudův výklad v anglické notaci, ověřený přehráním partie,
   - `alternatives` – jiná možná čtení rukopisu,
   - `confidence` – jak jisté čtení je.
3. **Kontrola podle pravidel** (`src/scoresheet-core.js`): pro každý půltah se ohodnotí všechny legální tahy podle podobnosti se zápisem (zná české, slovenské, anglické, německé, polské, maďarské, francouzské, španělské, italské, nizozemské a ruské značky figur, figurky ♘, dlouhou notaci `e2-e4`, zkrácené braní `ed`, chybějící rozlišení `Jd7` × `Jbd7`, typické záměny znaků v rukopisu). Prohledávání s několika souběžnými variantami (beam search) pak vybere nejpravděpodobnější celou partii. Když zápis neodpovídá žádnému možnému tahu, přepis se zastaví a zeptá se – nevymýšlí si.
4. **Oprava** (`src/scoresheet-review.js`): seznam tahů se zvýrazněnými nejistými místy. Po klepnutí na tah se ukáže pozice před tahem, co je na papíře a možné tahy k výběru. Každá oprava znovu přepočítá zbytek partie.

Příklad z testu: Claude přečte 7. tah bílého jako `Dh3` (s nízkou jistotou, alternativa `Db3`). Oba tahy jsou možné, ale v 16. tahu `Db8+` se dáma z h3 na b8 nedostane, takže kontrola sama vybere `Db3` a tah označí k ověření.

## Použití

Samostatná webová stránka je ve složce `web/` (stačí ji otevřít přes libovolný webový server, třeba GitHub Pages). Potřebuje vlastní klíč k Claude API ([platform.claude.com](https://platform.claude.com/settings/keys)), který zůstává jen v prohlížeči a posílá se přímo do Claude API. Přečtení jednoho partiáře stojí obvykle 0,10 až 0,30 USD.

Stejné soubory používá [PGN editor](https://github.com/slivam24/pgn-editor) (menu **Partie z fotky partiáře**).

## Vývoj

```bash
npm install
```

```bash
npm test
```

```bash
npm run build
```

```bash
node scripts/e2e-mock.mjs
```

- `npm test` – testy kontroly tahů (Node.js, bez internetu).
- `npm run build` – sestaví `vendor/anthropic-sdk.js` (Anthropic TypeScript SDK pro prohlížeč, globální `AnthropicSDK`) a zkopíruje soubory do `web/`.
- `scripts/e2e-mock.mjs` – zkouška celé stránky v prohlížeči (Playwright), odpověď API je napodobená. Ověří požadavek (model, obrázek, schéma) i výsledné PGN a uloží snímky obrazovky do `scripts/out/`.

| Soubor | K čemu je |
|---|---|
| `src/scoresheet-core.js` | převod zápisu na legální tahy, hledání nejlepší partie, PGN |
| `src/scoresheet-reader.js` | příprava fotek a volání Claude API |
| `src/scoresheet-review.js` | kontrola a oprava přečtených tahů (komponenta pro stránku) |
| `vendor/anthropic-sdk.js` | Anthropic TypeScript SDK 1.3.0 sestavené pro prohlížeč |
| `web/` | samostatná stránka |
| `test/` | testy |

## Licence

GNU GPL 3 nebo novější. Anthropic TypeScript SDK je pod licencí Apache 2.0 (`vendor/anthropic-sdk-LICENSE.txt`), chess.js pod licencí BSD.

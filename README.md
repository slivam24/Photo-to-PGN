# Photo-to-PGN

Přepis šachového partiáře z fotky do PGN.

Hlavní verze (`web/index.html`) je **zdarma**: text z fotky rozpozná **Google Cloud Vision** (prvních 1000 fotek měsíčně zdarma) a aplikace ho sama přiřadí k tahům a ověří podle pravidel šachu. Co nejde přečíst, doplníš ručně. Zbytek zápisu je v PGN jako komentář, takže partii dokončíš v editoru.

Starší verze s čtením přes Claude API (`web/claude.html`) čte rukopis výrazně lépe, ale je placená (kolem 0,10 až 0,30 USD za partiář).

## Jak funguje verze zdarma (Google Cloud Vision)

1. **Příprava fotky** (`src/vision-ocr.js`): malé fotky se zvětší na 2400 px na delší straně. OCR pak čte rukopis znatelně lépe a stojí to pořád jen 1 jednotku z 1000.
2. **Rozpoznání textu** (`src/vision-ocr.js`): Google Cloud Vision, režim pro ručně psaný text (DOCUMENT_TEXT_DETECTION). Vrátí znaky a jejich polohu na fotce.
3. **Rozložení partiáře** (`src/ocr-layout.js`): podle vytištěných čísel tahů (1–40) se najdou řádky, podle nadpisů Bílý/Černý (White/Black…) sloupce. Funguje pro české formuláře i pro formuláře s číslem uprostřed. Z hlavičky se přečtou hráči, turnaj a datum, z tabulky případně „bílý vzdal“.
4. **Typické záměny OCR** (`src/scoresheet-core.js`, `data/zameny.json`): OCR čte například „g“ jako „9“, „b“ jako „6“, „J“ jako „√“, „d“ jako „α“. Ke každému přečtenému textu se vyzkoušejí i znění s těmito záměnami. Výchozí tabulku zpřesňuje statistika z fotek se známou partií (viz níže).
5. **Kontrola podle pravidel** (`src/scoresheet-core.js`): každý zápis se porovná s tahy, které jsou v pozici možné, a vybere se nejpravděpodobnější celá partie. Kde zápis neodpovídá žádnému možnému tahu (nebo je políčko prázdné), přepis se zastaví a zeptá. Po ruční opravě pokračuje dál.

### Statistika chyb OCR

Do složky `testdata/` dej fotku partiáře a správnou partii se stejným názvem (`partie.jpg` + `partie.pgn`) a spusť:

```bash
node scripts/chyby.mjs
```

Nástroj pošle nové fotky do Google Cloud Vision (klíč v proměnné `GOOGLE_VISION_KEY`; odpověď uloží, takže každá fotka stojí 1 jednotku jen jednou), vypíše nejčastější záměny znaků, uloží je do `data/zameny.json` a změří, kolik tahů by bylo nutné zadat ručně. U každé fotky počítá tabulku jen z ostatních fotek, aby výsledek nebyl přikrášlený. Fotky a odpovědi OCR se do repozitáře nedávají, jen PGN.

Výsledek na partiáři Pachman – Vichorec (1963, úhledné písmo, 60 půltahů): OCR přečetlo přesně 30 tahů, po kontrole podle pravidel je potřeba ručně zadat 7 tahů (z toho 3 prázdná políčka), 8 tahů je označených k ověření a žádný není vybraný špatně. U hůř čitelného rukopisu je ručních oprav výrazně víc.

## Jak funguje verze s Claudem

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

Stránky jsou ve složce `web/` (stačí je otevřít přes libovolný webový server, třeba GitHub Pages).

- `web/index.html` potřebuje klíč ke Google Cloud Vision (Google Cloud: projekt s platebním účtem, zapnuté Cloud Vision API, API klíč omezený na Cloud Vision API). Prvních 1000 fotek měsíčně je zdarma.
- `web/claude.html` potřebuje klíč k Claude API ([platform.claude.com](https://platform.claude.com/settings/keys)).

Klíče zůstávají jen v prohlížeči. Verzi s Claudem zatím používá [PGN editor](https://github.com/slivam24/pgn-editor) (menu **Partie z fotky partiáře**).

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
- `scripts/e2e-vision.mjs` – zkouška hlavní stránky v prohlížeči (Playwright) s uloženou odpovědí Google Cloud Vision z `testdata/`.
- `scripts/e2e-mock.mjs` – zkouška stránky s Claudem, odpověď API je napodobená.
- `scripts/chyby.mjs` – statistika chyb OCR (viz výše).

| Soubor | K čemu je |
|---|---|
| `src/scoresheet-core.js` | převod zápisu na legální tahy, typické záměny OCR, hledání nejlepší partie, PGN |
| `src/vision-ocr.js` | příprava fotky a volání Google Cloud Vision |
| `src/ocr-layout.js` | rozložení partiáře z výsledku OCR (řádky, sloupce, hlavička) |
| `data/zameny.json` | statistika záměn OCR |
| `testdata/` | správné partie k testovacím fotkám (fotky jen lokálně) |
| `src/scoresheet-reader.js` | příprava fotek a volání Claude API |
| `src/scoresheet-review.js` | kontrola a oprava přečtených tahů (komponenta pro stránku) |
| `vendor/anthropic-sdk.js` | Anthropic TypeScript SDK 1.3.0 sestavené pro prohlížeč |
| `web/` | stránky (`index.html` Google Cloud Vision, `claude.html` Claude API) |
| `test/` | testy |

## Licence

GNU GPL 3 nebo novější. Anthropic TypeScript SDK je pod licencí Apache 2.0 (`vendor/anthropic-sdk-LICENSE.txt`), chess.js pod licencí BSD.

# Photo-to-PGN

Partie z fotky partiáře. Claude (umělá inteligence od Anthropicu) přečte fotku nebo PDF zapsaného šachového partiáře, každý tah se ověří podle pravidel a nejistá místa se ukážou ke kontrole. Výsledkem je partie ve formátu PGN, kterou jde zkopírovat nebo stáhnout jako soubor `.pgn`.

Je to jedna samostatná webová stránka, nic se neinstaluje a nepotřebuje žádný server. Potřebuje internet a vlastní klíč k Claude API.

## Jak to vyzkoušet

Otevři `index.html` v prohlížeči. Stránka se dá taky zveřejnit přes GitHub Pages (Settings → Pages → větev `main`, složka `/`), pak funguje i v telefonu včetně focení.

1. Vlož klíč k Claude API. Získáš ho na platform.claude.com (Settings, API keys). Klíč se uloží jen v tomto prohlížeči.
2. Vyfoť partiář, nebo vyber fotku či PDF. Soubory jde i přetáhnout nebo vložit ze schránky. Najednou nejvýš 4 strany.
3. Klepni na **Přečíst partiář**. Přečtení jednoho partiáře stojí obvykle 0,10 až 0,30 USD.
4. Zkontroluj zvýrazněné tahy. Po klepnutí na tah se ukáže pozice před tahem, co je na papíře, a možné tahy k výběru. Každá oprava znovu přepočítá zbytek partie.
5. Zkopíruj nebo stáhni PGN.

## Jak to funguje

Claude z fotky přečte, co je u každého tahu napsáno, a k tomu svůj odhad tahu. Ručně psaný zápis ale bývá nejednoznačný (S a 5, b a 6, chybějící braní, přeskočený tah). Proto se každý přečtený tah porovná se všemi tahy, které jsou v dané pozici podle pravidel možné, a vybere se posloupnost legálních tahů, která přečtenému textu odpovídá nejlépe. Notace může být česká, slovenská, anglická, německá, polská, maďarská, francouzská, španělská, italská, nizozemská, ruská nebo figurková.

## Soubory

| Soubor | Co obsahuje |
|---|---|
| `index.html` | stránka: klíč, fotky, kontrola tahů, výstup PGN |
| `scoresheet-reader.js` | příprava fotek a čtení přes Claude API |
| `scoresheet-core.js` | ověření tahů podle pravidel a sestavení PGN (funguje i v Node.js) |
| `scoresheet-review.js` | kontrola a oprava přečtených tahů |
| `vendor/chess.js` | pravidla šachu (chess.js 0.10.3) |
| `vendor/anthropic-sdk.js` | Anthropic TypeScript SDK 1.3.0 sestavené pro prohlížeč |
| `test/` | testy jádra, spuštění `npm test` (stačí Node.js 20 nebo novější) |

## Původ

Kód vznikl jako funkce PGN editoru (větev `claude/gallant-brahmagupta-k6f8dx` v repozitáři `slivam24/pgn-editor`, verze 0.19) a byl přenesen sem jako samostatný projekt.

## Licence

GNU GPL 3 nebo novější (soubor `LICENSE`).

| Knihovna | Autor | Licence |
|---|---|---|
| chess.js 0.10.3 | Jeff Hlywa | BSD 2-Clause (`licence/chess.js-LICENSE.txt`) |
| Anthropic TypeScript SDK 1.3.0 | Anthropic, PBC | Apache 2.0 (`licence/apache-2.0.txt`) |

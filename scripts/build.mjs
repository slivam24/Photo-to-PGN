// Sestaví vendor/anthropic-sdk.js (Anthropic SDK pro prohlížeč) a zkopíruje soubory do web/
import { build } from 'esbuild';
import { copyFileSync, readFileSync } from 'node:fs';

const sdkVersion = JSON.parse(readFileSync('node_modules/@anthropic-ai/sdk/package.json', 'utf8')).version;
await build({
  entryPoints: ['scripts/sdk-entry.mjs'],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'AnthropicSDK',
  platform: 'browser',
  target: ['chrome90', 'safari15', 'firefox90'],
  legalComments: 'none',
  banner: { js: `/* Anthropic TypeScript SDK ${sdkVersion} (https://github.com/anthropics/anthropic-sdk-typescript), Apache License 2.0, Copyright Anthropic, PBC. Sestaveno pro Photo-to-PGN. */` },
  outfile: 'vendor/anthropic-sdk.js'
});
for (const [from, to] of [
  ['vendor/anthropic-sdk.js', 'web/anthropic-sdk.js'],
  ['src/scoresheet-core.js', 'web/scoresheet-core.js'],
  ['src/scoresheet-reader.js', 'web/scoresheet-reader.js'],
  ['src/scoresheet-review.js', 'web/scoresheet-review.js'],
  ['node_modules/chess.js/chess.js', 'web/chess.js']
]) copyFileSync(from, to);
console.log('Hotovo: Anthropic SDK ' + sdkVersion);

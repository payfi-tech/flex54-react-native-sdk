// Renders assets/chat.svg to the launcher PNGs (1x, 2x, 3x of the 32pt icon).
// Dev-only: run `npm run render-icon` after changing the SVG. Only the PNGs ship.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const assets = fileURLToPath(new URL('../assets/', import.meta.url));
const svg = readFileSync(`${assets}chat.svg`, 'utf8');

const outputs = [
  ['chat.png', 32],
  ['chat@2x.png', 64],
  ['chat@3x.png', 96],
];

for (const [name, size] of outputs) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(`${assets}${name}`, png);
  console.log(`wrote assets/${name} (${size}x${size})`);
}

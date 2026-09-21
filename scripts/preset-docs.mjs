// Writes docs/presets/<key>.md from the preset data. A test fails when a page
// and its data disagree, so run this after any preset change.
import { mkdirSync, writeFileSync } from 'node:fs';
import { PRESETS } from '../src/presets/index.ts';
import { renderPresetDoc } from '../src/presets/docs.ts';

const dir = new URL('../docs/presets/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const preset of PRESETS) writeFileSync(new URL(`${preset.key}.md`, dir), renderPresetDoc(preset));
console.log(`Wrote ${PRESETS.length} preset page(s) to docs/presets/.`);

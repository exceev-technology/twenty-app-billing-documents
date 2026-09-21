import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PRESETS } from '../src/presets/index.ts';
import { renderPresetDoc } from '../src/presets/docs.ts';
import { APPLIES_TO, LANGUAGES, NUMBERING_RESETS, QR_MODES, ROUNDING_MODES, TAX_CATEGORIES } from '../src/schema/options.ts';

const valuesOf = (list: readonly (readonly string[])[]) => list.map(([value]) => value);
const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

function checkPattern(pattern: string, reset: string) {
  const tokens = pattern.match(/\{[^}]*\}/g) ?? [];
  for (const token of tokens) assert.match(token, /^\{(YYYY|YY|MM|SEQ:[1-9])\}$/, `${pattern}: unknown token ${token}`);
  assert.equal(tokens.filter((t) => t.startsWith('{SEQ:')).length, 1, `${pattern}: exactly one {SEQ:n}`);
  const hasYear = /\{YYYY\}|\{YY\}/.test(pattern);
  if (reset === 'YEARLY') assert.ok(hasYear, `${pattern}: restarts every year, so it must carry the year`);
  if (reset === 'MONTHLY') assert.ok(hasYear && pattern.includes('{MM}'), `${pattern}: restarts every month, so it must carry year and month`);
}

test('preset keys are unique: generic, or a lowercase ISO country code matching countryCode', () => {
  const keys = PRESETS.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const p of PRESETS) {
    if (p.key === 'generic') assert.equal(p.countryCode, null);
    else assert.equal(p.countryCode, p.key.toUpperCase(), p.key);
  }
});

test('language, locale, currency, rounding and QR mode are valid', () => {
  for (const p of PRESETS) {
    assert.ok(valuesOf(LANGUAGES).includes(p.language), p.key);
    assert.equal(Intl.getCanonicalLocales(p.locale)[0], p.locale, `${p.key}: locale`);
    if (p.defaultCurrency !== null) assert.ok(CURRENCIES.has(p.defaultCurrency), `${p.key}: currency`);
    assert.ok(valuesOf(ROUNDING_MODES).includes(p.roundingMode), p.key);
    assert.ok(valuesOf(QR_MODES).includes(p.qrMode), p.key);
    assert.match(p.verifiedOn, /^\d{4}-\d{2}-\d{2}$/, p.key);
  }
});

test('number patterns are well formed and unique across their period', () => {
  for (const p of PRESETS) {
    assert.ok(valuesOf(NUMBERING_RESETS).includes(p.numbering.reset), p.key);
    for (const pattern of [p.numbering.quote, p.numbering.invoice, p.numbering.creditNote]) checkPattern(pattern, p.numbering.reset);
  }
});

test('identifier types: keys unique and namespaced, requirements consistent, patterns compile', () => {
  const keys = PRESETS.flatMap((p) => p.identifierTypes.map((t) => t.key));
  assert.equal(new Set(keys).size, keys.length, 'an identifier type key repeats');
  for (const p of PRESETS) {
    for (const t of p.identifierTypes) {
      assert.ok(t.key.startsWith(`${p.key}.`), t.key);
      assert.ok(valuesOf(APPLIES_TO).includes(t.appliesTo), t.key);
      if (t.requiredForSeller) assert.ok(t.appliesTo !== 'BUYER', `${t.key}: required for a seller it does not apply to`);
      if (t.requiredForBusinessBuyer) assert.ok(t.appliesTo !== 'SELLER', `${t.key}: required for a buyer it does not apply to`);
      if (t.validationPattern) assert.doesNotThrow(() => new RegExp(t.validationPattern!), t.key);
    }
  }
});

test('tax codes: codes unique and namespaced, rates between 0 and 100, categories consistent', () => {
  const codes = PRESETS.flatMap((p) => p.taxCodes.map((c) => c.code));
  assert.equal(new Set(codes).size, codes.length, 'a tax code repeats');
  for (const p of PRESETS) {
    for (const c of p.taxCodes) {
      assert.ok(c.code.startsWith(`${p.key}.`), c.code);
      assert.ok(valuesOf(TAX_CATEGORIES).includes(c.category), c.code);
      assert.ok(c.components.length > 0, `${c.code}: no component`);
      for (const k of c.components) assert.ok(k.rate >= 0 && k.rate <= 100, `${c.code}: rate ${k.rate}`);
      const total = c.components.reduce((sum, k) => sum + k.rate, 0);
      if (['STANDARD', 'REDUCED'].includes(c.category)) assert.ok(total > 0, `${c.code}: a ${c.category} code charges tax`);
      else assert.equal(total, 0, `${c.code}: a ${c.category} code charges no tax`);
      if (['EXEMPT', 'REVERSE_CHARGE'].includes(c.category)) assert.ok(c.printNote, `${c.code}: the law wants the reason printed`);
    }
  }
});

test('every country preset cites its sources', () => {
  for (const p of PRESETS) {
    if (p.key === 'generic') continue;
    assert.ok(p.sources.length > 0, p.key);
    for (const s of p.sources) assert.match(s.url, /^https:\/\//, `${p.key}: ${s.title}`);
  }
});

test('every preset has its generated page, up to date', () => {
  for (const p of PRESETS) {
    const path = new URL(`../docs/presets/${p.key}.md`, import.meta.url);
    assert.ok(existsSync(path), `docs/presets/${p.key}.md is missing: run npm run presets:docs`);
    assert.equal(readFileSync(path, 'utf8'), renderPresetDoc(p), `docs/presets/${p.key}.md is stale: run npm run presets:docs`);
  }
});

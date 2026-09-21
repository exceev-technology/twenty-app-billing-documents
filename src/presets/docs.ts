import type { Preset } from './types.ts';

const yes = (value?: boolean) => (value ? 'yes' : 'no');
const cell = (value: string) => value.replace(/\|/g, '\\|');
const code = (value: string) => `\`${cell(value)}\``;

const MENTION_LABELS = { quote: 'Quotes', invoice: 'Invoices', creditNote: 'Credit notes' } as const;

/** The page for one preset, generated from its data so the two never disagree. */
export function renderPresetDoc(p: Preset): string {
  const lines: string[] = [
    `# ${p.name} (\`${p.key}\`)`,
    '',
    `Verified on ${p.verifiedOn}. This preset is a starting point: check it with your accountant before you issue documents.`,
    '',
    '<!-- Generated from src/presets by `npm run presets:docs`. Do not edit by hand. -->',
    '',
    '## Settings',
    '',
    '| Setting | Value |',
    '|---|---|',
    `| Country | ${p.countryCode ?? 'none'} |`,
    `| Language | ${p.language} |`,
    `| Locale | ${p.locale} |`,
    `| Currency | ${p.defaultCurrency ?? 'set on the issuer'} |`,
    `| Tax rounding | ${p.roundingMode} |`,
    `| Total in words | ${yes(p.amountInWords)} |`,
    ...(p.invoiceTitle ? [`| Invoice title | ${cell(p.invoiceTitle)} |`] : []),
    ...(p.creditNoteTitle ? [`| Credit note title | ${cell(p.creditNoteTitle)} |`] : []),
    `| Quote numbers | ${code(p.numbering.quote)} |`,
    `| Invoice numbers | ${code(p.numbering.invoice)} |`,
    `| Credit note numbers | ${code(p.numbering.creditNote)} |`,
    `| Numbering restarts | ${p.numbering.reset} |`,
    `| Payment term | ${p.defaultPaymentTermDays} days |`,
    `| Quote validity | ${p.defaultQuoteValidityDays} days |`,
    '',
    '## Identifiers',
    '',
    '| Key | Label | Applies to | Required for the seller | Required for a domestic business buyer | Format |',
    '|---|---|---|---|---|---|',
    ...p.identifierTypes.map((t) =>
      `| ${code(t.key)} | ${cell(t.name)} | ${t.appliesTo} | ${yes(t.requiredForSeller)} | ${yes(t.requiredForBusinessBuyer)} | ${t.validationPattern ? code(t.validationPattern) : ''} |`,
    ),
    '',
    '## Tax codes',
    '',
    '| Code | Name | Category | Components | Printed note |',
    '|---|---|---|---|---|',
    ...p.taxCodes.map((c) =>
      `| ${code(c.code)} | ${cell(c.name)} | ${c.category} | ${c.components.map((k) => `${cell(k.name)} ${k.rate} %`).join(' + ')} | ${cell(c.printNote ?? '')} |`,
    ),
    '',
  ];

  const mentions = (Object.keys(MENTION_LABELS) as (keyof typeof MENTION_LABELS)[]).filter((k) => p.mentions[k]);
  if (mentions.length > 0) {
    lines.push('## Mentions', '');
    for (const k of mentions) lines.push(`- **${MENTION_LABELS[k]}**: ${p.mentions[k]}`);
    lines.push('');
  }

  if (p.complianceNote) lines.push('## What this PDF does not cover', '', p.complianceNote, '');

  lines.push(
    '## Sources',
    '',
    ...(p.sources.length > 0
      ? p.sources.map((s) => `- [${s.title}](${s.url})`)
      : ['None: this preset carries no country rules.']),
    '',
  );
  return lines.join('\n');
}

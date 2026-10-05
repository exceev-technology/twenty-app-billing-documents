/**
 * A right-to-left page, made from the left-to-right definition a layout
 * builds. The layouts stay as they are; this mirrors what they produce:
 * - columns and table cells in reverse order, with each table's widths and its column-indexed
 *   layout callbacks (vertical rules, left and right padding, fill by column) mirrored to match;
 * - left and right swapped in alignments and in four-value margins, and text right-aligned by default;
 * - the runs of a line in reverse order, a line at a time, so "Label: value" reads value-last.
 * The footer is a function per page, so its result is mirrored when it is drawn.
 * A text array of plain strings is one run cut into pieces (blocks.ts pieces()): it keeps its order.
 * The words inside an Arabic run are put in visual order later, in pdf.ts.
 */
import type { PdfDefinition } from './types.ts';

type Node = Record<string, unknown>;
type Callback = (...args: unknown[]) => unknown;
type TableNode = { table: { body: unknown[][]; widths?: unknown[] } };

const isPlain = (value: unknown): value is Node =>
  !!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

/** A table's column count, from its widths, else its first row. */
const columns = (node: TableNode): number => node.table.widths?.length ?? node.table.body[0]?.length ?? 0;

/** Leading spaces become trailing ones and back: the run now sits on the other side of its neighbours. */
function swapEdges(text: string): string {
  const lead = /^[  ]*/.exec(text)![0];
  if (lead.length === text.length) return text;
  const trail = /[  ]*$/.exec(text)![0];
  return trail + text.slice(lead.length, text.length - trail.length) + lead;
}

/** A layout's column-indexed callbacks, mirrored; row-indexed ones are unchanged. */
function mirrorLayout(layout: Node): Node {
  const out: Node = { ...layout };
  const at = (name: string) => layout[name] as Callback | undefined;
  for (const name of ['vLineWidth', 'vLineColor', 'vLineStyle']) {
    const callback = at(name);
    if (callback) out[name] = (index: unknown, node: unknown, ...rest: unknown[]) => callback(columns(node as TableNode) - (index as number), node, ...rest);
  }
  const left = at('paddingLeft');
  const right = at('paddingRight');
  const mirrorPadding = (callback: Callback | undefined) =>
    callback && ((index: unknown, node: unknown, ...rest: unknown[]) => callback(columns(node as TableNode) - 1 - (index as number), node, ...rest));
  if (left || right) {
    out.paddingLeft = mirrorPadding(right) ?? (() => 4);
    out.paddingRight = mirrorPadding(left) ?? (() => 4);
  }
  const fill = at('fillColor');
  if (fill) {
    out.fillColor = (row: unknown, node: unknown, column: unknown) =>
      fill(row, node, typeof column === 'number' ? columns(node as TableNode) - 1 - column : column);
  }
  return out;
}

/** The runs of a text array in reverse order, line by line: a run that holds a line break ends one line and starts the next. */
function reverseRuns(runs: unknown[]): unknown[] {
  if (runs.every((run) => typeof run === 'string')) return runs.map((run) => swapEdges(run as string));
  const lines: unknown[][] = [[]];
  for (const run of runs) {
    const text = typeof run === 'string' ? run : isPlain(run) ? run.text : undefined;
    if (typeof text !== 'string') {
      lines.at(-1)!.push(mirror(run));
      continue;
    }
    text.split('\n').forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part === '') return;
      lines.at(-1)!.push(typeof run === 'string' ? swapEdges(part) : { ...mirror(run) as Node, text: swapEdges(part) });
    });
  }
  return lines.flatMap((line, index) => {
    const reversed = line.reverse();
    if (index === 0) return reversed;
    const [first, ...rest] = reversed;
    if (first === undefined) return ['\n'];
    if (typeof first === 'string') return [`\n${first}`, ...rest];
    return [{ ...(first as Node), text: `\n${(first as Node).text as string}` }, ...rest];
  });
}

function mirror(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mirror);
  if (!isPlain(value)) return value;
  const out: Node = {};
  for (const [key, inner] of Object.entries(value)) {
    if (key === 'columns' && Array.isArray(inner)) out[key] = inner.map(mirror).reverse();
    else if (key === 'table' && isPlain(inner)) {
      const table = inner as TableNode['table'];
      out[key] = {
        ...inner,
        body: table.body.map((row) => row.map(mirror).reverse()),
        ...(table.widths ? { widths: [...table.widths].reverse() } : {}),
      };
    } else if (key === 'layout' && isPlain(inner)) out[key] = mirrorLayout(inner);
    else if (key === 'alignment') out[key] = inner === 'left' ? 'right' : inner === 'right' ? 'left' : inner;
    else if ((key === 'margin' || key === 'pageMargins') && Array.isArray(inner) && inner.length === 4) {
      out[key] = [inner[2], inner[1], inner[0], inner[3]];
    } else if (key === 'text') out[key] = Array.isArray(inner) ? reverseRuns(inner) : typeof inner === 'string' ? swapEdges(inner) : inner;
    else if ((key === 'footer' || key === 'header') && typeof inner === 'function') {
      out[key] = (...args: unknown[]) => mirror((inner as Callback)(...args));
    } else out[key] = mirror(inner);
  }
  return out;
}

/**
 * The page, right to left. Tajawal becomes the page's font, so Latin runs (a number, a percentage)
 * sit on the same baseline as the Arabic beside them; pdf.ts gives Roboto back to a Latin run with a
 * letter Tajawal lacks. Arabic needs taller lines than Latin: at least 1.4.
 */
export function mirrored(definition: PdfDefinition): PdfDefinition {
  const page = mirror(definition) as Node;
  const style = (page.defaultStyle as Node | undefined) ?? {};
  const lineHeight = Math.max(typeof style.lineHeight === 'number' ? style.lineHeight : 1, 1.4);
  return { ...page, defaultStyle: { ...style, alignment: 'right', font: 'Tajawal', lineHeight } };
}

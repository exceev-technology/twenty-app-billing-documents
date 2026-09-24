import { inflateSync } from 'node:zlib';
import { renderDocument } from '../../../render/document.ts';
import type { RenderInput } from '../../../render/types.ts';

type PdfObject = { dict: string; stream?: Buffer };

/** Every numbered object, with its stream inflated. Streams are skipped by their length, never searched. */
function objects(file: string): Map<number, PdfObject> {
  const found = new Map<number, PdfObject>();
  const HEAD = /(\d+) 0 obj\s*/g;
  for (let match = HEAD.exec(file); match; match = HEAD.exec(file)) {
    const start = HEAD.lastIndex;
    const end = file.indexOf('endobj', start);
    const streamAt = file.indexOf('stream\n', start);
    if (streamAt !== -1 && streamAt < end) {
      const dict = file.slice(start, streamAt);
      const length = Number(/\/Length (\d+)/.exec(dict)![1]);
      const data = Buffer.from(file.slice(streamAt + 7, streamAt + 7 + length), 'latin1');
      found.set(Number(match[1]), { dict, stream: /\/FlateDecode/.test(dict) ? inflateSync(data) : data });
      HEAD.lastIndex = streamAt + 7 + length;
    } else {
      found.set(Number(match[1]), { dict: file.slice(start, end) });
      HEAD.lastIndex = end;
    }
  }
  return found;
}

const ref = (dict: string, key: string): number | null => {
  const match = new RegExp(`/${key} (\\d+) 0 R`).exec(dict);
  return match ? Number(match[1]) : null;
};

const hex = (value: string): string =>
  String.fromCodePoint(...(value.match(/.{4}/g) ?? []).map((unit) => parseInt(unit, 16)));

/** A ToUnicode map: glyph code to text, from its bfchar and bfrange sections. */
function toUnicode(cmap: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [, section] of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, code, text] of section!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(code!.toLowerCase(), hex(text!));
  }
  for (const [, section] of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, low, high, target] of section!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g)) {
      const from = parseInt(low!, 16);
      const to = parseInt(high!, 16);
      const listed = target!.startsWith('[') ? [...target!.matchAll(/<([0-9a-fA-F]+)>/g)].map((entry) => hex(entry[1]!)) : null;
      for (let code = from; code <= to; code++) {
        const text = listed ? listed[code - from] : String.fromCodePoint(parseInt(target!.slice(1, -1), 16) + code - from);
        if (text !== undefined) map.set(code.toString(16).padStart(low!.length, '0'), text);
      }
    }
  }
  return map;
}

/**
 * The text each page of a pdfkit file shows, line by line from the top: text
 * objects on one baseline are joined, left to right. It reads only what pdfkit
 * writes (Type0 fonts, Identity-H, a ToUnicode map, one Tm per text object),
 * which is all this renderer produces.
 */
export function pdfText(bytes: Uint8Array): string[] {
  const file = Buffer.from(bytes).toString('latin1');
  const all = objects(file);
  const tree = [...all.values()].find((object) => /\/Type \/Pages\b/.test(object.dict))!;
  const kids = [.../\/Kids \[([^\]]*)\]/.exec(tree.dict)![1]!.matchAll(/(\d+) 0 R/g)].map((kid) => Number(kid[1]));
  return kids.map((id) => {
    const page = all.get(id)!;
    const resourcesId = ref(page.dict, 'Resources');
    const resources = resourcesId === null ? page.dict : all.get(resourcesId)!.dict;
    const fonts = new Map<string, Map<string, string>>();
    for (const [, name, fontId] of (/\/Font\s*<<([\s\S]*?)>>/.exec(resources)?.[1] ?? '').matchAll(/\/(\w+) (\d+) 0 R/g)) {
      const cmapId = ref(all.get(Number(fontId))!.dict, 'ToUnicode');
      fonts.set(name!, cmapId === null ? new Map() : toUnicode(all.get(cmapId)!.stream!.toString('latin1')));
    }
    const content = all.get(ref(page.dict, 'Contents')!)!.stream!.toString('latin1');
    const pieces: { x: number; y: number; text: string }[] = [];
    let font = new Map<string, string>();
    for (const [, block] of content.matchAll(/BT([\s\S]*?)ET/g)) {
      const [, x, y] = /1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/.exec(block!) ?? [, '0', '0'];
      let text = '';
      for (const [, name, drawn] of block!.matchAll(/\/(\w+) [\d.]+ Tf|(\[[^\]]*\]\s*TJ|<[0-9a-fA-F]*>\s*Tj)/g)) {
        if (name) font = fonts.get(name) ?? new Map();
        for (const [, glyphs] of (drawn ?? '').matchAll(/<([0-9a-fA-F]*)>/g)) {
          for (const code of glyphs!.match(/.{4}/g) ?? []) text += font.get(code.toLowerCase()) ?? '�';
        }
      }
      pieces.push({ x: Number(x), y: Math.round(Number(y) * 2) / 2, text });
    }
    const baselines = [...new Set(pieces.map((piece) => piece.y))].sort((a, b) => b - a);
    return baselines.map((y) => pieces
      .filter((piece) => piece.y === y)
      .sort((a, b) => a.x - b.x)
      .reduce((line, piece) => (line === '' || /\s$/.test(line) ? line + piece.text : `${line} ${piece.text}`), '')
      .trimEnd()).join('\n');
  });
}

/** What a rendered document really shows, every page: a definition can hold text pdfmake then drops. */
export const shown = async (input: RenderInput): Promise<string> => pdfText((await renderDocument(input)).bytes).join('\n');

/** Every string a pdfmake definition would print, in order. */
export function printedText(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(printedText);
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    return Object.entries(record)
      .filter(([key]) => ['text', 'content', 'stack', 'columns', 'table', 'body', 'ul', 'ol', 'qr'].includes(key))
      .flatMap(([, value]) => printedText(value));
  }
  return [];
}

/** The zero-width breaks the renderer adds to very long words are invisible, so they are not part of what prints. */
export const printed = (definition: unknown): string => printedText(definition).join('\n').replace(/\u200b/g, '');

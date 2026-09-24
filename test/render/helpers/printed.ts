/** Every string a pdfmake definition would print, in order. The pieces of one text print side by side, as one string. */
export function printedText(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(printedText);
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    return Object.entries(record)
      .filter(([key]) => ['text', 'content', 'stack', 'columns', 'table', 'body', 'ul', 'ol', 'qr'].includes(key))
      .flatMap(([key, value]) => (key === 'text' && Array.isArray(value) ? [printedText(value).join('')] : printedText(value)));
  }
  return [];
}

export const printed = (definition: unknown): string => printedText(definition).join('\n');

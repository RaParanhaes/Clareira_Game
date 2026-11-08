export const MAX_CHAT_CHARS = 72;
export const MAX_CHAT_BYTES = 1800;

const graphemeSegmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('pt-BR', { granularity: 'grapheme' })
  : null;

function splitGraphemes(value) {
  if (graphemeSegmenter) return Array.from(graphemeSegmenter.segment(value), part => part.segment);
  return Array.from(value);
}

function utf8Length(value) {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0);
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function limitChatInput(value) {
  if (typeof value !== 'string') return '';
  const result = [];
  let bytes = 0;
  for (const grapheme of splitGraphemes(value)) {
    if (result.length >= MAX_CHAT_CHARS) break;
    const size = utf8Length(grapheme);
    if (bytes + size > MAX_CHAT_BYTES) break;
    result.push(grapheme);
    bytes += size;
  }
  return result.join('');
}

export function normalizeChatMessage(value) {
  if (typeof value !== 'string') return '';
  const plain = value
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return limitChatInput(plain);
}

export function wrapChatMessage(value, measureText, maxWidth) {
  if (typeof measureText !== 'function' || !(maxWidth > 0)) return [];
  const lines = [];
  let line = '';
  for (const word of String(value).split(/\s+/u).filter(Boolean)) {
    if (line && measureText(`${line} ${word}`) <= maxWidth) {
      line += ` ${word}`;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    let rest = word;
    while (rest && measureText(rest) > maxWidth) {
      const chars = splitGraphemes(rest);
      let size = chars.length;
      while (size > 1 && measureText(chars.slice(0, size).join('')) > maxWidth) size -= 1;
      lines.push(chars.slice(0, size).join(''));
      rest = chars.slice(size).join('');
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

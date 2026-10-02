// ============================================================================
// Gerador ESC/POS para impressoras térmicas Epson (TM-T20, TM-T88, etc.)
// Usa a página de código CP850 (ESC t 2) para acentuação em português.
// ============================================================================

const ESC = 0x1b;
const GS = 0x1d;

// Caracteres portugueses -> CP850
const CP850 = {
  'á': 0xa0, 'à': 0x85, 'â': 0x83, 'ã': 0xc6, 'ä': 0x84,
  'é': 0x82, 'è': 0x8a, 'ê': 0x88, 'ë': 0x89,
  'í': 0xa1, 'ì': 0x8d, 'î': 0x8c, 'ï': 0x8b,
  'ó': 0xa2, 'ò': 0x95, 'ô': 0x93, 'õ': 0xe4, 'ö': 0x94,
  'ú': 0xa3, 'ù': 0x97, 'û': 0x96, 'ü': 0x81,
  'ç': 0x87, 'ñ': 0xa4,
  'Á': 0xb5, 'À': 0xb7, 'Â': 0xb6, 'Ã': 0xc7, 'Ä': 0x8e,
  'É': 0x90, 'È': 0xd4, 'Ê': 0xd2,
  'Í': 0xd6, 'Ó': 0xe0, 'Ô': 0xe2, 'Õ': 0xe5, 'Ö': 0x99,
  'Ú': 0xe9, 'Ü': 0x9a, 'Ç': 0x80, 'Ñ': 0xa5,
  'º': 0xa7, 'ª': 0xa6, '°': 0xf8, '½': 0xab,
};

/** Codifica texto em CP850; caracteres desconhecidos viram ASCII sem acento ou "?". */
export function encodeCp850(text) {
  const bytes = [];
  for (const ch of String(text)) {
    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code < 0x7f) bytes.push(code);
    else if (ch === '\n') bytes.push(0x0a);
    else if (CP850[ch] !== undefined) bytes.push(CP850[ch]);
    else {
      const ascii = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const c = ascii.charCodeAt(0);
      bytes.push(ascii && c >= 0x20 && c < 0x7f ? c : 0x3f);
    }
  }
  return bytes;
}

/**
 * Builder fluente. Guarda também uma versão texto (para modo simulação/log).
 */
export class Receipt {
  constructor(columns = 48) {
    this.columns = columns;
    this.bytes = [ESC, 0x40, ESC, 0x74, 0x02]; // init + CP850
    this.textLines = [];
    this.currentAlign = 'left';
    this.currentSize = 1;
  }

  align(where) {
    this.currentAlign = where;
    this.bytes.push(ESC, 0x61, where === 'center' ? 1 : where === 'right' ? 2 : 0);
    return this;
  }

  bold(on = true) {
    this.bytes.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  /** size: 1 normal, 2 dupla altura+largura */
  size(n = 1) {
    this.currentSize = n;
    const v = n === 2 ? 0x11 : n === 3 ? 0x01 : 0x00; // 3 = só altura dupla
    this.bytes.push(GS, 0x21, v);
    return this;
  }

  /** Inverte cores (texto branco em fundo preto) — destaque para cancelamentos. */
  invert(on = true) {
    this.bytes.push(GS, 0x42, on ? 1 : 0);
    return this;
  }

  line(text = '') {
    const width = this.currentSize === 2 ? Math.floor(this.columns / 2) : this.columns;
    for (const chunk of wrap(String(text), width)) {
      this.bytes.push(...encodeCp850(chunk), 0x0a);
      this.textLines.push(this.formatForText(chunk, width));
    }
    return this;
  }

  formatForText(chunk, width) {
    if (this.currentAlign === 'center') {
      const pad = Math.max(0, Math.floor((width - chunk.length) / 2));
      return ' '.repeat(pad) + chunk;
    }
    if (this.currentAlign === 'right') return chunk.padStart(width);
    return chunk;
  }

  /** Duas colunas: texto à esquerda, valor à direita. */
  pair(left, right) {
    const space = Math.max(1, this.columns - left.length - right.length);
    return this.line(left + ' '.repeat(space) + right);
  }

  divider(char = '-') {
    const saved = this.currentSize;
    if (saved !== 1) this.size(1);
    this.line(char.repeat(this.columns));
    if (saved !== 1) this.size(saved);
    return this;
  }

  feed(n = 1) {
    for (let i = 0; i < n; i++) {
      this.bytes.push(0x0a);
      this.textLines.push('');
    }
    return this;
  }

  /** Bip da impressora (modelos Epson com buzzer: ESC ( A) */
  beep() {
    this.bytes.push(ESC, 0x28, 0x41, 0x04, 0x00, 0x30, 0x30, 0x03, 0x02);
    return this;
  }

  /** Avança papel e faz corte parcial. */
  cut() {
    this.bytes.push(GS, 0x56, 0x42, 0x03);
    this.textLines.push('✂'.padEnd(this.columns, '-'));
    return this;
  }

  toBuffer() {
    return Buffer.from(this.bytes);
  }

  toText() {
    return this.textLines.join('\n');
  }
}

/** Quebra texto em linhas respeitando palavras. */
export function wrap(text, width) {
  if (text.length <= width) return [text];
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (word.length > width) {
      if (current) { lines.push(current); current = ''; }
      for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width));
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

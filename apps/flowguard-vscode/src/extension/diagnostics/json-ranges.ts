import { jsonPath, jsonPathRoot } from '@workspace/flowguard-contracts';

import type { FlowguardDiagnosticRange } from '#/extension/diagnostics/types';

interface TextSpan {
  readonly start: number;
  readonly end: number;
}

export const jsonRangeForPath = (text: string, path: string): FlowguardDiagnosticRange => {
  try {
    const locations = new JsonLocationParser(text).parse();
    const span = locations.get(path) ?? locations.get(jsonPathRoot) ?? { start: 0, end: 0 };
    return rangeForSpan(text, span);
  } catch {
    return rangeForSpan(text, { start: 0, end: 0 });
  }
};

const rangeForSpan = (text: string, span: TextSpan): FlowguardDiagnosticRange => {
  return {
    start: positionAt(text, span.start),
    end: positionAt(text, Math.max(span.end, span.start)),
  };
};

const positionAt = (
  text: string,
  offset: number,
): { readonly line: number; readonly character: number } => {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  let line = 0;
  let lineStart = 0;

  for (let index = 0; index < safeOffset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }

  return {
    line,
    character: safeOffset - lineStart,
  };
};

class JsonLocationParser {
  readonly #text: string;
  readonly #locations = new Map<string, TextSpan>();
  #index = 0;

  constructor(text: string) {
    this.#text = text;
  }

  parse(): ReadonlyMap<string, TextSpan> {
    this.#skipWhitespace();
    this.#parseValue(jsonPathRoot);
    this.#skipWhitespace();
    if (this.#index !== this.#text.length) {
      this.#fail();
    }

    return this.#locations;
  }

  #parseValue(path: string): void {
    this.#skipWhitespace();
    const start = this.#index;
    const next = this.#peek();

    if (next === '{') {
      this.#parseObject(path, start);
      return;
    }
    if (next === '[') {
      this.#parseArray(path, start);
      return;
    }
    if (next === '"') {
      this.#parseString();
      this.#locations.set(path, { start, end: this.#index });
      return;
    }
    if (next === '-' || isDigit(next)) {
      this.#parseNumber();
      this.#locations.set(path, { start, end: this.#index });
      return;
    }
    if (
      this.#consumeLiteral('true') ||
      this.#consumeLiteral('false') ||
      this.#consumeLiteral('null')
    ) {
      this.#locations.set(path, { start, end: this.#index });
      return;
    }

    this.#fail();
  }

  #parseObject(path: string, start: number): void {
    this.#expect('{');
    this.#skipWhitespace();

    if (this.#peek() === '}') {
      this.#index += 1;
      this.#locations.set(path, { start, end: this.#index });
      return;
    }

    while (this.#index < this.#text.length) {
      this.#skipWhitespace();
      const key = this.#parseString();
      this.#skipWhitespace();
      this.#expect(':');
      this.#parseValue(jsonPath(path, key));
      this.#skipWhitespace();

      const next = this.#peek();
      if (next === ',') {
        this.#index += 1;
        continue;
      }
      if (next === '}') {
        this.#index += 1;
        this.#locations.set(path, { start, end: this.#index });
        return;
      }

      this.#fail();
    }

    this.#fail();
  }

  #parseArray(path: string, start: number): void {
    this.#expect('[');
    this.#skipWhitespace();

    if (this.#peek() === ']') {
      this.#index += 1;
      this.#locations.set(path, { start, end: this.#index });
      return;
    }

    let itemIndex = 0;
    while (this.#index < this.#text.length) {
      this.#parseValue(jsonPath(path, itemIndex));
      itemIndex += 1;
      this.#skipWhitespace();

      const next = this.#peek();
      if (next === ',') {
        this.#index += 1;
        continue;
      }
      if (next === ']') {
        this.#index += 1;
        this.#locations.set(path, { start, end: this.#index });
        return;
      }

      this.#fail();
    }

    this.#fail();
  }

  #parseString(): string {
    const start = this.#index;
    this.#expect('"');

    while (this.#index < this.#text.length) {
      const character = this.#text[this.#index];

      if (character === '"') {
        this.#index += 1;
        return JSON.parse(this.#text.slice(start, this.#index)) as string;
      }

      if (character === '\\') {
        this.#index += 1;
        if (this.#index >= this.#text.length) this.#fail();
      }

      this.#index += 1;
    }

    this.#fail();
  }

  #parseNumber(): void {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(
      this.#text.slice(this.#index),
    );
    if (match === null) this.#fail();
    this.#index += match[0].length;
  }

  #consumeLiteral(literal: string): boolean {
    if (!this.#text.startsWith(literal, this.#index)) return false;

    this.#index += literal.length;
    return true;
  }

  #skipWhitespace(): void {
    while (/\s/u.test(this.#peek())) {
      this.#index += 1;
    }
  }

  #expect(character: string): void {
    if (this.#peek() !== character) {
      this.#fail();
    }

    this.#index += 1;
  }

  #peek(): string {
    return this.#text[this.#index] ?? '';
  }

  #fail(): never {
    throw new Error('Invalid JSON.');
  }
}

const isDigit = (value: string): boolean => {
  return value >= '0' && value <= '9';
};

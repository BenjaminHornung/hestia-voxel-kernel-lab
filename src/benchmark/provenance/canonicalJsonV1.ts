export class CanonicalJsonError extends TypeError {
  public constructor(message: string) {
    super(message);
    this.name = 'CanonicalJsonError';
  }
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function compareUtf16(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function isCanonicalArrayIndex(key: string, length: number): boolean {
  if (!/^(0|[1-9][0-9]*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}

function assertString(value: string, label: string): void {
  if (hasUnpairedSurrogate(value)) {
    throw new CanonicalJsonError(`${label} contains an unpaired UTF-16 surrogate.`);
  }
}

function assertNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || Object.is(value, -0)) {
    throw new CanonicalJsonError(`${label} must be finite and not negative zero.`);
  }
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
    throw new CanonicalJsonError(`${label} must be a safe integer when integral.`);
  }
}

function assertOwnDataProperty(
  key: string,
  descriptor: PropertyDescriptor | undefined,
): PropertyDescriptor & { readonly value: unknown } {
  if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) {
    throw new CanonicalJsonError(`Accessor property ${key} is not canonical JSON.`);
  }
  if (!descriptor.enumerable) {
    throw new CanonicalJsonError(`Non-enumerable property ${key} is not canonical JSON.`);
  }
  return descriptor as PropertyDescriptor & { readonly value: unknown };
}

function serializeValue(value: unknown, stack: Set<object>, path: string): string {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    assertString(value, path);
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    assertNumber(value, path);
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new CanonicalJsonError(`${path} has a non-JSON value.`);
  }
  if (stack.has(value)) throw new CanonicalJsonError(`${path} is cyclic.`);
  stack.add(value);
  try {
    if (Array.isArray(value)) {
      const ownKeys = Reflect.ownKeys(value);
      for (const key of ownKeys) {
        if (typeof key === 'symbol') throw new CanonicalJsonError(`${path} has a symbol key.`);
        if (key === 'length') continue;
        if (!isCanonicalArrayIndex(key, value.length)) {
          throw new CanonicalJsonError(`${path}.${key} is not an array index.`);
        }
      }
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined) throw new CanonicalJsonError(`${path}[${index}] is a hole.`);
        const data = assertOwnDataProperty(String(index), descriptor);
        items.push(serializeValue(data.value, stack, `${path}[${index}]`));
      }
      return `[${items.join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalJsonError(`${path} is not a simple object.`);
    }
    const entries: Array<[string, unknown]> = [];
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'symbol') throw new CanonicalJsonError(`${path} has a symbol key.`);
      assertString(key, `${path} property name`);
      const descriptor = assertOwnDataProperty(key, Object.getOwnPropertyDescriptor(value, key));
      entries.push([key, descriptor.value]);
    }
    entries.sort(([left], [right]) => compareUtf16(left, right));
    return `{${entries
      .map(([key, child]) => `${JSON.stringify(key)}:${serializeValue(child, stack, `${path}.${key}`)}`)
      .join(',')}}`;
  } finally {
    stack.delete(value);
  }
}

export function canonicalizeJsonStringV1(value: unknown): string {
  return serializeValue(value, new Set<object>(), '$');
}

export function canonicalizeJsonV1(value: unknown): Uint8Array {
  return textEncoder.encode(canonicalizeJsonStringV1(value));
}

export const canonicalJsonBytesV1 = canonicalizeJsonV1;
export const canonicalJsonStringV1 = canonicalizeJsonStringV1;

function isWhitespace(character: string): boolean {
  return character === ' ' || character === '\t' || character === '\r' || character === '\n';
}

class JsonTokenScanner {
  private index = 0;
  private readonly objectKeys: Array<Set<string>> = [];

  public constructor(private readonly source: string) {}

  public scan(): void {
    this.skipWhitespace();
    this.scanValue();
    this.skipWhitespace();
    if (this.index !== this.source.length) throw new CanonicalJsonError('Trailing JSON input.');
  }

  private skipWhitespace(): void {
    while (this.index < this.source.length && isWhitespace(this.source[this.index]!)) this.index += 1;
  }

  private scanValue(): void {
    this.skipWhitespace();
    const character = this.source[this.index];
    if (character === '{') return this.scanObject();
    if (character === '[') return this.scanArray();
    if (character === '"') {
      this.scanString();
      return;
    }
    if (character === '-' || (character !== undefined && character >= '0' && character <= '9')) {
      this.scanNumber();
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (this.source.startsWith(literal, this.index)) {
        this.index += literal.length;
        return;
      }
    }
    throw new CanonicalJsonError(`Invalid JSON token at offset ${this.index}.`);
  }

  private scanObject(): void {
    this.index += 1;
    const keys = new Set<string>();
    this.objectKeys.push(keys);
    try {
      this.skipWhitespace();
      if (this.source[this.index] === '}') {
        this.index += 1;
        return;
      }
      while (true) {
        this.skipWhitespace();
        if (this.source[this.index] !== '"') throw new CanonicalJsonError('Object key must be a string.');
        const key = this.scanString();
        if (keys.has(key)) throw new CanonicalJsonError(`Duplicate object key ${key}.`);
        keys.add(key);
        this.skipWhitespace();
        if (this.source[this.index] !== ':') throw new CanonicalJsonError('Object key lacks a colon.');
        this.index += 1;
        this.scanValue();
        this.skipWhitespace();
        if (this.source[this.index] === '}') {
          this.index += 1;
          return;
        }
        if (this.source[this.index] !== ',') throw new CanonicalJsonError('Object member lacks a comma.');
        this.index += 1;
      }
    } finally {
      this.objectKeys.pop();
    }
  }

  private scanArray(): void {
    this.index += 1;
    this.skipWhitespace();
    if (this.source[this.index] === ']') {
      this.index += 1;
      return;
    }
    while (true) {
      this.scanValue();
      this.skipWhitespace();
      if (this.source[this.index] === ']') {
        this.index += 1;
        return;
      }
      if (this.source[this.index] !== ',') throw new CanonicalJsonError('Array value lacks a comma.');
      this.index += 1;
    }
  }

  private scanString(): string {
    const start = this.index;
    this.index += 1;
    let pendingHighSurrogate = false;
    while (this.index < this.source.length) {
      const character = this.source[this.index]!;
      if (character === '"') {
        if (pendingHighSurrogate) throw new CanonicalJsonError('JSON contains an unpaired surrogate escape.');
        this.index += 1;
        const token = this.source.slice(start, this.index);
        try {
          const value = JSON.parse(token) as string;
          assertString(value, 'JSON string');
          return value;
        } catch (error) {
          if (error instanceof CanonicalJsonError) throw error;
          throw new CanonicalJsonError('Invalid JSON string.');
        }
      }
      if (character === '\\') {
        this.index += 1;
        if (this.index >= this.source.length) throw new CanonicalJsonError('Incomplete JSON escape.');
        if (this.source[this.index] === 'u') {
          const digits = this.source.slice(this.index + 1, this.index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(digits)) {
            throw new CanonicalJsonError('Invalid JSON unicode escape.');
          }
          const unit = Number.parseInt(digits, 16);
          if (pendingHighSurrogate) {
            if (unit < 0xdc00 || unit > 0xdfff) throw new CanonicalJsonError('JSON contains an unpaired surrogate escape.');
            pendingHighSurrogate = false;
          } else if (unit >= 0xd800 && unit <= 0xdbff) {
            pendingHighSurrogate = true;
          } else if (unit >= 0xdc00 && unit <= 0xdfff) {
            throw new CanonicalJsonError('JSON contains an unpaired surrogate escape.');
          }
          this.index += 5;
        } else if (!'"\\/bfnrt'.includes(this.source[this.index]!)) {
          throw new CanonicalJsonError('Invalid JSON escape.');
        } else {
          this.index += 1;
        }
      } else {
        if (pendingHighSurrogate) throw new CanonicalJsonError('JSON contains an unpaired surrogate escape.');
        if (character.charCodeAt(0) <= 0x1f) throw new CanonicalJsonError('Control character in JSON string.');
        this.index += 1;
      }
    }
    throw new CanonicalJsonError('Unterminated JSON string.');
  }

  private scanNumber(): void {
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(
      this.source.slice(this.index),
    );
    if (match === null) throw new CanonicalJsonError(`Invalid JSON number at offset ${this.index}.`);
    this.index += match[0].length;
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new CanonicalJsonError('UTF-8 BOM is not allowed.');
  }
  try {
    const text = textDecoder.decode(bytes);
    if (text.startsWith('\ufeff')) throw new CanonicalJsonError('UTF-8 BOM is not allowed.');
    return text;
  } catch (error) {
    if (error instanceof CanonicalJsonError) throw error;
    throw new CanonicalJsonError('Input is not valid UTF-8.');
  }
}

function assertNoUnpairedSurrogatesInJsonText(text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index += 1;
        continue;
      }
      throw new CanonicalJsonError('JSON text contains an unpaired UTF-16 surrogate.');
    }
    if (code >= 0xdc00 && code <= 0xdfff) throw new CanonicalJsonError('JSON text contains an unpaired UTF-16 surrogate.');
  }
}

export function parseCanonicalJsonV1(input: Uint8Array | string): unknown {
  if (typeof input === 'string' && hasUnpairedSurrogate(input)) {
    throw new CanonicalJsonError('JSON text contains an unpaired UTF-16 surrogate.');
  }
  const bytes = typeof input === 'string' ? textEncoder.encode(input) : input;
  const text = decodeUtf8(bytes);
  assertNoUnpairedSurrogatesInJsonText(text);
  new JsonTokenScanner(text).scan();
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new CanonicalJsonError('Input is not valid JSON.');
  }
  const canonical = canonicalizeJsonV1(value);
  if (canonical.byteLength !== bytes.byteLength) throw new CanonicalJsonError('JSON is not canonical JCS.');
  for (let index = 0; index < canonical.length; index += 1) {
    if (canonical[index] !== bytes[index]) throw new CanonicalJsonError('JSON is not canonical JCS.');
  }
  return value;
}

export const parseCanonicalJsonBytesV1 = parseCanonicalJsonV1;

export function assertCanonicalJsonBytesV1(input: Uint8Array | string): void {
  parseCanonicalJsonV1(input);
}

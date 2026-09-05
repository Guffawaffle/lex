import { canonicalizeJson } from "./canonical-json.js";

export const POLICY_JSON_MAX_BYTES_V1 = 1_048_576;
export const POLICY_JSON_MAX_DEPTH_V1 = 128;

export type PolicyJsonErrorCodeV1 =
  | "invalid_source_bytes"
  | "source_too_large"
  | "invalid_utf8"
  | "invalid_json"
  | "duplicate_json_key"
  | "source_too_deep";

/** Internal parser failure; offsets count UTF-16 code units in decoded source. */
export class PolicyJsonError extends Error {
  constructor(
    readonly code: PolicyJsonErrorCodeV1,
    readonly offset: number | null = null
  ) {
    super(code);
  }
}

/**
 * Scan the entire JSON grammar and decoded mapping keys before JSON.parse can
 * construct an object and discard duplicates. This profile rejects a BOM.
 */
export function readPolicyJson(rawSource: Uint8Array): unknown {
  if (!(rawSource instanceof Uint8Array)) throw new PolicyJsonError("invalid_source_bytes");
  if (rawSource.byteLength > POLICY_JSON_MAX_BYTES_V1) {
    throw new PolicyJsonError("source_too_large");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(rawSource);
  } catch {
    throw new PolicyJsonError("invalid_utf8");
  }
  let position = 0;
  const fail = (code: PolicyJsonErrorCodeV1 = "invalid_json"): never => {
    throw new PolicyJsonError(code, position);
  };
  const whitespace = (): void => {
    while (position < text.length && /[\x20\t\r\n]/u.test(text[position])) position++;
  };
  const string = (): string => {
    const start = position;
    if (text[position++] !== '"') fail();
    while (position < text.length) {
      const character = text[position++];
      if (character === "\\") {
        position++;
      } else if (character === '"') {
        try {
          return JSON.parse(text.slice(start, position)) as string;
        } catch {
          fail();
        }
      }
    }
    return fail();
  };
  const value = (depth: number): void => {
    if (depth > POLICY_JSON_MAX_DEPTH_V1) fail("source_too_deep");
    whitespace();
    const character = text[position];
    if (character === '"') {
      string();
    } else if (character === "{" || character === "[") {
      const object = character === "{";
      const close = object ? "}" : "]";
      const keys = new Set<string>();
      position++;
      whitespace();
      if (text[position] === close) {
        position++;
        return;
      }
      while (true) {
        whitespace();
        if (object) {
          const key = string();
          if (keys.has(key)) fail("duplicate_json_key");
          keys.add(key);
          whitespace();
          if (text[position++] !== ":") fail();
        }
        value(depth + 1);
        whitespace();
        if (text[position] === close) {
          position++;
          return;
        }
        if (text[position++] !== ",") fail();
      }
    } else {
      const token =
        /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/u.exec(
          text.slice(position)
        );
      if (!token) fail();
      position += token![0].length;
    }
  };
  value(0);
  whitespace();
  if (position !== text.length) fail();
  try {
    const parsed: unknown = JSON.parse(text);
    // Reject non-finite numbers and unpaired escaped surrogates as well.
    canonicalizeJson(parsed);
    return parsed;
  } catch {
    return fail();
  }
}

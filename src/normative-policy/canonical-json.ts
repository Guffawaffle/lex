import { types as nodeUtilTypes } from "node:util";

/** JSON scalar accepted by the normative-policy canonical JSON core. */
export type JsonPrimitive = null | boolean | number | string;

/** JSON value accepted after runtime validation. */
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;

/** JSON object accepted after runtime validation. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

/** Compare strings lexicographically by their unsigned UTF-16 code units. */
export function compareUtf16CodeUnits(left: string, right: string): number {
  const commonLength = Math.min(left.length, right.length);
  for (let index = 0; index < commonLength; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return left.length < right.length ? -1 : left.length > right.length ? 1 : 0;
}

function fail(path: string, reason: string): never {
  throw new TypeError(`Cannot canonicalize JSON at ${path}: ${reason}.`);
}

function propertyPath(path: string, key: string): string {
  return `${path}[${JSON.stringify(key)}]`;
}

function assertUnicodeScalarString(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (!(nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff)) {
        fail(path, "strings must not contain unpaired UTF-16 surrogates");
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      fail(path, "strings must not contain unpaired UTF-16 surrogates");
    }
  }
}

function serializeString(value: string, path: string): string {
  assertUnicodeScalarString(value, path);
  return JSON.stringify(value);
}

function assertNoSymbolProperties(value: object, path: string): void {
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    fail(path, "symbol-keyed properties are not JSON members");
  }
}

function serializeArray(value: readonly unknown[], path: string, active: Set<object>): string {
  if (active.has(value)) fail(path, "cyclic references are not JSON values");
  active.add(value);

  try {
    assertNoSymbolProperties(value, path);
    const propertyNames = Object.getOwnPropertyNames(value).filter((name) => name !== "length");

    if (propertyNames.length !== value.length) {
      fail(path, "arrays must be dense and must not have additional properties");
    }

    const descriptors = new Map<number, PropertyDescriptor>();
    for (const name of propertyNames) {
      const index = Number(name);
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= value.length ||
        String(index) !== name
      ) {
        fail(path, "arrays must be dense and must not have additional properties");
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        fail(propertyPath(path, name), "array elements must be enumerable data properties");
      }
      descriptors.set(index, descriptor);
    }

    const entries: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors.get(index);
      if (descriptor === undefined || !hasOwn(value, index)) {
        fail(`${path}[${index}]`, "sparse arrays are not JSON values");
      }
      entries.push(serializeJsonValue(descriptor.value, `${path}[${index}]`, active));
    }
    return `[${entries.join(",")}]`;
  } finally {
    active.delete(value);
  }
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function serializeObject(value: object, path: string, active: Set<object>): string {
  if (!isPlainObject(value)) fail(path, "only plain objects are JSON objects");
  if (active.has(value)) fail(path, "cyclic references are not JSON values");
  active.add(value);

  try {
    assertNoSymbolProperties(value, path);
    const keys = Object.getOwnPropertyNames(value);
    for (const key of keys) assertUnicodeScalarString(key, propertyPath(path, key));
    keys.sort(compareUtf16CodeUnits);

    const members = keys.map((key) => {
      const memberPath = propertyPath(path, key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        fail(memberPath, "object members must be enumerable data properties");
      }
      return `${serializeString(key, memberPath)}:${serializeJsonValue(descriptor.value, memberPath, active)}`;
    });
    return `{${members.join(",")}}`;
  } finally {
    active.delete(value);
  }
}

function serializeJsonValue(value: unknown, path: string, active: Set<object>): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) fail(path, "numbers must be finite");
      return JSON.stringify(value);
    case "string":
      return serializeString(value, path);
    case "object": {
      if (nodeUtilTypes.isProxy(value)) fail(path, "proxy objects are active values");
      return Array.isArray(value)
        ? serializeArray(value, path, active)
        : serializeObject(value, path, active);
    }
    default:
      return fail(path, `${typeof value} is not a JSON value`);
  }
}

/**
 * Serialize a runtime-validated JSON value using the RFC 8785 JSON
 * Canonicalization Scheme profile used by normative policy.
 *
 * This function deliberately performs no policy-aware normalization. In
 * particular, it does not lowercase identifiers, sort semantic sets, or
 * discard absent members. Raw-source parsers must reject duplicate mapping
 * keys before constructing the in-memory value because that information is no
 * longer observable here.
 */
export function canonicalizeJson(value: unknown): string {
  return serializeJsonValue(value, "$", new Set<object>());
}

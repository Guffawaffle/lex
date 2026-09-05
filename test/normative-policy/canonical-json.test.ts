import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  canonicalizeJson,
  compareUtf16CodeUnits,
} from "../../src/normative-policy/canonical-json.js";

describe("normative-policy canonical JSON", () => {
  test("serializes JSON primitives and ECMAScript numbers without whitespace", () => {
    assert.equal(
      canonicalizeJson({
        numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 1e-27, -0],
        literals: [null, true, false],
      }),
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27,0]}'
    );
    assert.equal(canonicalizeJson('line\n"\\'), `"line\\n\\"\\\\"`);
  });

  test("sorts object keys by unsigned UTF-16 code units", () => {
    const input = {
      "\ufb33": "Hebrew Letter Dalet With Dagesh",
      "\ud83d\ude00": "Emoji: Grinning Face",
      "\u00f6": "Latin Small Letter O With Diaeresis",
      "\u0080": "Control",
      "\u20ac": "Euro Sign",
      "1": "One",
      "\r": "Carriage Return",
    };

    assert.equal(
      canonicalizeJson(input),
      '{"\\r":"Carriage Return","1":"One","":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}'
    );
    assert.equal(compareUtf16CodeUnits("a", "aa"), -1);
    assert.equal(compareUtf16CodeUnits("😀", "\ufb33"), -1);
    assert.equal(compareUtf16CodeUnits("same", "same"), 0);
  });

  test("preserves string code points and ordered arrays", () => {
    assert.equal(
      canonicalizeJson({ composed: "\u00e9", decomposed: "e\u0301" }),
      '{"composed":"é","decomposed":"é"}'
    );
    assert.equal(
      canonicalizeJson({ rules: [{ ruleId: "z" }, { ruleId: "a" }] }),
      '{"rules":[{"ruleId":"z"},{"ruleId":"a"}]}'
    );
  });

  test("accepts repeated references when they are not cyclic", () => {
    const shared = { value: 1 };
    assert.equal(
      canonicalizeJson({ left: shared, right: shared }),
      '{"left":{"value":1},"right":{"value":1}}'
    );
  });

  test("rejects undefined and other non-JSON scalar values", () => {
    assert.throws(() => canonicalizeJson(undefined), /undefined is not a JSON value/);
    assert.throws(() => canonicalizeJson({ value: undefined }), /undefined is not a JSON value/);
    assert.throws(() => canonicalizeJson([undefined]), /undefined is not a JSON value/);
    assert.throws(() => canonicalizeJson(1n), /bigint is not a JSON value/);
    assert.throws(() => canonicalizeJson(Symbol("value")), /symbol is not a JSON value/);
    assert.throws(() => canonicalizeJson(() => undefined), /function is not a JSON value/);
  });

  test("rejects non-finite numbers", () => {
    assert.throws(() => canonicalizeJson(Number.NaN), /numbers must be finite/);
    assert.throws(() => canonicalizeJson(Number.POSITIVE_INFINITY), /numbers must be finite/);
    assert.throws(() => canonicalizeJson(Number.NEGATIVE_INFINITY), /numbers must be finite/);
  });

  test("rejects sparse arrays and additional array properties", () => {
    assert.throws(() => canonicalizeJson(new Array(1)), /arrays must be dense/);

    const withAdditionalProperty = [1] as number[] & { label?: string };
    withAdditionalProperty.label = "not-json";
    assert.throws(() => canonicalizeJson(withAdditionalProperty), /additional properties/);
  });

  test("rejects cyclic values", () => {
    const cyclicObject: Record<string, unknown> = {};
    cyclicObject.self = cyclicObject;
    assert.throws(() => canonicalizeJson(cyclicObject), /cyclic references/);

    const cyclicArray: unknown[] = [];
    cyclicArray.push(cyclicArray);
    assert.throws(() => canonicalizeJson(cyclicArray), /cyclic references/);
  });

  test("rejects non-plain objects", () => {
    class Example {
      readonly value = 1;
    }

    assert.throws(() => canonicalizeJson(new Date(0)), /only plain objects/);
    assert.throws(() => canonicalizeJson(new Map()), /only plain objects/);
    assert.throws(() => canonicalizeJson(new Example()), /only plain objects/);
  });

  test("rejects proxy objects and arrays without consulting their traps", () => {
    let trapReads = 0;
    const objectProxy = new Proxy(
      { value: 1 },
      {
        get(target, property, receiver) {
          trapReads += 1;
          return Reflect.get(target, property, receiver);
        },
      }
    );
    const arrayProxy = new Proxy([1], {
      get(target, property, receiver) {
        trapReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    assert.throws(() => canonicalizeJson(objectProxy), /proxy objects are active values/);
    assert.throws(() => canonicalizeJson(arrayProxy), /proxy objects are active values/);
    assert.equal(trapReads, 0);
  });

  test("rejects object behavior that JSON data cannot represent", () => {
    const accessor = {};
    Object.defineProperty(accessor, "value", { enumerable: true, get: () => 1 });
    assert.throws(() => canonicalizeJson(accessor), /enumerable data properties/);

    const hidden = {};
    Object.defineProperty(hidden, "value", { enumerable: false, value: 1 });
    assert.throws(() => canonicalizeJson(hidden), /enumerable data properties/);

    assert.throws(() => canonicalizeJson({ [Symbol("hidden")]: 1 }), /symbol-keyed properties/);
  });

  test("rejects unpaired UTF-16 surrogates in strings and member names", () => {
    assert.throws(() => canonicalizeJson("\ud800"), /unpaired UTF-16 surrogates/);
    assert.throws(() => canonicalizeJson({ ["\udc00"]: true }), /unpaired UTF-16 surrogates/);
  });
});

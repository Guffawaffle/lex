import { afterEach, test } from "node:test";
import assert from "node:assert";
import { MemoryFrameStore } from "@app/memory/store/memory/index.js";
import { MAX_CALLER_PROVENANCE_BYTES, remember } from "@app/shared/cli/remember.js";

const originalExitCode = process.exitCode;
const originalConsoleError = console.error;

afterEach(() => {
  process.exitCode = originalExitCode;
  console.error = originalConsoleError;
});

for (const invalid of [
  { name: "malformed JSON", value: "{" },
  { name: "an array", value: "[]" },
  {
    name: "an oversized object",
    value: JSON.stringify({ payload: "x".repeat(MAX_CALLER_PROVENANCE_BYTES) }),
  },
]) {
  test(`remember rejects ${invalid.name} provenance before writing`, async () => {
    const store = new MemoryFrameStore();
    const errors: string[] = [];
    console.error = (...values: unknown[]) => errors.push(values.map(String).join(" "));
    process.exitCode = undefined;

    await remember(
      {
        json: true,
        summary: "This must not be stored",
        modules: ["workspace/unscoped"],
        provenanceJson: invalid.value,
      },
      store
    );

    assert.equal(store.size(), 0);
    assert.equal(process.exitCode, 1);
    assert.match(errors.join("\n"), /INVALID_PROVENANCE_JSON/);
  });
}

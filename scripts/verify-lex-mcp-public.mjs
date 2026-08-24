#!/usr/bin/env node
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function required(name, pattern) {
  const value = option(name);
  if (!value || (pattern && !pattern.test(value))) {
    throw new Error(`missing or invalid ${name}`);
  }
  return value;
}

const metadataPath = required("--metadata");
const name = required("--name", /^@[a-z0-9._-]+\/[a-z0-9._-]+$/u);
const version = required("--version", /^[0-9]+\.[0-9]+\.[0-9]+$/u);
const lexVersion = required("--lex-version", /^[0-9]+\.[0-9]+\.[0-9]+$/u);
const observed = JSON.parse(readFileSync(metadataPath, "utf8"));

if (
  observed.version !== version ||
  observed.dependencies?.["@smartergpt/lex"] !== lexVersion ||
  observed.engines?.node !== ">=24" ||
  !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(observed["dist.integrity"] ?? "")
) {
  throw new Error(
    `${name}@${version} does not expose the exact reviewed Lex dependency edge and npm integrity`
  );
}

console.log(
  JSON.stringify(
    {
      package: `${name}@${version}`,
      lex: `@smartergpt/lex@${lexVersion}`,
      node: observed.engines.node,
      integrity: observed["dist.integrity"],
    },
    null,
    2
  )
);

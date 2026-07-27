/**
 * CLI Command: lex policy generate
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import { AXErrorException } from "../errors/ax-error.js";
import { POLICY_ERROR_CODES } from "../errors/error-codes.js";
import { validatePolicySchema } from "../policy/schema.js";
import * as output from "./output.js";
import { discoverModules, generatePolicyFile } from "./policy-generator.js";

const DEFAULT_POLICY_PATH = ".smartergpt/lex/lexmap.policy.json";

export interface PolicyGenerateOptions {
  rootDir?: string;
  srcDir?: string;
  policyPath?: string;
  force?: boolean;
  json?: boolean;
}

export interface PolicyGenerateResult {
  success: true;
  rootDir: string;
  policyPath: string;
  modulesDiscovered: number;
  moduleIds: string[];
}

export async function policyGenerate(
  options: PolicyGenerateOptions = {}
): Promise<PolicyGenerateResult> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const configuredPath = options.policyPath ?? DEFAULT_POLICY_PATH;
  const policyPath = isAbsolute(configuredPath) ? configuredPath : resolve(rootDir, configuredPath);

  if (existsSync(policyPath) && !options.force) {
    throw new AXErrorException(
      POLICY_ERROR_CODES.POLICY_ALREADY_EXISTS,
      `Policy file already exists: ${policyPath}`,
      ["Pass --force to replace it, or select another path with --output."],
      { policyPath }
    );
  }

  const modules = discoverModules({ rootDir, srcDir: options.srcDir });
  const policy = generatePolicyFile(modules);
  const validation = validatePolicySchema(policy);
  if (!validation.valid) {
    throw new AXErrorException(
      POLICY_ERROR_CODES.POLICY_INVALID,
      "Generated policy failed canonical validation.",
      ["Inspect the generated module IDs and ownership paths."],
      { errors: validation.errors }
    );
  }

  mkdirSync(dirname(policyPath), { recursive: true });
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");

  const result: PolicyGenerateResult = {
    success: true,
    rootDir,
    policyPath,
    modulesDiscovered: modules.length,
    moduleIds: modules.map((module) => module.id),
  };

  if (options.json) {
    output.json(result);
  } else {
    output.success(`Generated ${policyPath}`);
    output.info(`Discovered ${modules.length} module${modules.length === 1 ? "" : "s"}.`);
  }
  return result;
}

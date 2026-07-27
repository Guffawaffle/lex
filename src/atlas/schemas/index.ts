/**
 * Code Index schema exports through legacy Code Atlas names
 *
 * Layer 0: schema definitions for the experimental Code Index
 */

export {
  CodeUnitSchema,
  CodeUnitKindSchema,
  CodeUnitSpanSchema,
  parseCodeUnit,
  validateCodeUnit,
  type CodeUnit,
  type CodeUnitKind,
  type CodeUnitSpan,
} from "./code-unit.js";

export {
  CodeAtlasRunSchema,
  LimitsSchema,
  parseCodeAtlasRun,
  validateCodeAtlasRun,
  type CodeAtlasRun,
  type Limits,
} from "./code-atlas-run.js";

export {
  PolicySeedSchema,
  PolicySeedModuleSchema,
  parsePolicySeed,
  validatePolicySeed,
  type PolicySeed,
  type PolicySeedModule,
} from "./policy-seed.js";

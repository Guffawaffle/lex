/**
 * Module ID Validation - THE CRITICAL RULE Enforcement
 * 
 * Exports validation utilities and error types for ensuring module ID vocabulary alignment
 * between Frame metadata and lexmap.policy.json
 */

export { validateModuleIds } from './validator.js';
// @ts-ignore - importing from compiled dist directories
export { ModuleNotFoundError } from '../types/dist/validation.js';
// @ts-ignore - importing from compiled dist directories
export type { ValidationResult, ModuleIdError, ResolutionResult } from '../types/dist/validation.js';

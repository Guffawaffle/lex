/**
 * Module ID Validation - THE CRITICAL RULE Enforcement
 * 
 * Exports validation utilities and error types for ensuring module ID vocabulary alignment
 * between Frame metadata and lexmap.policy.json
 */

export { validateModuleIds, resolveModuleId } from './validator.js';
export { ModuleNotFoundError } from '../types/validation.js';
export type { ValidationResult, ModuleIdError, ResolutionResult } from '../types/validation.js';

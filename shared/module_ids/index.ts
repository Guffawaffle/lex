/**
 * Module ID Validation - THE CRITICAL RULE Enforcement
 * 
 * Exports validation utilities and error types for ensuring module ID vocabulary alignment
 * between Frame metadata and lexmap.policy.json
 */

export { validateModuleIds } from './validator.js';
export { ModuleNotFoundError } from '../types/validation.js';
export type { ValidationResult, ModuleIdError } from '../types/validation.js';

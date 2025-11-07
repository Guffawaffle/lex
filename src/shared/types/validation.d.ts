/**
 * TypeScript types for validation results and errors
 *
 * Used by module ID validation to report errors and suggestions
 */
export interface ModuleIdError {
    module: string;
    message: string;
    suggestions: string[];
}
export declare class ModuleNotFoundError extends Error {
    readonly module: string;
    readonly suggestions: string[];
    constructor(module: string, suggestions?: string[]);
}
export interface ValidationResult {
    valid: boolean;
    errors?: ModuleIdError[];
}
//# sourceMappingURL=validation.d.ts.map
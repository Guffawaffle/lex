/**
 * TypeScript types for validation results and errors
 *
 * Used by module ID validation to report errors and suggestions
 */
export class ModuleNotFoundError extends Error {
    module;
    suggestions;
    constructor(module, suggestions = []) {
        const suggestionText = suggestions.length > 0
            ? ` Did you mean '${suggestions[0]}'?`
            : '';
        super(`Module '${module}' not found in policy.${suggestionText}`);
        this.name = 'ModuleNotFoundError';
        this.module = module;
        this.suggestions = suggestions;
    }
}
//# sourceMappingURL=validation.js.map
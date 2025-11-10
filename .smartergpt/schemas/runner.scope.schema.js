import { z } from 'zod';
const ScopeSchema = z.object({
    modules: z.array(z.string()).optional(),
    directories: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional()
}).strict();
const LimitsSchema = z.object({
    maxFiles: z.number().optional(),
    maxLines: z.number().optional(),
    maxDuration: z.number().optional()
}).strict();
export const RunnerScopeSchema = z.object({
    version: z.string().optional(),
    scope: ScopeSchema.optional(),
    permissions: z.array(z.string()).optional(),
    limits: LimitsSchema.optional()
}).strict();

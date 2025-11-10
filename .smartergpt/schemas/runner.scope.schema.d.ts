import { z } from 'zod';
declare const ScopeSchema: z.ZodObject<{
    modules: z.ZodOptional<z.ZodArray<z.ZodString>>;
    directories: z.ZodOptional<z.ZodArray<z.ZodString>>;
    files: z.ZodOptional<z.ZodArray<z.ZodString>>;
    exclude: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
declare const LimitsSchema: z.ZodObject<{
    maxFiles: z.ZodOptional<z.ZodNumber>;
    maxLines: z.ZodOptional<z.ZodNumber>;
    maxDuration: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare const RunnerScopeSchema: z.ZodObject<{
    version: z.ZodOptional<z.ZodString>;
    scope: z.ZodOptional<z.ZodObject<{
        modules: z.ZodOptional<z.ZodArray<z.ZodString>>;
        directories: z.ZodOptional<z.ZodArray<z.ZodString>>;
        files: z.ZodOptional<z.ZodArray<z.ZodString>>;
        exclude: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
    permissions: z.ZodOptional<z.ZodArray<z.ZodString>>;
    limits: z.ZodOptional<z.ZodObject<{
        maxFiles: z.ZodOptional<z.ZodNumber>;
        maxLines: z.ZodOptional<z.ZodNumber>;
        maxDuration: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type Scope = z.infer<typeof ScopeSchema>;
export type Limits = z.infer<typeof LimitsSchema>;
export type RunnerScope = z.infer<typeof RunnerScopeSchema>;
export {};

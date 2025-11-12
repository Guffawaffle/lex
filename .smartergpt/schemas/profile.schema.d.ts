import { z } from "zod";
/**
 * Profile Configuration Schema
 * Corresponds to profile.schema.json
 */
export declare const ProfileSchema: z.ZodObject<{
    role: z.ZodEnum<{
        custom: "custom";
        development: "development";
        local: "local";
        example: "example";
        ci: "ci";
    }>;
    name: z.ZodOptional<z.ZodString>;
    version: z.ZodOptional<z.ZodString>;
    projectType: z.ZodOptional<z.ZodEnum<{
        nodejs: "nodejs";
        python: "python";
        generic: "generic";
    }>>;
    created: z.ZodOptional<z.ZodString>;
    owner: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type Profile = z.infer<typeof ProfileSchema>;

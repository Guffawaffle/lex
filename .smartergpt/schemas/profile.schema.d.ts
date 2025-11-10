import { z } from 'zod';
export declare const ProfileSchema: z.ZodObject<{
    role: z.ZodEnum<{
        custom: "custom";
        local: "local";
        development: "development";
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

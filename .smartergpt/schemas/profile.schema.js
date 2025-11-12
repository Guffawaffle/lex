import { z } from "zod";
/**
 * Profile Configuration Schema
 * Corresponds to profile.schema.json
 */
export const ProfileSchema = z
    .object({
    role: z.enum(["development", "local", "example", "ci", "custom"]),
    name: z.string().optional(),
    version: z.string().optional(),
    projectType: z.enum(["nodejs", "python", "generic"]).optional(),
    created: z.string().datetime().optional(),
    owner: z.string().optional(),
})
    .strict(); // Use .strict() instead of .loose() to match JSON Schema's additionalProperties: false

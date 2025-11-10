import { z } from 'zod';
declare const GateSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<{
        check: "check";
        validation: "validation";
        approval: "approval";
    }>;
    enabled: z.ZodBoolean;
    description: z.ZodOptional<z.ZodString>;
    config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, z.core.$strict>;
export declare const GatesSchema: z.ZodObject<{
    version: z.ZodOptional<z.ZodString>;
    gates: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<{
            check: "check";
            validation: "validation";
            approval: "approval";
        }>;
        enabled: z.ZodBoolean;
        description: z.ZodOptional<z.ZodString>;
        config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type Gate = z.infer<typeof GateSchema>;
export type Gates = z.infer<typeof GatesSchema>;
export {};

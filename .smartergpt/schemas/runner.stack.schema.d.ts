import { z } from 'zod';
declare const StackComponentSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodString;
    enabled: z.ZodOptional<z.ZodBoolean>;
    config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, z.core.$strict>;
export declare const RunnerStackSchema: z.ZodObject<{
    version: z.ZodOptional<z.ZodString>;
    stack: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        enabled: z.ZodOptional<z.ZodBoolean>;
        config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, z.core.$strict>>>;
    timeout: z.ZodOptional<z.ZodNumber>;
    retries: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export type StackComponent = z.infer<typeof StackComponentSchema>;
export type RunnerStack = z.infer<typeof RunnerStackSchema>;
export {};

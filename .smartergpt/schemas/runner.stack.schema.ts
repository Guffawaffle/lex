import { z } from 'zod';

const StackComponentSchema = z.object({
  name: z.string(),
  type: z.string(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.any()).optional()
}).strict();

export const RunnerStackSchema = z.object({
  version: z.string().optional(),
  stack: z.array(StackComponentSchema).optional(),
  timeout: z.number().optional(),
  retries: z.number().optional()
}).strict();

export type StackComponent = z.infer<typeof StackComponentSchema>;
export type RunnerStack = z.infer<typeof RunnerStackSchema>;

import { z } from 'zod';

const GateSchema = z.object({
  id: z.string(),
  type: z.enum(['validation', 'approval', 'check']),
  enabled: z.boolean(),
  description: z.string().optional(),
  config: z.record(z.string(), z.any()).optional()
}).strict();

export const GatesSchema = z.object({
  version: z.string().optional(),
  gates: z.array(GateSchema).optional()
}).strict();

export type Gate = z.infer<typeof GateSchema>;
export type Gates = z.infer<typeof GatesSchema>;

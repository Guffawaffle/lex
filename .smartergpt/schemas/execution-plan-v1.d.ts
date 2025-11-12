import { z } from "zod";
/**
 * Execution Plan v1 Schema
 * Corresponds to execution-plan-v1.json
 */
declare const SourceSpecSchema: z.ZodObject<{
    schemaVersion: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    acceptanceCriteria: z.ZodOptional<z.ZodArray<z.ZodString>>;
    technicalContext: z.ZodOptional<z.ZodString>;
    repo: z.ZodString;
    createdAt: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
declare const EpicSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodString;
    acceptanceCriteria: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
declare const SubIssueSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    type: z.ZodEnum<{
        feature: "feature";
        testing: "testing";
        docs: "docs";
        refactor: "refactor";
        bug: "bug";
    }>;
    acceptanceCriteria: z.ZodOptional<z.ZodArray<z.ZodString>>;
    dependsOn: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export declare const ExecutionPlanV1Schema: z.ZodObject<{
    schemaVersion: z.ZodString;
    sourceSpec: z.ZodObject<{
        schemaVersion: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        acceptanceCriteria: z.ZodOptional<z.ZodArray<z.ZodString>>;
        technicalContext: z.ZodOptional<z.ZodString>;
        repo: z.ZodString;
        createdAt: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    epic: z.ZodObject<{
        title: z.ZodString;
        description: z.ZodString;
        acceptanceCriteria: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>;
    subIssues: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        type: z.ZodEnum<{
            feature: "feature";
            testing: "testing";
            docs: "docs";
            refactor: "refactor";
            bug: "bug";
        }>;
        acceptanceCriteria: z.ZodOptional<z.ZodArray<z.ZodString>>;
        dependsOn: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
    createdAt: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type ExecutionPlanV1 = z.infer<typeof ExecutionPlanV1Schema>;
export type SourceSpec = z.infer<typeof SourceSpecSchema>;
export type Epic = z.infer<typeof EpicSchema>;
export type SubIssue = z.infer<typeof SubIssueSchema>;
export {};

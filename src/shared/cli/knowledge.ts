import type { Command } from "commander";
import {
  buildKnowledgeContext,
  checkKnowledgeWorkspace,
  explainKnowledgeFrame,
  indexKnowledgeWorkspace,
  type KnowledgeWorkspaceOptions,
} from "../../knowledge/index.js";
import { json } from "./output.js";

interface KnowledgeCliOptions {
  projectRoot?: string;
  repositoryKey?: string;
  database?: string;
}

function workspaceOptions(options: KnowledgeCliOptions): KnowledgeWorkspaceOptions {
  return {
    projectRoot: options.projectRoot ?? process.cwd(),
    ...(options.repositoryKey ? { repositoryKey: options.repositoryKey } : {}),
    ...(options.database ? { databasePath: options.database } : {}),
  };
}

function addWorkspaceOptions(command: Command): Command {
  return command
    .option("--project-root <path>", "Authorized repository root (default: current directory)")
    .option("--repository-key <key>", "Explicit repository key")
    .option("--database <path>", "Dedicated derived knowledge database path");
}

/** Register the structured KnowledgeFrame CLI surface. */
export function addKnowledgeCommands(program: Command): void {
  const knowledge = program
    .command("knowledge")
    .description("Compile and query explicit Markdown KnowledgeFrames");

  addWorkspaceOptions(
    knowledge.command("check").description("Validate selected Markdown without store writes")
  ).action((options: KnowledgeCliOptions) => {
    json(checkKnowledgeWorkspace(workspaceOptions(options)));
  });

  addWorkspaceOptions(
    knowledge.command("index").description("Build and atomically activate a coherent snapshot")
  ).action((options: KnowledgeCliOptions) => {
    json(indexKnowledgeWorkspace(workspaceOptions(options)));
  });

  addWorkspaceOptions(
    knowledge
      .command("context [query]")
      .description("Return bounded, prompt-safe, hard read-only knowledge context")
      .option("--limit <count>", "Maximum selected records", Number)
      .option("--max-bytes <bytes>", "Maximum bytes for selected record projections", Number)
  ).action(
    (
      query: string | undefined,
      options: KnowledgeCliOptions & { limit?: number; maxBytes?: number }
    ) => {
      json(
        buildKnowledgeContext({
          ...workspaceOptions(options),
          ...(query ? { query } : {}),
          ...(options.limit !== undefined ? { limit: options.limit } : {}),
          ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}),
        })
      );
    }
  );

  addWorkspaceOptions(
    knowledge
      .command("explain <id>")
      .description("Trace one logical ID to stored and current source provenance")
  ).action((id: string, options: KnowledgeCliOptions) => {
    json(explainKnowledgeFrame(id, workspaceOptions(options)));
  });
}

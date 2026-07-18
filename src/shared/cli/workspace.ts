import type { Command } from "commander";

import type {
  BindingId,
  RepositoryId,
  WorkspaceAdminInvocationV1,
  WorkspaceBindingAdminServiceV1,
} from "../runtime-scope/index.js";
import * as output from "./output.js";

export interface WorkspaceAdminCliV1 {
  readonly service: WorkspaceBindingAdminServiceV1;
  readonly invocation: WorkspaceAdminInvocationV1;
}

function compactReceipt(receipt: {
  readonly receiptId: string;
  readonly bindingId: string;
  readonly action?: string;
}): Record<string, string> {
  return {
    receiptId: receipt.receiptId,
    bindingId: receipt.bindingId,
    ...(receipt.action ? { action: receipt.action } : {}),
  };
}

function emit(value: unknown, json: boolean): void {
  if (json) {
    output.json(value);
  } else {
    output.info(JSON.stringify(value));
  }
}

function requireAdmin(options: WorkspaceAdminCliV1 | undefined): WorkspaceAdminCliV1 {
  if (!options) {
    throw new Error("Trusted workspace administration is not configured for this Lex host.");
  }
  return options;
}

/** Register the explicit surface-local binding lifecycle command family. */
export function addWorkspaceAdminCommands(
  program: Command,
  configured: WorkspaceAdminCliV1 | undefined
): void {
  const workspace = program
    .command("workspace")
    .description("Explicit trusted workspace binding lifecycle");

  workspace
    .command("bind")
    .description("Bind this repository instance to an authorized workspace")
    .option("--repository-id <id>", "Canonical repository ID when no declaration exists")
    .action(async (cmdOptions) => {
      const admin = requireAdmin(configured);
      const receipt = await admin.service.bind({
        ...admin.invocation,
        ...(cmdOptions.repositoryId
          ? { repositoryId: cmdOptions.repositoryId as RepositoryId }
          : {}),
      });
      emit(compactReceipt(receipt), program.opts().json || false);
    });

  workspace
    .command("inspect")
    .description("Inspect this execution surface's binding registry")
    .option("--full", "Include full capability-gated binding and receipt records")
    .action(async (cmdOptions) => {
      const admin = requireAdmin(configured);
      const inspection = await admin.service.inspect(admin.invocation);
      emit(
        cmdOptions.full
          ? inspection
          : {
              registryInstanceId: inspection.registryInstanceId,
              executionSurfaceId: inspection.executionSurfaceId,
              bindings: inspection.bindings.map(({ bindingId, state }) => ({ bindingId, state })),
              receiptCount: inspection.receipts.length,
            },
        program.opts().json || false
      );
    });

  workspace
    .command("rebind")
    .description("Explicitly move an existing binding while preserving stable evidence")
    .requiredOption("--binding-id <id>", "Binding ID")
    .requiredOption("--reason <text>", "Auditable reason")
    .action(async (cmdOptions) => {
      const admin = requireAdmin(configured);
      const receipt = await admin.service.rebind({
        ...admin.invocation,
        bindingId: cmdOptions.bindingId as BindingId,
        reason: cmdOptions.reason,
      });
      emit(compactReceipt(receipt), program.opts().json || false);
    });

  workspace
    .command("revoke")
    .description("Revoke an existing local binding")
    .requiredOption("--binding-id <id>", "Binding ID")
    .requiredOption("--reason <text>", "Auditable reason")
    .action(async (cmdOptions) => {
      const admin = requireAdmin(configured);
      await admin.service.revoke({
        ...admin.invocation,
        bindingId: cmdOptions.bindingId as BindingId,
        reason: cmdOptions.reason,
      });
      emit({ bindingId: cmdOptions.bindingId, state: "revoked" }, program.opts().json || false);
    });

  workspace
    .command("recover")
    .description("Create a new empty registry only when the surface registry is absent")
    .requiredOption("--yes", "Confirm explicit registry recovery")
    .action(async () => {
      const admin = requireAdmin(configured);
      const recovery = await admin.service.recover(admin.invocation);
      emit(recovery, program.opts().json || false);
    });
}

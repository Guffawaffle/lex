/**
 * Git utilities module
 *
 * Exports git branch, commit detection, runtime mode control, and command execution utilities
 */

export { getCurrentBranch, clearBranchCache } from "./branch.js";
export { getCurrentCommit, clearCommitCache } from "./commit.js";
export { runGit, type GitRunOptions } from "./run.js";
export {
  getGitMode,
  setGitMode,
  gitIsEnabled,
  getEnvBranch,
  getEnvCommit,
  type GitMode,
} from "./runtime.js";

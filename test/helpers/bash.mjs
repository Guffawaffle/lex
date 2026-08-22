import { existsSync } from "node:fs";
import { join } from "node:path";

export function findCompatibleBash() {
  if (process.platform !== "win32") return existsSync("/bin/bash") ? "/bin/bash" : undefined;

  const candidates = [
    process.env.ProgramFiles && join(process.env.ProgramFiles, "Git", "bin", "bash.exe"),
    process.env["ProgramFiles(x86)"] &&
      join(process.env["ProgramFiles(x86)"], "Git", "bin", "bash.exe"),
    process.env.LOCALAPPDATA &&
      join(process.env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe"),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

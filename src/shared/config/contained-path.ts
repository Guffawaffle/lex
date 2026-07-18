import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

export class ContainedPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContainedPathError";
  }
}

function isContained(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

/**
 * Resolve a path through its deepest existing ancestor and prove that physical
 * ancestor remains under the physical project root. This is sufficient for
 * selecting directories or unresolved output-free paths. File contents must
 * use readContainedFile so validation and consumption share one open handle.
 */
export function canonicalizeContainedPath(projectRoot: string, candidatePath: string): string {
  const resolvedRoot = resolve(projectRoot);
  if (!existsSync(resolvedRoot)) {
    throw new ContainedPathError("Authorized project root does not exist.");
  }
  const physicalRoot = realpathSync(resolvedRoot);
  const resolvedCandidate = resolve(candidatePath);

  let existingAncestor = resolvedCandidate;
  const unresolvedSegments: string[] = [];
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) {
      throw new ContainedPathError("Path has no existing ancestor.");
    }
    unresolvedSegments.unshift(basename(existingAncestor));
    existingAncestor = parent;
  }

  const physicalAncestor = realpathSync(existingAncestor);
  const canonicalCandidate = resolve(physicalAncestor, ...unresolvedSegments);
  if (!isContained(physicalRoot, canonicalCandidate)) {
    throw new ContainedPathError("Path escapes the authorized project root.");
  }
  return canonicalCandidate;
}

export interface ContainedFileSnapshot {
  readonly canonicalPath: string;
  readonly content: string;
}

/**
 * Open, physically validate, and consume one immutable file snapshot. Validation
 * after open proves the handle and contained physical path identify the same
 * file; all content is then read from that handle rather than reopening a path.
 */
export function readContainedFile(
  projectRoot: string,
  candidatePath: string
): ContainedFileSnapshot {
  const physicalRoot = realpathSync(resolve(projectRoot));
  const canonicalCandidate = canonicalizeContainedPath(physicalRoot, candidatePath);
  const noFollow = constants.O_NOFOLLOW ?? 0;
  let fileDescriptor: number | null = null;
  try {
    fileDescriptor = openSync(canonicalCandidate, constants.O_RDONLY | noFollow);
    const openedFile = fstatSync(fileDescriptor, { bigint: true });
    if (!openedFile.isFile()) {
      throw new ContainedPathError("Contained path is not a regular file.");
    }

    const postOpenPath = realpathSync(canonicalCandidate);
    if (!isContained(physicalRoot, postOpenPath)) {
      throw new ContainedPathError("Opened file escapes the authorized project root.");
    }
    const postOpenFile = statSync(postOpenPath, { bigint: true });
    if (openedFile.dev !== postOpenFile.dev || openedFile.ino !== postOpenFile.ino) {
      throw new ContainedPathError("Contained file changed while it was being opened.");
    }

    return {
      canonicalPath: postOpenPath,
      content: readFileSync(fileDescriptor, "utf8"),
    };
  } finally {
    if (fileDescriptor !== null) closeSync(fileDescriptor);
  }
}

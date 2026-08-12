import * as fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import * as path from 'node:path';

interface FileSystemIdentity {
  device: number;
  inode: number;
}

interface WorkspaceParentIdentity extends FileSystemIdentity {
  path: string;
}

export interface WorkspaceParentSnapshot {
  relativePath: string;
  parents: WorkspaceParentIdentity[];
}

export function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Refuse absolute path: ${relativePath}`);
  }

  const root = path.resolve(workspaceRoot);
  const target = path.resolve(root, relativePath);
  const relativeTarget = path.relative(root, target);

  if (relativeTarget === '..' || relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)) {
    throw new Error(`Refuse path outside workspace: ${relativePath}`);
  }

  rejectExistingSymlinks(root, target, relativePath);

  return target;
}

export async function createWorkspaceDirectory(
  workspaceRoot: string,
  directoryPath: string
): Promise<void> {
  const root = path.resolve(workspaceRoot);
  const target = resolveContainedPath(root, directoryPath);
  const relativeTarget = path.relative(root, target) || '.';
  const components = path.relative(root, target) === ''
    ? []
    : path.relative(root, target).split(path.sep);

  let currentPath = root;
  let currentIdentity = fileIdentity(
    await lstatDirectory(currentPath, relativeTarget)
  );

  for (const component of components) {
    await assertDirectoryIdentity(currentPath, currentIdentity, relativeTarget);
    const childPath = path.join(currentPath, component);
    let childStatus: fs.Stats;

    try {
      childStatus = await lstatDirectory(childPath, relativeTarget);
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error;
      }

      const parentBeforeCreate = await lstatDirectory(currentPath, relativeTarget);
      if (!isSameFile(currentIdentity, fileIdentity(parentBeforeCreate))) {
        throw new Error(`Refuse directory creation because a parent changed: ${relativeTarget}`);
      }

      try {
        await fsPromises.mkdir(childPath);
      } catch (createError) {
        if (!isExistingPathError(createError)) {
          throw createError;
        }
      }

      const parentAfterCreate = await lstatDirectory(currentPath, relativeTarget);
      if (!isSameFile(fileIdentity(parentBeforeCreate), fileIdentity(parentAfterCreate))) {
        throw new Error(`Refuse directory creation because a parent changed: ${relativeTarget}`);
      }
      childStatus = await lstatDirectory(childPath, relativeTarget);
    }

    currentPath = childPath;
    currentIdentity = fileIdentity(childStatus);
  }
}

export async function captureWorkspaceParentSnapshot(
  workspaceRoot: string,
  targetPath: string
): Promise<WorkspaceParentSnapshot> {
  const root = path.resolve(workspaceRoot);
  const target = resolveContainedPath(root, targetPath);
  const relativePath = path.relative(root, target) || '.';
  const parentPath = path.dirname(target);
  resolveContainedPath(root, parentPath);
  const parentRelativePath = path.relative(root, parentPath);
  const components = parentRelativePath === '' ? [] : parentRelativePath.split(path.sep);
  const parents: WorkspaceParentIdentity[] = [];
  let candidate = root;

  for (const component of [undefined, ...components]) {
    if (component !== undefined) {
      candidate = path.join(candidate, component);
    }
    const status = await lstatDirectory(candidate, relativePath);
    parents.push({ path: candidate, ...fileIdentity(status) });
  }

  return { relativePath, parents };
}

export async function assertWorkspaceParentsUnchanged(
  snapshot: WorkspaceParentSnapshot
): Promise<void> {
  for (const expected of snapshot.parents) {
    const current = await lstatDirectory(expected.path, snapshot.relativePath);
    if (!isSameFile(expected, fileIdentity(current))) {
      throw new Error(`Refuse write because a workspace parent changed: ${snapshot.relativePath}`);
    }
  }
}

function rejectExistingSymlinks(root: string, target: string, relativePath: string): void {
  const relativeTarget = path.relative(root, target);
  const components = relativeTarget === '' ? [] : relativeTarget.split(path.sep);
  const pathsToCheck = [root];

  for (const component of components) {
    pathsToCheck.push(path.join(pathsToCheck[pathsToCheck.length - 1], component));
  }

  for (const [index, candidate] of pathsToCheck.entries()) {
    let status: fs.Stats;
    try {
      status = fs.lstatSync(candidate);
    } catch (error) {
      if (isMissingPathError(error)) {
        return;
      }
      throw error;
    }

    if (!status.isSymbolicLink()) {
      continue;
    }

    try {
      fs.statSync(candidate);
    } catch (error) {
      if (isMissingPathError(error)) {
        throw new Error(`Refuse dangling symlink: ${relativePath}`);
      }
      throw error;
    }

    const kind = index === pathsToCheck.length - 1 ? 'leaf' : 'parent';
    throw new Error(`Refuse symlink ${kind}: ${relativePath}`);
  }
}

function resolveContainedPath(root: string, targetPath: string): string {
  const target = path.resolve(targetPath);
  const relativeTarget = path.relative(root, target);
  if (relativeTarget === '..' || relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)) {
    throw new Error(`Refuse path outside workspace: ${targetPath}`);
  }
  return target;
}

async function lstatDirectory(candidate: string, relativePath: string): Promise<fs.Stats> {
  const status = await fsPromises.lstat(candidate);
  if (status.isSymbolicLink()) {
    throw new Error(`Refuse symlink parent: ${relativePath}`);
  }
  if (!status.isDirectory()) {
    throw new Error(`Refuse non-directory parent: ${relativePath}`);
  }
  return status;
}

async function assertDirectoryIdentity(
  directoryPath: string,
  expected: FileSystemIdentity,
  relativePath: string
): Promise<void> {
  const current = fileIdentity(await lstatDirectory(directoryPath, relativePath));
  if (!isSameFile(expected, current)) {
    throw new Error(`Refuse directory creation because a parent changed: ${relativePath}`);
  }
}

function fileIdentity(status: { dev: number; ino: number }): FileSystemIdentity {
  return { device: status.dev, inode: status.ino };
}

function isSameFile(left: FileSystemIdentity, right: FileSystemIdentity): boolean {
  return left.device === right.device && left.inode === right.inode;
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isExistingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

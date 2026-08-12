import { constants as fsConstants, promises as fs } from 'node:fs';
import type * as vscode from 'vscode';
import {
  assertWorkspaceParentsUnchanged,
  captureWorkspaceParentSnapshot
} from './fileSafety';

export type FileWriteDecision = 'overwrite' | 'skip';
export type FileWriteResult = 'created' | 'overwritten' | 'skipped' | 'cancelled';

export function shouldWriteFile(exists: boolean, decision: 'overwrite' | 'skip'): boolean {
  return !exists || decision === 'overwrite';
}

export async function isExistingFile(uri: vscode.Uri): Promise<boolean> {
  try {
    await fs.lstat(uri.fsPath);
    return true;
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
    return false;
  }
}

export async function writeGeneratedFile(
  workspaceRoot: string,
  uri: vscode.Uri,
  content: string
): Promise<void> {
  const parentSnapshot = await captureWorkspaceParentSnapshot(workspaceRoot, uri.fsPath);
  const noFollow = fsConstants.O_NOFOLLOW ?? 0;
  const handle = await fs.open(
    uri.fsPath,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollow,
    0o666
  );
  try {
    await assertWorkspaceParentsUnchanged(parentSnapshot);
    const openedFile = await handle.stat();
    if (!openedFile.isFile()) {
      throw new Error(`Refuse non-file target: ${uri.fsPath}`);
    }
    await handle.writeFile(content, { encoding: 'utf8' });
  } finally {
    await handle.close();
  }
}

export async function chooseFileWriteDecision(relativePath: string): Promise<FileWriteDecision | undefined> {
  const vscode = await import('vscode');
  const selection = await vscode.window.showQuickPick(['Overwrite', 'Skip'], {
    placeHolder: `${relativePath} exists. Choose Overwrite or Skip.`,
    ignoreFocusOut: true
  });

  if (selection === 'Overwrite') {
    return 'overwrite';
  }
  if (selection === 'Skip') {
    return 'skip';
  }
  return undefined;
}

interface FileIdentity {
  device: number;
  inode: number;
}

interface FileWriteDependencies {
  lstatFile(uri: vscode.Uri): Promise<FileIdentity | undefined>;
  createFile(uri: vscode.Uri, content: string): Promise<void>;
  overwriteFile(uri: vscode.Uri, content: string, approvedFile: FileIdentity): Promise<void>;
}

export async function writeFileWithExplicitOverwrite(
  uri: vscode.Uri,
  content: string,
  chooseDecision: () => Promise<FileWriteDecision | undefined>,
  dependencies: FileWriteDependencies
): Promise<FileWriteResult> {
  const initialFile = await dependencies.lstatFile(uri);
  let approvedFile: FileIdentity | undefined;

  if (initialFile) {
    const decision = await chooseDecision();
    if (decision === undefined) {
      return 'cancelled';
    }
    if (decision === 'skip') {
      return 'skipped';
    }
    approvedFile = initialFile;
  }

  while (true) {
    const fileImmediatelyBeforeWrite = await dependencies.lstatFile(uri);
    if (!approvedFile && fileImmediatelyBeforeWrite) {
      const decision = await chooseDecision();
      if (decision === undefined) {
        return 'cancelled';
      }
      if (decision === 'skip') {
        return 'skipped';
      }
      approvedFile = fileImmediatelyBeforeWrite;
      continue;
    }

    if (approvedFile) {
      if (!fileImmediatelyBeforeWrite || !isSameFile(approvedFile, fileImmediatelyBeforeWrite)) {
        throw new Error(`Refuse write because ${uri.fsPath} changed after overwrite approval.`);
      }
      await dependencies.overwriteFile(uri, content, approvedFile);
      return 'overwritten';
    }

    try {
      await dependencies.createFile(uri, content);
      return 'created';
    } catch (error) {
      if (isExistingPathError(error)) {
        continue;
      }
      throw error;
    }
  }
}

export async function writeWorkspaceFileWithExplicitOverwrite(
  workspaceRoot: string,
  uri: vscode.Uri,
  content: string,
  chooseDecision: () => Promise<FileWriteDecision | undefined>
): Promise<FileWriteResult> {
  return writeFileWithExplicitOverwrite(uri, content, chooseDecision, {
    lstatFile: (targetUri) => lstatFile(workspaceRoot, targetUri),
    createFile: (targetUri, targetContent) =>
      writeGeneratedFile(workspaceRoot, targetUri, targetContent),
    overwriteFile: (targetUri, targetContent, approvedFile) =>
      overwriteApprovedFile(workspaceRoot, targetUri, targetContent, approvedFile)
  });
}

async function lstatFile(
  workspaceRoot: string,
  uri: vscode.Uri
): Promise<FileIdentity | undefined> {
  const parentSnapshot = await captureWorkspaceParentSnapshot(workspaceRoot, uri.fsPath);
  let status;
  try {
    status = await fs.lstat(uri.fsPath);
  } catch (error) {
    if (isMissingPathError(error)) {
      await assertWorkspaceParentsUnchanged(parentSnapshot);
      return undefined;
    }
    throw error;
  }

  await assertWorkspaceParentsUnchanged(parentSnapshot);
  if (status.isSymbolicLink()) {
    throw new Error(`Refuse symlink target: ${uri.fsPath}`);
  }
  if (!status.isFile()) {
    throw new Error(`Refuse non-file target: ${uri.fsPath}`);
  }
  return fileIdentity(status);
}

async function overwriteApprovedFile(
  workspaceRoot: string,
  uri: vscode.Uri,
  content: string,
  approvedFile: FileIdentity
): Promise<void> {
  const parentSnapshot = await captureWorkspaceParentSnapshot(workspaceRoot, uri.fsPath);
  const currentFile = await lstatFile(workspaceRoot, uri);
  if (!currentFile || !isSameFile(approvedFile, currentFile)) {
    throw new Error(`Refuse write because ${uri.fsPath} changed after overwrite approval.`);
  }

  const noFollow = fsConstants.O_NOFOLLOW ?? 0;
  const handle = await fs.open(uri.fsPath, fsConstants.O_WRONLY | noFollow);
  try {
    await assertWorkspaceParentsUnchanged(parentSnapshot);
    const openedFile = fileIdentity(await handle.stat());
    if (!isSameFile(approvedFile, openedFile)) {
      throw new Error(`Refuse write because ${uri.fsPath} changed after overwrite approval.`);
    }
    await handle.truncate(0);
    await handle.writeFile(content, { encoding: 'utf8' });
  } finally {
    await handle.close();
  }
}

function fileIdentity(status: { dev: number; ino: number }): FileIdentity {
  return { device: status.dev, inode: status.ino };
}

function isSameFile(left: FileIdentity, right: FileIdentity): boolean {
  return left.device === right.device && left.inode === right.inode;
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isExistingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

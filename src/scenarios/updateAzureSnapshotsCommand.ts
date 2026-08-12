import * as path from 'node:path';
import * as vscode from 'vscode';
import { buildAzureSnapshotData, renderAzureSnapshotModule } from '../testing/azureSnapshot';
import { createWorkspaceDirectory, resolveWorkspacePath } from './fileSafety';
import { chooseFileWriteDecision, writeWorkspaceFileWithExplicitOverwrite } from './fileWriter';

export async function updateAzureSnapshotsCommand(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage('Open a workspace folder first.');
    return;
  }

  const relativeTarget = path.join(
    'test',
    '__snapshots__',
    'azureDeploymentStarter.snap.cjs'
  );
  let targetFile = resolveWorkspacePath(folder.uri.fsPath, relativeTarget);

  const confirmation = await vscode.window.showQuickPick(['Yes', 'No'], {
    placeHolder: 'Update Azure snapshot hashes now?',
    ignoreFocusOut: true
  });

  if (confirmation !== 'Yes') {
    return;
  }

  const snapshotData = buildAzureSnapshotData();
  const content = renderAzureSnapshotModule(snapshotData);

  await createWorkspaceDirectory(folder.uri.fsPath, path.dirname(targetFile));
  targetFile = resolveWorkspacePath(folder.uri.fsPath, relativeTarget);
  const result = await writeWorkspaceFileWithExplicitOverwrite(
    folder.uri.fsPath,
    vscode.Uri.file(targetFile),
    content,
    () => chooseFileWriteDecision(relativeTarget)
  );
  if (result === 'cancelled' || result === 'skipped') {
    return;
  }

  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(targetFile));
  await vscode.window.showTextDocument(doc, { preview: false });

  vscode.window.showInformationMessage('Azure snapshot hashes updated.');
}

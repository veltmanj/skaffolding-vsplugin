import * as path from 'node:path';
import * as vscode from 'vscode';
import { createWorkspaceDirectory, resolveWorkspacePath } from './fileSafety';
import { chooseFileWriteDecision, writeWorkspaceFileWithExplicitOverwrite } from './fileWriter';

export async function createScenarioPackTemplate(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage('Open a workspace folder first.');
    return;
  }

  const scenarioId = await askInput('Scenario id', 'my-scenario-pack');
  if (!scenarioId) {
    return;
  }

  const label = await askInput('Scenario label', 'My Scenario Pack');
  if (!label) {
    return;
  }

  const description = await askInput('Scenario description', 'Describe what this scenario creates.');
  if (!description) {
    return;
  }

  const normalizedId = normalizeId(scenarioId);
  const fileName = `${normalizedId}.json`;
  const relativeTarget = path.join('.skaffold', 'scenario-packs', fileName);
  let targetFile = resolveWorkspacePath(folder.uri.fsPath, relativeTarget);

  await createWorkspaceDirectory(folder.uri.fsPath, path.dirname(targetFile));
  targetFile = resolveWorkspacePath(folder.uri.fsPath, relativeTarget);

  const content = createTemplate(normalizedId, label, description);
  const result = await writeWorkspaceFileWithExplicitOverwrite(
    folder.uri.fsPath,
    vscode.Uri.file(targetFile),
    content,
    () => chooseFileWriteDecision(relativeTarget)
  );
  if (result === 'cancelled' || result === 'skipped') {
    return;
  }

  const opened = await vscode.workspace.openTextDocument(vscode.Uri.file(targetFile));
  await vscode.window.showTextDocument(opened, { preview: false });
  vscode.window.showInformationMessage(`Scenario pack template created: ${path.relative(folder.uri.fsPath, targetFile)}`);
}

export function createTemplate(id: string, label: string, description: string): string {
  const template = {
    id,
    label,
    description,
    prompts: [
      {
        id: 'moduleName',
        label: 'Module name',
        type: 'input',
        required: true,
        default: 'billing'
      },
      {
        id: 'buildTool',
        label: 'Build tool',
        type: 'select',
        required: true,
        default: 'Maven',
        options: ['Maven', 'Gradle']
      },
      {
        id: 'reactive',
        label: 'Reactive stack',
        type: 'boolean',
        required: true,
        default: false
      }
    ],
    files: [
      {
        path: '{{moduleName}}/README.md',
        content: `# {{moduleName}}

Build tool: {{buildTool}}
Reactive: {{reactive}}
`
      }
    ]
  };

  return `${JSON.stringify(template, null, 2)}\n`;
}

function normalizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '') || 'my-scenario-pack';
}

async function askInput(prompt: string, value: string): Promise<string | undefined> {
  const entered = await vscode.window.showInputBox({
    prompt,
    value,
    ignoreFocusOut: true,
    validateInput: (text) => text.trim().length === 0 ? 'This value is required.' : undefined
  });

  return entered?.trim();
}

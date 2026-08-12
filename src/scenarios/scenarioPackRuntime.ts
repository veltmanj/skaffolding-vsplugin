import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { buildRenderedFiles, resolvePromptAnswers } from '../scenarioPacks/model';
import {
  PackPromptDefinition,
  PromptAnswers,
  ScenarioPackDefinition
} from '../scenarioPacks/types';
import { validateScenarioPack } from '../scenarioPacks/validation';
import { createWorkspaceDirectory, resolveWorkspacePath } from './fileSafety';
import { chooseFileWriteDecision, writeWorkspaceFileWithExplicitOverwrite } from './fileWriter';
import { Scenario } from './types';

export async function loadScenarioPackScenarios(): Promise<Scenario[]> {
  const packs = await loadScenarioPacksFromWorkspace();
  return packs.map(toScenario);
}

async function loadScenarioPacksFromWorkspace(): Promise<ScenarioPackDefinition[]> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return [];
  }

  const packDir = path.join(folder.uri.fsPath, '.skaffold', 'scenario-packs');

  let entries: string[] = [];
  try {
    entries = await fs.readdir(packDir);
  } catch {
    return [];
  }

  const packs: ScenarioPackDefinition[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) {
      continue;
    }

    const filePath = path.join(packDir, entry);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(data) as unknown;
      const pack = validateScenarioPack(parsed, entry);
      packs.push(pack);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showWarningMessage(`Skip scenario pack ${entry}: ${message}`);
    }
  }

  return packs;
}

function toScenario(pack: ScenarioPackDefinition): Scenario {
  return {
    id: `pack.${pack.id}`,
    label: pack.label,
    description: pack.description,
    run: async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        vscode.window.showErrorMessage('Open a workspace folder first.');
        return;
      }

      const rawAnswers = await askPackPrompts(pack.prompts);
      if (!rawAnswers) {
        return;
      }

      const answers = resolvePromptAnswers(pack.prompts, rawAnswers);
      const files = buildRenderedFiles(pack, answers);

      let createdCount = 0;
      let overwrittenCount = 0;
      let skippedCount = 0;
      for (const file of files) {
        const relativePath = file.path.replaceAll('\\', '/');
        const outputPath = resolveWorkspacePath(folder.uri.fsPath, relativePath);
        const outputUri = vscode.Uri.file(outputPath);
        await createWorkspaceDirectory(folder.uri.fsPath, path.dirname(outputPath));
        const result = await writeWorkspaceFileWithExplicitOverwrite(
          folder.uri.fsPath,
          outputUri,
          file.content,
          () => chooseFileWriteDecision(relativePath)
        );

        if (result === 'cancelled') {
          vscode.window.showInformationMessage(
            `Scenario pack cancelled. Files created: ${createdCount}. Files overwritten: ${overwrittenCount}. Files skipped: ${skippedCount}.`
          );
          return;
        }
        if (result === 'skipped') {
          skippedCount += 1;
          continue;
        }
        if (result === 'created') {
          createdCount += 1;
        } else {
          overwrittenCount += 1;
        }
      }

      vscode.window.showInformationMessage(
        `Scenario pack completed. Files created: ${createdCount}. Files overwritten: ${overwrittenCount}. Files skipped: ${skippedCount}.`
      );
    }
  };
}

async function askPackPrompts(prompts: PackPromptDefinition[]): Promise<PromptAnswers | undefined> {
  const answers: PromptAnswers = {};

  for (const prompt of prompts) {
    const value = await askPrompt(prompt);
    if (value === undefined) {
      return undefined;
    }
    answers[prompt.id] = value;
  }

  return answers;
}

async function askPrompt(prompt: PackPromptDefinition): Promise<string | boolean | undefined> {
  if (prompt.type === 'input') {
    const value = prompt.default === undefined ? '' : String(prompt.default);
    const entered = await vscode.window.showInputBox({
      prompt: prompt.label,
      value,
      ignoreFocusOut: true,
      validateInput: (text) => {
        if (prompt.required === false) {
          return undefined;
        }
        return text.trim().length === 0 ? 'This value is required.' : undefined;
      }
    });

    return entered?.trim();
  }

  if (prompt.type === 'select') {
    const options = prompt.options ?? [];
    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: prompt.label,
      ignoreFocusOut: true
    });
    return selected;
  }

  const selected = await vscode.window.showQuickPick(['Yes', 'No'], {
    placeHolder: prompt.label,
    ignoreFocusOut: true
  });
  if (!selected) {
    return undefined;
  }
  return selected === 'Yes';
}

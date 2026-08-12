import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  AzureDeploymentAnswers,
  buildAzureStarterFiles,
  validateAzureDeploymentAnswers
} from './azureDeploymentTemplates';
import { createWorkspaceDirectory, resolveWorkspacePath } from './fileSafety';
import { chooseFileWriteDecision, writeWorkspaceFileWithExplicitOverwrite } from './fileWriter';
import { Scenario } from './types';

type IaCFlavor = 'Bicep' | 'Terraform';

export const createAzureDeploymentStarterScenario: Scenario = {
  id: 'azure.spring.create-deployment-starter',
  label: 'Azure: Create Deployment Starter (Spring Boot + PostgreSQL)',
  description: 'Create Bicep or Terraform starter files for Spring Boot and PostgreSQL.',
  run: async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('Open a workspace folder first.');
      return;
    }

    const answers = await askQuestions();
    if (!answers) {
      return;
    }

    let files;
    try {
      files = buildAzureStarterFiles(answers);
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Azure input validation failed.');
      return;
    }

    let createdCount = 0;
    let overwrittenCount = 0;
    let skippedCount = 0;
    for (const file of files) {
      const absolutePath = resolveWorkspacePath(workspaceFolder.uri.fsPath, file.path);
      const outputUri = vscode.Uri.file(absolutePath);
      await createWorkspaceDirectory(workspaceFolder.uri.fsPath, path.dirname(absolutePath));
      const result = await writeWorkspaceFileWithExplicitOverwrite(
        workspaceFolder.uri.fsPath,
        outputUri,
        file.content,
        () => chooseFileWriteDecision(file.path)
      );

      if (result === 'cancelled') {
        vscode.window.showInformationMessage(
          `Azure ${answers.iacFlavor} deployment starter cancelled. Files created: ${createdCount}. Files overwritten: ${overwrittenCount}. Files skipped: ${skippedCount}.`
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
      `Azure ${answers.iacFlavor} deployment starter complete in ${answers.targetFolder}. Files created: ${createdCount}. Files overwritten: ${overwrittenCount}. Files skipped: ${skippedCount}.`
    );
  }
};

async function askQuestions(): Promise<AzureDeploymentAnswers | undefined> {
  const iacFlavor = await pick<IaCFlavor>('IaC type', ['Bicep', 'Terraform']);
  if (!iacFlavor) {
    return undefined;
  }

  const targetFolder = await input('Target folder (relative to workspace root)', 'infra/azure', azureFieldValidator('targetFolder'));
  if (!targetFolder) {
    return undefined;
  }

  const resourceGroupName = await input('Resource group name', 'rg-spring-demo-dev', azureFieldValidator('resourceGroupName'));
  if (!resourceGroupName) {
    return undefined;
  }

  const location = await input('Azure location', 'westeurope', azureFieldValidator('location'));
  if (!location) {
    return undefined;
  }

  const appServiceName = await input('App Service name', 'app-spring-demo-dev', azureFieldValidator('appServiceName'));
  if (!appServiceName) {
    return undefined;
  }

  const postgresServerName = await input('PostgreSQL server name', 'psql-spring-demo-dev', azureFieldValidator('postgresServerName'));
  if (!postgresServerName) {
    return undefined;
  }

  const postgresDatabaseName = await input('PostgreSQL database name', 'appdb', azureFieldValidator('postgresDatabaseName'));
  if (!postgresDatabaseName) {
    return undefined;
  }

  const postgresAdminUser = await input('PostgreSQL admin user', 'appadmin', azureFieldValidator('postgresAdminUser'));
  if (!postgresAdminUser) {
    return undefined;
  }

  const postgresAppUser = await input('PostgreSQL application user', 'appuser', azureFieldValidator('postgresAppUser'));
  if (!postgresAppUser) {
    return undefined;
  }

  const answers: AzureDeploymentAnswers = {
    iacFlavor,
    targetFolder,
    resourceGroupName,
    location,
    appServiceName,
    postgresServerName,
    postgresDatabaseName,
    postgresAdminUser,
    postgresAppUser
  };

  const validationError = validateAzureDeploymentAnswers(answers);
  if (validationError) {
    vscode.window.showErrorMessage(validationError);
    return undefined;
  }

  return answers;
}

async function pick<T extends string>(title: string, options: T[]): Promise<T | undefined> {
  const selected = await vscode.window.showQuickPick(options, { placeHolder: title });
  return selected as T | undefined;
}

function azureFieldValidator(field: Exclude<keyof AzureDeploymentAnswers, 'iacFlavor'>): (value: string) => string | undefined {
  return (value) => validateAzureDeploymentAnswers({
    iacFlavor: 'Bicep',
    targetFolder: 'infra/azure',
    resourceGroupName: 'rg-spring-demo-dev',
    location: 'westeurope',
    appServiceName: 'app-spring-demo-dev',
    postgresServerName: 'psql-spring-demo-dev',
    postgresDatabaseName: 'appdb',
    postgresAdminUser: 'appadmin',
    postgresAppUser: 'appuser',
    [field]: value.trim()
  });
}

async function input(
  prompt: string,
  value: string,
  validateInput: (text: string) => string | undefined = requiredInputValidator
): Promise<string | undefined> {
  const entered = await vscode.window.showInputBox({
    prompt,
    value,
    ignoreFocusOut: true,
    validateInput: (text) => (text.trim().length === 0 ? 'This value is required.' : validateInput(text))
  });

  return entered?.trim();
}

function requiredInputValidator(): string | undefined {
  return undefined;
}

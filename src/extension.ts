import * as vscode from 'vscode';
import { getScenarioById, getScenarios } from './scenarios/registry';
import { createScenarioPackTemplate } from './scenarios/scenarioPackTemplateCommand';
import { ScenarioContext } from './scenarios/types';

export function activate(extensionContext: vscode.ExtensionContext): void {
  const runScenario = vscode.commands.registerCommand('skaffold.runScenario', async () => {
    await executeScenarioPicker(extensionContext);
  });

  const runCreateSpringBoot = vscode.commands.registerCommand('skaffold.createSpringBootService', async () => {
    await executeScenarioById(extensionContext, 'spring.boot.create-service');
  });

  const runCreateScenarioPackTemplate = vscode.commands.registerCommand('skaffold.createScenarioPackTemplate', async () => {
    await createScenarioPackTemplate();
  });

  const runCreateAzureStarter = vscode.commands.registerCommand('skaffold.createAzureDeploymentStarter', async () => {
    await executeScenarioById(extensionContext, 'azure.spring.create-deployment-starter');
  });

  const runAddSecurityConfig = vscode.commands.registerCommand('skaffold.addSpringSecurityConfig', async () => {
    await executeScenarioById(extensionContext, 'spring.boot.add-security-config');
  });

  extensionContext.subscriptions.push(
    runScenario,
    runCreateScenarioPackTemplate,
    runCreateSpringBoot,
    runCreateAzureStarter,
    runAddSecurityConfig
  );
}

export function deactivate(): void {
  // No resources to clean up yet.
}

async function executeScenarioPicker(extensionContext: vscode.ExtensionContext): Promise<void> {
  const scenarios = await Promise.resolve(getScenarios());

  const choice = await vscode.window.showQuickPick(
    scenarios.map((scenario) => ({
      label: scenario.label,
      description: scenario.description,
      scenarioId: scenario.id
    })),
    {
      placeHolder: 'Select a scaffolding scenario'
    }
  );

  if (!choice) {
    return;
  }

  await executeScenarioById(extensionContext, choice.scenarioId);
}

async function executeScenarioById(extensionContext: vscode.ExtensionContext, id: string): Promise<void> {
  const scenario = await Promise.resolve(getScenarioById(id));
  if (!scenario) {
    vscode.window.showErrorMessage(`Scenario not found: ${id}`);
    return;
  }

  const context: ScenarioContext = {
    extensionContext
  };

  try {
    await scenario.run(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Scenario failed: ${message}`);
  }
}

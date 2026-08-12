import * as vscode from 'vscode';

export interface ScenarioContext {
  readonly extensionContext: vscode.ExtensionContext;
}

export interface Scenario {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  run(context: ScenarioContext): Promise<void>;
}

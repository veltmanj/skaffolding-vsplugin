export type PackPromptType = 'input' | 'select' | 'boolean';

export interface PackPromptDefinition {
  id: string;
  label: string;
  type: PackPromptType;
  required?: boolean;
  default?: string | boolean;
  options?: string[];
}

export interface PackFileDefinition {
  path: string;
  content: string;
}

export interface ScenarioPackDefinition {
  id: string;
  label: string;
  description: string;
  prompts: PackPromptDefinition[];
  files: PackFileDefinition[];
}

export type PromptAnswers = Record<string, string | boolean>;

export interface RenderedPackFile {
  path: string;
  content: string;
}

import {
  PackPromptDefinition,
  PromptAnswers,
  RenderedPackFile,
  ScenarioPackDefinition
} from './types';

export const PROMPT_ID_PATTERN_SOURCE = '^[a-z][a-zA-Z0-9]*$';
const PROMPT_ID_PATTERN = new RegExp(PROMPT_ID_PATTERN_SOURCE);

export interface ScannedTemplatePlaceholder {
  start: number;
  end: number;
  promptId: string;
}

export function resolvePromptAnswers(
  prompts: PackPromptDefinition[],
  provided: Record<string, unknown>
): PromptAnswers {
  const resolved: PromptAnswers = {};

  for (const prompt of prompts) {
    assertValidPromptId(prompt.id);
    const raw = provided[prompt.id];
    const value = raw === undefined || raw === null || raw === '' ? prompt.default : raw;

    if ((value === undefined || value === null || value === '') && prompt.required !== false) {
      throw new Error(`Prompt is required: ${prompt.id}`);
    }

    if (value === undefined || value === null) {
      continue;
    }

    if (prompt.type === 'boolean') {
      resolved[prompt.id] = coerceBoolean(value, prompt.id);
      continue;
    }

    const textValue = coerceText(value, prompt.id);
    if (prompt.type === 'select') {
      validateSelectOption(prompt, textValue);
    }
    resolved[prompt.id] = textValue;
  }

  return resolved;
}

export function buildRenderedFiles(
  pack: ScenarioPackDefinition,
  answers: PromptAnswers
): RenderedPackFile[] {
  const promptIds = new Set(pack.prompts.map((prompt) => prompt.id));
  return pack.files.map((file) => ({
    path: renderTemplateWithPromptIds(file.path, answers, promptIds),
    content: renderTemplateWithPromptIds(file.content, answers, promptIds)
  }));
}

export function renderTemplate(template: string, answers: PromptAnswers): string {
  return renderTemplateWithPromptIds(template, answers, new Set(Object.keys(answers)));
}

export function isValidPromptId(value: string): boolean {
  return PROMPT_ID_PATTERN.test(value);
}

export function scanTemplatePlaceholders(
  template: string,
  promptIds: ReadonlySet<string>,
  field: string
): ScannedTemplatePlaceholder[] {
  const placeholders: ScannedTemplatePlaceholder[] = [];
  let cursor = 0;

  while (cursor < template.length) {
    const opening = template.indexOf('{{', cursor);
    const closing = template.indexOf('}}', cursor);

    if (closing !== -1 && (opening === -1 || closing < opening)) {
      throw new Error(`${field} contains an unmatched "}}" delimiter.`);
    }
    if (opening === -1) {
      break;
    }

    const placeholderEnd = template.indexOf('}}', opening + 2);
    if (placeholderEnd === -1) {
      throw new Error(`${field} contains an unmatched "{{" delimiter.`);
    }

    const nestedOpening = template.indexOf('{{', opening + 2);
    if (nestedOpening !== -1 && nestedOpening < placeholderEnd) {
      throw new Error(`${field} contains a nested "{{" delimiter.`);
    }

    const promptId = template.slice(opening + 2, placeholderEnd).trim();
    if (!isValidPromptId(promptId)) {
      throw new Error(`${field} contains malformed placeholder ID "${promptId}".`);
    }
    if (!promptIds.has(promptId)) {
      throw new Error(`${field} contains unknown placeholder "${promptId}".`);
    }

    placeholders.push({ start: opening, end: placeholderEnd + 2, promptId });
    cursor = placeholderEnd + 2;
  }

  return placeholders;
}

function renderTemplateWithPromptIds(
  template: string,
  answers: PromptAnswers,
  promptIds: ReadonlySet<string>
): string {
  const placeholders = scanTemplatePlaceholders(template, promptIds, 'Template');
  let rendered = '';
  let cursor = 0;

  for (const placeholder of placeholders) {
    rendered += template.slice(cursor, placeholder.start);
    const value = answers[placeholder.promptId];
    rendered += value === undefined ? '' : String(value);
    cursor = placeholder.end;
  }

  return rendered + template.slice(cursor);
}

function assertValidPromptId(promptId: string): void {
  if (!isValidPromptId(promptId)) {
    throw new Error(`prompt ID must match ${PROMPT_ID_PATTERN_SOURCE}.`);
  }
}

function coerceBoolean(value: unknown, promptId: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = coerceText(value, promptId).toLowerCase();
  if (normalized === 'true' || normalized === 'yes' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === 'no' || normalized === '0') {
    return false;
  }

  throw new Error(`Invalid boolean for prompt ${promptId}: ${safeDescribe(value)}`);
}

function coerceText(value: unknown, promptId: string): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return `${value}`.trim();
  }
  throw new TypeError(`Prompt ${promptId} must be a string, number, or boolean.`);
}

function safeDescribe(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${value}`;
  }
  return Object.prototype.toString.call(value);
}

function validateSelectOption(prompt: PackPromptDefinition, value: string): void {
  if (!prompt.options || prompt.options.length === 0) {
    throw new Error(`Prompt ${prompt.id} has no options.`);
  }

  if (!prompt.options.includes(value)) {
    throw new Error(`Value ${value} is not valid for prompt ${prompt.id}`);
  }
}

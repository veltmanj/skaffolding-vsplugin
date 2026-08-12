import {
  PackFileDefinition,
  PackPromptDefinition,
  PackPromptType,
  ScenarioPackDefinition
} from './types';
import {
  isValidPromptId,
  PROMPT_ID_PATTERN_SOURCE,
  scanTemplatePlaceholders
} from './model';

const PACK_FIELDS = new Set(['id', 'label', 'description', 'prompts', 'files']);
const PROMPT_FIELDS = new Set(['id', 'label', 'type', 'required', 'default', 'options']);
const FILE_FIELDS = new Set(['path', 'content']);
const PROMPT_TYPES = new Set<PackPromptType>(['input', 'select', 'boolean']);
const PACK_ID_PATTERN_SOURCE = '^[a-z0-9]+(?:-[a-z0-9]+)*$';
const PACK_ID_PATTERN = new RegExp(PACK_ID_PATTERN_SOURCE);

export function validateScenarioPack(value: unknown, fileName: string): ScenarioPackDefinition {
  const pack = requireObject(value, fileName, 'pack');
  rejectUnknownFields(pack, PACK_FIELDS, fileName, 'pack');

  const id = requireString(pack.id, fileName, 'id');
  if (!PACK_ID_PATTERN.test(id)) {
    fail(fileName, `id must match ${PACK_ID_PATTERN_SOURCE}.`);
  }

  const label = requireNonEmptyString(pack.label, fileName, 'label');
  const description = requireNonEmptyString(pack.description, fileName, 'description');
  const prompts = requireArray(pack.prompts, fileName, 'prompts').map((prompt, index) =>
    validatePrompt(prompt, fileName, index)
  );
  const files = requireArray(pack.files, fileName, 'files').map((file, index) =>
    validateFile(file, fileName, index)
  );

  if (files.length === 0) {
    fail(fileName, 'files must contain at least one file.');
  }

  const promptIds = new Set<string>();
  for (const [index, prompt] of prompts.entries()) {
    if (promptIds.has(prompt.id)) {
      fail(fileName, `prompts[${index}].id duplicates "${prompt.id}".`);
    }
    promptIds.add(prompt.id);
  }

  for (const [index, file] of files.entries()) {
    validatePlaceholders(file.path, promptIds, fileName, `files[${index}].path`);
    validatePlaceholders(file.content, promptIds, fileName, `files[${index}].content`);
  }

  return { id, label, description, prompts, files };
}

function validatePrompt(value: unknown, fileName: string, index: number): PackPromptDefinition {
  const field = `prompts[${index}]`;
  const prompt = requireObject(value, fileName, field);
  rejectUnknownFields(prompt, PROMPT_FIELDS, fileName, field);

  const id = requireNonEmptyString(prompt.id, fileName, `${field}.id`);
  if (!isValidPromptId(id)) {
    fail(fileName, `${field}.prompt ID must match ${PROMPT_ID_PATTERN_SOURCE}.`);
  }
  const label = requireNonEmptyString(prompt.label, fileName, `${field}.label`);
  const type = requirePromptType(prompt.type, fileName, `${field}.type`);
  const required = optionalBoolean(prompt, 'required', fileName, field);
  const options = optionalOptions(prompt, fileName, field);

  if (type !== 'select' && options !== undefined) {
    fail(fileName, `${field}.options is only valid for select prompts.`);
  }

  const defaultValue = optionalDefault(prompt, type, options, fileName, field);

  if (type === 'select' && (!options || options.length === 0)) {
    fail(fileName, `${field}.options must contain at least one option.`);
  }

  return {
    id,
    label,
    type,
    ...(required === undefined ? {} : { required }),
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
    ...(options === undefined ? {} : { options })
  };
}

function validateFile(value: unknown, fileName: string, index: number): PackFileDefinition {
  const field = `files[${index}]`;
  const file = requireObject(value, fileName, field);
  rejectUnknownFields(file, FILE_FIELDS, fileName, field);

  return {
    path: requireNonEmptyString(file.path, fileName, `${field}.path`),
    content: requireString(file.content, fileName, `${field}.content`)
  };
}

function optionalBoolean(
  value: Record<string, unknown>,
  key: string,
  fileName: string,
  field: string
): boolean | undefined {
  const candidate = value[key];
  if (candidate === undefined) {
    return undefined;
  }
  if (typeof candidate !== 'boolean') {
    fail(fileName, `${field}.${key} must be a boolean.`);
  }
  return candidate;
}

function optionalOptions(
  value: Record<string, unknown>,
  fileName: string,
  field: string
): string[] | undefined {
  const candidate = value.options;
  if (candidate === undefined) {
    return undefined;
  }
  if (!Array.isArray(candidate)) {
    fail(fileName, `${field}.options must be an array of strings.`);
  }

  return candidate.map((option, optionIndex) =>
    requireNonEmptyString(option, fileName, `${field}.options[${optionIndex}]`)
  );
}

function optionalDefault(
  value: Record<string, unknown>,
  type: PackPromptType,
  options: string[] | undefined,
  fileName: string,
  field: string
): string | boolean | undefined {
  const candidate = value.default;
  if (candidate === undefined) {
    return undefined;
  }

  if (type === 'boolean') {
    if (typeof candidate !== 'boolean') {
      fail(fileName, `${field}.default must be a boolean.`);
    }
    return candidate;
  }

  if (typeof candidate !== 'string') {
    fail(fileName, `${field}.default must be a string.`);
  }
  if (type === 'select' && (!options || !options.includes(candidate))) {
    fail(fileName, `${field}.default must be one of its options.`);
  }
  return candidate;
}

function requirePromptType(value: unknown, fileName: string, field: string): PackPromptType {
  if (typeof value !== 'string' || !PROMPT_TYPES.has(value as PackPromptType)) {
    fail(fileName, `${field} must be input, select, or boolean.`);
  }
  return value as PackPromptType;
}

function requireArray(value: unknown, fileName: string, field: string): unknown[] {
  if (!Array.isArray(value)) {
    fail(fileName, `${field} must be an array.`);
  }
  return value;
}

function requireObject(value: unknown, fileName: string, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(fileName, `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, fileName: string, field: string): string {
  if (typeof value !== 'string') {
    fail(fileName, `${field} must be a string.`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, fileName: string, field: string): string {
  const text = requireString(value, fileName, field);
  if (text.length === 0) {
    fail(fileName, `${field} must be a non-empty string.`);
  }
  return text;
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowedFields: Set<string>,
  fileName: string,
  field: string
): void {
  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key)) {
      fail(fileName, `${field} contains unknown field "${key}".`);
    }
  }
}

function validatePlaceholders(
  template: string,
  promptIds: ReadonlySet<string>,
  fileName: string,
  field: string
): void {
  try {
    scanTemplatePlaceholders(template, promptIds, field);
  } catch (error) {
    fail(fileName, error instanceof Error ? error.message : `Cannot validate ${field}.`);
  }
}

function fail(fileName: string, message: string): never {
  throw new Error(`${fileName}: ${message}`);
}

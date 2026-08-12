const test = require('node:test');
const assert = require('node:assert/strict');
const Ajv2020 = require('ajv/dist/2020').default;

const { validateScenarioPack } = require('../out/scenarioPacks/validation.js');
const scenarioPackSchema = require('../schemas/scenario-pack.schema.json');
const validateSchema = new Ajv2020({ allErrors: true, strict: true, strictRequired: false })
  .compile(scenarioPackSchema);

function validPack() {
  return {
    id: 'demo-pack',
    label: 'Demo pack',
    description: 'Create one demo file.',
    prompts: [
      {
        id: 'name',
        label: 'Name',
        type: 'input',
        default: 'demo'
      }
    ],
    files: [
      {
        path: 'README.md',
        content: '# Demo\n'
      }
    ]
  };
}

test('validates a complete scenario pack', () => {
  const pack = validPack();

  assert.deepEqual(validateScenarioPack(pack, 'demo.json'), pack);
});

test('rejects a scenario pack with invalid top-level fields', () => {
  const pack = validPack();
  pack.id = 'Demo Pack';

  assert.throws(() => {
    validateScenarioPack(pack, 'invalid-pack.json');
  }, /invalid-pack\.json: id must match/);
});

test('uses one strict kebab-case pattern for pack IDs', () => {
  const validIds = ['demo', 'demo2', '2demo', 'demo-pack', 'demo-2-pack'];
  const invalidIds = ['Demo', 'demo_pack', '-demo', 'demo-', 'demo--pack'];
  const schemaPattern = new RegExp(scenarioPackSchema.properties.id.pattern);

  for (const packId of validIds) {
    const pack = validPack();
    pack.id = packId;

    assert.equal(validateScenarioPack(pack, `${packId}.json`).id, packId);
    assert.equal(schemaPattern.test(packId), true, packId);
  }

  for (const packId of invalidIds) {
    const pack = validPack();
    pack.id = packId;

    assert.throws(
      () => validateScenarioPack(pack, `invalid-pack-id.json`),
      /invalid-pack-id\.json: id must match/
    );
    assert.equal(schemaPattern.test(packId), false, packId);
  }
});

test('rejects a top-level field with the wrong type', () => {
  const pack = validPack();
  pack.label = 42;

  assert.throws(() => {
    validateScenarioPack(pack, 'wrong-top-level-type.json');
  }, /wrong-top-level-type\.json: label must be a string/);
});

test('rejects each top-level field with the wrong type', () => {
  const cases = [
    ['id', 42, 'id must be a string'],
    ['description', 42, 'description must be a string'],
    ['prompts', {}, 'prompts must be an array'],
    ['files', {}, 'files must be an array']
  ];

  for (const [field, value, message] of cases) {
    const pack = validPack();
    pack[field] = value;

    assert.throws(() => validateScenarioPack(pack, `wrong-${field}.json`),
      new RegExp(`wrong-${field}\\.json: ${message}\\.`));
  }
});

test('rejects unknown scenario pack fields', () => {
  const pack = { ...validPack(), extra: true };

  assert.throws(() => {
    validateScenarioPack(pack, 'unknown-pack-field.json');
  }, /unknown-pack-field\.json: pack contains unknown field "extra"/);
});

test('rejects an invalid prompt type', () => {
  const pack = validPack();
  pack.prompts[0].type = 'number';

  assert.throws(() => {
    validateScenarioPack(pack, 'invalid-prompt-type.json');
  }, /invalid-prompt-type\.json: prompts\[0\]\.type must be input, select, or boolean/);
});

test('rejects duplicate prompt IDs', () => {
  const pack = validPack();
  pack.prompts.push({ id: 'name', label: 'Other name', type: 'input' });

  assert.throws(() => {
    validateScenarioPack(pack, 'duplicate-prompt.json');
  }, /duplicate-prompt\.json: prompts\[1\]\.id duplicates "name"/);
});

test('rejects invalid prompt defaults', () => {
  const pack = validPack();
  pack.prompts[0] = {
    id: 'enabled',
    label: 'Enabled',
    type: 'boolean',
    default: 'yes'
  };

  assert.throws(() => {
    validateScenarioPack(pack, 'invalid-default.json');
  }, /invalid-default\.json: prompts\[0\]\.default must be a boolean/);
});

test('rejects a select prompt without options', () => {
  const pack = validPack();
  pack.prompts[0] = {
    id: 'build',
    label: 'Build tool',
    type: 'select'
  };

  assert.throws(() => {
    validateScenarioPack(pack, 'missing-options.json');
  }, /missing-options\.json: prompts\[0\]\.options must contain at least one option/);
});

test('rejects a select prompt default outside its options', () => {
  const pack = validPack();
  pack.prompts[0] = {
    id: 'build',
    label: 'Build tool',
    type: 'select',
    options: ['Maven', 'Gradle'],
    default: 'Ant'
  };

  assert.throws(() => {
    validateScenarioPack(pack, 'invalid-select-default.json');
  }, /invalid-select-default\.json: prompts\[0\]\.default must be one of its options/);
});

test('schema applies the default type for each prompt type', () => {
  const cases = [
    {
      id: 'name',
      label: 'Name',
      type: 'input',
      default: false
    },
    {
      id: 'build',
      label: 'Build tool',
      type: 'select',
      options: ['Maven', 'Gradle'],
      default: false
    },
    {
      id: 'enabled',
      label: 'Enabled',
      type: 'boolean',
      default: 'false'
    }
  ];

  for (const prompt of cases) {
    const pack = validPack();
    pack.prompts[0] = prompt;

    assert.equal(validateSchema(pack), false, JSON.stringify(prompt));
  }
});

test('schema requires valid options only for select prompts', () => {
  const invalidPrompts = [
    { id: 'build', label: 'Build tool', type: 'select' },
    { id: 'build', label: 'Build tool', type: 'select', options: [] },
    { id: 'build', label: 'Build tool', type: 'select', options: [''] },
    { id: 'name', label: 'Name', type: 'input', options: ['Demo'] },
    { id: 'enabled', label: 'Enabled', type: 'boolean', options: ['Yes', 'No'] }
  ];

  for (const prompt of invalidPrompts) {
    const pack = validPack();
    pack.prompts[0] = prompt;

    assert.equal(validateSchema(pack), false, JSON.stringify(prompt));
  }

  const pack = validPack();
  pack.prompts[0] = {
    id: 'build',
    label: 'Build tool',
    type: 'select',
    options: ['Maven', 'Gradle'],
    default: 'Maven'
  };
  assert.equal(validateSchema(pack), true, JSON.stringify(validateSchema.errors));
});

test('runtime rejects options on input and boolean prompts', () => {
  const invalidPrompts = [
    { id: 'name', label: 'Name', type: 'input', options: ['Demo'] },
    { id: 'enabled', label: 'Enabled', type: 'boolean', options: ['Yes', 'No'] }
  ];

  for (const prompt of invalidPrompts) {
    const pack = validPack();
    pack.prompts[0] = prompt;

    assert.throws(
      () => validateScenarioPack(pack, `options-${prompt.type}.json`),
      new RegExp(`options-${prompt.type}\\.json: prompts\\[0\\]\\.options is only valid for select prompts`)
    );
  }
});

test('rejects unknown prompt fields', () => {
  const pack = validPack();
  pack.prompts[0].placeholder = 'Demo name';

  assert.throws(() => {
    validateScenarioPack(pack, 'unknown-prompt-field.json');
  }, /unknown-prompt-field\.json: prompts\[0\] contains unknown field "placeholder"/);
});

test('rejects prompt fields with invalid types', () => {
  const cases = [
    ['id', 42, 'must be a string'],
    ['label', 42, 'must be a string'],
    ['required', 'yes', 'must be a boolean'],
    ['options', 'Maven', 'must be an array of strings'],
    ['default', 42, 'must be a string']
  ];

  for (const [field, value, message] of cases) {
    const pack = validPack();
    pack.prompts[0][field] = value;

    assert.throws(() => validateScenarioPack(pack, `wrong-prompt-${field}.json`),
      new RegExp(`wrong-prompt-${field}\\.json: prompts\\[0\\]\\.${field} ${message}\\.`));
  }
});

test('rejects a boolean prompt with a non-boolean default', () => {
  const pack = validPack();
  pack.prompts[0] = {
    id: 'enabled',
    label: 'Enabled',
    type: 'boolean',
    default: 'true'
  };

  assert.throws(() => validateScenarioPack(pack, 'wrong-boolean-default.json'),
    /wrong-boolean-default\.json: prompts\[0\]\.default must be a boolean\./);
});

test('rejects malformed files', () => {
  const pack = validPack();
  pack.files[0] = { path: '', content: 42 };

  assert.throws(() => {
    validateScenarioPack(pack, 'malformed-file.json');
  }, /malformed-file\.json: files\[0\]\.path must be a non-empty string/);
});

test('rejects a file content field with the wrong type', () => {
  const pack = validPack();
  pack.files[0].content = 42;

  assert.throws(() => validateScenarioPack(pack, 'wrong-file-content.json'),
    /wrong-file-content\.json: files\[0\]\.content must be a string\./);
});

test('rejects unknown file fields', () => {
  const pack = validPack();
  pack.files[0].encoding = 'utf8';

  assert.throws(() => {
    validateScenarioPack(pack, 'unknown-file-field.json');
  }, /unknown-file-field\.json: files\[0\] contains unknown field "encoding"/);
});

test('uses one strict lower-camel-case pattern for prompt IDs', () => {
  const invalidIds = ['Name', 'name-with-dash', 'name_value', 'name.value', '9name'];

  for (const promptId of invalidIds) {
    const pack = validPack();
    pack.prompts[0].id = promptId;

    assert.throws(
      () => validateScenarioPack(pack, `prompt-${promptId}.json`),
      /prompt ID must match \^\[a-z\]\[a-zA-Z0-9\]\*\$/
    );
  }

  const schemaPattern = new RegExp(
    scenarioPackSchema.properties.prompts.items.properties.id.pattern
  );
  assert.equal(schemaPattern.test('moduleName'), true);
  for (const promptId of invalidIds) {
    assert.equal(schemaPattern.test(promptId), false, promptId);
  }
});

test('rejects file placeholders that do not name a declared prompt', () => {
  const pack = validPack();
  pack.files[0].content = '# {{missingName}}\n';

  assert.throws(
    () => validateScenarioPack(pack, 'unknown-placeholder.json'),
    /files\[0\]\.content contains unknown placeholder "missingName"/
  );
});

test('rejects malformed placeholder IDs', () => {
  const pack = validPack();
  pack.files[0].path = '{{bad-id}}/README.md';

  assert.throws(
    () => validateScenarioPack(pack, 'malformed-placeholder.json'),
    /files\[0\]\.path contains malformed placeholder ID "bad-id"/
  );
});

test('rejects unmatched placeholder delimiters in file paths and content', () => {
  const cases = [
    ['path', '{{name/README.md', /files\[0\]\.path contains an unmatched "\{\{" delimiter/],
    ['content', '# Demo }}\n', /files\[0\]\.content contains an unmatched "\}\}" delimiter/]
  ];

  for (const [field, value, message] of cases) {
    const pack = validPack();
    pack.files[0][field] = value;

    assert.throws(
      () => validateScenarioPack(pack, `unmatched-${field}.json`),
      message
    );
  }
});

test('runtime and schema reject malformed placeholder text', () => {
  const malformedValues = [
    '{{name',
    'name}}',
    '{{}}',
    '{{bad-id}}',
    '{{name {{other}}'
  ];

  for (const content of malformedValues) {
    const pack = validPack();
    pack.files[0].content = content;

    assert.throws(
      () => validateScenarioPack(pack, 'malformed-placeholder-text.json'),
      /malformed-placeholder-text\.json: files\[0\]\.content contains/
    );
    assert.equal(validateSchema(pack), false, content);
  }
});

test('runtime and schema accept valid placeholder text', () => {
  const pack = validPack();
  pack.files[0].content = 'Hello {{ name }}. Use a single } brace as text.';

  assert.doesNotThrow(() => validateScenarioPack(pack, 'valid-placeholder-text.json'));
  assert.equal(validateSchema(pack), true, JSON.stringify(validateSchema.errors));
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolvePromptAnswers,
  renderTemplate,
  buildRenderedFiles
} = require('../out/scenarioPacks/model.js');

test('resolvePromptAnswers uses defaults and boolean conversion', () => {
  const prompts = [
    { id: 'name', label: 'Name', type: 'input', default: 'demo' },
    { id: 'reactive', label: 'Reactive', type: 'boolean', default: true },
    { id: 'build', label: 'Build', type: 'select', options: ['Maven', 'Gradle'], default: 'Maven' }
  ];

  const answers = resolvePromptAnswers(prompts, {
    name: 'order-service',
    reactive: 'no'
  });

  assert.equal(answers.name, 'order-service');
  assert.equal(answers.reactive, false);
  assert.equal(answers.build, 'Maven');
});

test('resolvePromptAnswers fails for invalid select option', () => {
  const prompts = [
    { id: 'build', label: 'Build', type: 'select', options: ['Maven', 'Gradle'] }
  ];

  assert.throws(() => {
    resolvePromptAnswers(prompts, { build: 'Ant' });
  }, /not valid/);
});

test('renderTemplate and buildRenderedFiles render placeholders', () => {
  const pack = {
    id: 'demo',
    label: 'Demo',
    description: 'Demo pack',
    prompts: [
      { id: 'service', label: 'Service', type: 'input' },
      { id: 'javaVersion', label: 'Java version', type: 'input' }
    ],
    files: [
      {
        path: '{{service}}/README.md',
        content: '# {{service}}\nJava {{javaVersion}}\n'
      }
    ]
  };

  const answers = { service: 'billing-api', javaVersion: '25' };
  const output = buildRenderedFiles(pack, answers);

  assert.equal(output.length, 1);
  assert.equal(output[0].path, 'billing-api/README.md');
  assert.equal(output[0].content, '# billing-api\nJava 25\n');
  assert.equal(renderTemplate('A {{x}} B', { x: '1' }), 'A 1 B');
});

test('buildRenderedFiles allows a declared optional prompt with no answer', () => {
  const pack = {
    id: 'demo',
    label: 'Demo',
    description: 'Demo pack',
    prompts: [{ id: 'suffix', label: 'Suffix', type: 'input', required: false }],
    files: [{ path: 'README{{suffix}}.md', content: 'Demo\n' }]
  };

  assert.deepEqual(buildRenderedFiles(pack, {}), [
    { path: 'README.md', content: 'Demo\n' }
  ]);
});

test('renderTemplate rejects an unknown placeholder', () => {
  assert.throws(
    () => renderTemplate('{{known}} {{missing}}', { known: 'value' }),
    /unknown placeholder "missing"/
  );
});

test('renderTemplate rejects a malformed placeholder ID', () => {
  assert.throws(
    () => renderTemplate('{{bad-id}}', { badId: 'value' }),
    /malformed placeholder ID "bad-id"/
  );
});

test('renderTemplate rejects unmatched placeholder delimiters', () => {
  assert.throws(
    () => renderTemplate('Value: {{name', { name: 'demo' }),
    /unmatched "\{\{" delimiter/
  );
  assert.throws(
    () => renderTemplate('Value: name}}', { name: 'demo' }),
    /unmatched "\}\}" delimiter/
  );
});

test('renderTemplate rejects nested placeholder delimiters', () => {
  assert.throws(
    () => renderTemplate('{{name {{other}}', { name: 'demo', other: 'value' }),
    /nested "\{\{" delimiter/
  );
});

test('resolvePromptAnswers rejects a malformed prompt ID', () => {
  assert.throws(
    () => resolvePromptAnswers(
      [{ id: 'bad-id', label: 'Bad ID', type: 'input' }],
      { 'bad-id': 'value' }
    ),
    /prompt ID must match \^\[a-z\]\[a-zA-Z0-9\]\*\$/
  );
});

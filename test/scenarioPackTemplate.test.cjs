const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function loadVscodeMock(request, parent, isMain) {
  if (request === 'vscode') {
    return {};
  }

  return originalLoad.call(this, request, parent, isMain);
};

const { createTemplate } = require('../out/scenarios/scenarioPackTemplateCommand.js');
Module._load = originalLoad;

test('renders scenario pack README content with real line breaks', () => {
  const template = JSON.parse(createTemplate('demo-pack', 'Demo pack', 'Create a demo file.'));
  const readme = template.files[0].content;

  assert.equal(readme, '# {{moduleName}}\n\nBuild tool: {{buildTool}}\nReactive: {{reactive}}\n');
  assert.equal(readme.includes('\\n'), false);
});

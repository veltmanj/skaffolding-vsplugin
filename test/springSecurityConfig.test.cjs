const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const state = {
  root: '',
  quickPicks: [],
  inputBoxes: [],
  writes: []
};

const vscode = {
  Uri: {
    file: (fsPath) => ({ fsPath })
  },
  window: {
    showQuickPick: async () => state.quickPicks.shift(),
    showInputBox: async () => state.inputBoxes.shift(),
    showErrorMessage: async () => undefined,
    showInformationMessage: async () => undefined
  },
  workspace: {
    workspaceFolders: [],
    fs: {
      createDirectory: async (uri) => fs.mkdir(uri.fsPath, { recursive: true }),
      stat: async (uri) => fs.stat(uri.fsPath),
      writeFile: async (uri, content) => {
        state.writes.push(uri.fsPath);
        await fs.writeFile(uri.fsPath, content);
      }
    }
  }
};

const originalLoad = Module._load;
Module._load = function loadVscodeMock(request, parent, isMain) {
  if (request === 'vscode') {
    return vscode;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  addSpringSecurityConfigScenario,
  renderReactiveConfig,
  renderServletConfig
} = require('../out/scenarios/springSecurityConfig.js');
Module._load = originalLoad;

test.after(async () => {
  Module._load = originalLoad;
  if (state.root) {
    await fs.rm(state.root, { recursive: true, force: true });
  }
});

async function reset({ quickPicks = [], inputBoxes = [] } = {}) {
  if (state.root) {
    await fs.rm(state.root, { recursive: true, force: true });
  }
  state.root = await fs.mkdtemp(path.join(os.tmpdir(), 'skaffolding-security-'));
  state.quickPicks = quickPicks;
  state.inputBoxes = inputBoxes;
  state.writes = [];
  vscode.workspace.workspaceFolders = [{ uri: vscode.Uri.file(state.root) }];
}

test('marks Detached JWS servlet output as an incomplete placeholder', () => {
  const output = renderServletConfig('com.example.demo.config', 'Detached JWS');

  assert.match(output, /Selected security mode: Detached JWS/);
  assert.match(output, /PLACEHOLDER/i);
  assert.match(output, /not a complete implementation/i);
  assert.match(output, /Do not use this template as production verification/i);
});

test('marks WebAuthn reactive output as an incomplete placeholder', () => {
  const output = renderReactiveConfig('com.example.demo.config', 'WebAuthn');

  assert.match(output, /Selected security mode: WebAuthn/);
  assert.match(output, /PLACEHOLDER/i);
  assert.match(output, /not a complete implementation/i);
  assert.match(output, /Do not use this template as production authentication/i);
});

test('rejects a target service folder outside the workspace before writing', async () => {
  await reset({
    quickPicks: ['Reactive', 'Basic Authentication'],
    inputBoxes: ['com.example.demo', '../outside-service']
  });

  await assert.rejects(
    addSpringSecurityConfigScenario.run({}),
    /outside workspace/
  );
  assert.deepEqual(state.writes, []);
});

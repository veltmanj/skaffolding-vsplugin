const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const state = {
  infoMessages: [],
  warningMessages: [],
  inputBoxes: [],
  quickPicks: [],
  root: ''
};

const vscode = {
  Uri: {
    file: (fsPath) => ({ fsPath })
  },
  window: {
    showErrorMessage: async () => undefined,
    showInformationMessage: async (message) => {
      state.infoMessages.push(message);
      return undefined;
    },
    showQuickPick: async () => state.quickPicks.shift(),
    showWarningMessage: async (message) => {
      state.warningMessages.push(message);
      return undefined;
    },
    showInputBox: async () => state.inputBoxes.shift(),
    showTextDocument: async () => undefined
  },
  workspace: {
    fs: {
      createDirectory: async (uri) => fs.mkdir(uri.fsPath, { recursive: true }),
      stat: async (uri) => fs.stat(uri.fsPath),
      writeFile: async (uri, content) => fs.writeFile(uri.fsPath, content)
    },
    workspaceFolders: [],
    openTextDocument: async () => ({})
  }
};

const originalLoad = Module._load;
Module._load = function loadVscodeMock(request, parent, isMain) {
  if (request === 'vscode') {
    return vscode;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { loadScenarioPackScenarios } = require('../out/scenarios/scenarioPackRuntime.js');
const { createSpringBootServiceScenario } = require('../out/scenarios/springBootNewService.js');
const { createAzureDeploymentStarterScenario } = require('../out/scenarios/azureDeploymentStarter.js');
const { addSpringSecurityConfigScenario } = require('../out/scenarios/springSecurityConfig.js');
const { createScenarioPackTemplate } = require('../out/scenarios/scenarioPackTemplateCommand.js');
const { updateAzureSnapshotsCommand } = require('../out/scenarios/updateAzureSnapshotsCommand.js');

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
  state.root = await fs.mkdtemp(path.join(os.tmpdir(), 'skaffolding-generator-write-'));
  state.infoMessages = [];
  state.warningMessages = [];
  state.inputBoxes = inputBoxes;
  state.quickPicks = quickPicks;
  vscode.workspace.workspaceFolders = [{ uri: vscode.Uri.file(state.root) }];
}

test('scenario packs warn and skip invalid files while loading valid files', async () => {
  await reset();
  const packDirectory = path.join(state.root, '.skaffold', 'scenario-packs');
  await fs.mkdir(packDirectory, { recursive: true });
  await fs.writeFile(path.join(packDirectory, 'invalid.json'), JSON.stringify({
    id: 'invalid',
    label: 42,
    description: 'This pack must be skipped.',
    prompts: [],
    files: [{ path: 'invalid.txt', content: 'must not load' }]
  }));
  await fs.writeFile(path.join(packDirectory, 'valid.json'), JSON.stringify({
    id: 'valid',
    label: 'Valid',
    description: 'This pack must load.',
    prompts: [],
    files: [{ path: 'valid.txt', content: 'must load' }]
  }));

  const scenarios = await loadScenarioPackScenarios();

  assert.deepEqual(scenarios.map((scenario) => scenario.id), ['pack.valid']);
  assert.deepEqual(state.warningMessages, [
    'Skip scenario pack invalid.json: invalid.json: label must be a string.'
  ]);
});

test('scenario packs stop when an overwrite picker is dismissed', async () => {
  await reset({ quickPicks: [undefined] });
  const packDirectory = path.join(state.root, '.skaffold', 'scenario-packs');
  await fs.mkdir(packDirectory, { recursive: true });
  await fs.writeFile(path.join(packDirectory, 'cancel.json'), JSON.stringify({
    id: 'cancel',
    label: 'Cancel',
    description: 'Cancel write',
    prompts: [],
    files: [
      { path: 'existing.txt', content: 'replacement' },
      { path: 'later.txt', content: 'must not write' }
    ]
  }));
  await fs.writeFile(path.join(state.root, 'existing.txt'), 'existing');

  const [scenario] = await loadScenarioPackScenarios();
  await scenario.run({});

  await assert.rejects(fs.stat(path.join(state.root, 'later.txt')));
  assert.match(state.infoMessages.at(-1), /cancelled/i);
});

test('scenario packs report created, overwritten, and skipped files in one run', async () => {
  await reset({ quickPicks: ['Skip', 'Overwrite'] });
  const packDirectory = path.join(state.root, '.skaffold', 'scenario-packs');
  await fs.mkdir(packDirectory, { recursive: true });
  await fs.writeFile(path.join(packDirectory, 'mixed.json'), JSON.stringify({
    id: 'mixed',
    label: 'Mixed',
    description: 'Mixed write choices',
    prompts: [],
    files: [
      { path: 'skip.txt', content: 'new skip content' },
      { path: 'overwrite.txt', content: 'new overwrite content' },
      { path: 'created.txt', content: 'new created content' }
    ]
  }));
  await fs.writeFile(path.join(state.root, 'skip.txt'), 'keep this content');
  await fs.writeFile(path.join(state.root, 'overwrite.txt'), 'replace this content');

  const [scenario] = await loadScenarioPackScenarios();
  await scenario.run({});

  assert.equal(await fs.readFile(path.join(state.root, 'skip.txt'), 'utf8'), 'keep this content');
  assert.equal(await fs.readFile(path.join(state.root, 'overwrite.txt'), 'utf8'), 'new overwrite content');
  assert.equal(await fs.readFile(path.join(state.root, 'created.txt'), 'utf8'), 'new created content');
  assert.match(state.infoMessages.at(-1), /Files created: 1\. Files overwritten: 1\. Files skipped: 1\./);
});

test('scenario packs stop later writes after an earlier file is created', async () => {
  await reset({ quickPicks: [undefined] });
  const packDirectory = path.join(state.root, '.skaffold', 'scenario-packs');
  await fs.mkdir(packDirectory, { recursive: true });
  await fs.writeFile(path.join(packDirectory, 'cancel-after-create.json'), JSON.stringify({
    id: 'cancel-after-create',
    label: 'Cancel after create',
    description: 'Cancel after a write',
    prompts: [],
    files: [
      { path: 'created-first.txt', content: 'created first' },
      { path: 'existing-second.txt', content: 'must stay' },
      { path: 'later.txt', content: 'must not write' }
    ]
  }));
  await fs.writeFile(path.join(state.root, 'existing-second.txt'), 'keep this content');

  const [scenario] = await loadScenarioPackScenarios();
  await scenario.run({});

  assert.equal(await fs.readFile(path.join(state.root, 'created-first.txt'), 'utf8'), 'created first');
  assert.equal(await fs.readFile(path.join(state.root, 'existing-second.txt'), 'utf8'), 'keep this content');
  await assert.rejects(fs.stat(path.join(state.root, 'later.txt')));
  assert.match(state.infoMessages.at(-1), /Files created: 1\. Files overwritten: 0\. Files skipped: 0\./);
});

test('Spring Boot service creation stops when an overwrite picker is dismissed', async () => {
  await reset({
    quickPicks: ['Reactive', 'Maven', 'No', 'None', 'PostgreSQL', 'None', undefined],
    inputBoxes: ['3.5.4', 'demo', 'Demo', 'service', 'com.example.demo', '25']
  });
  await fs.mkdir(path.join(state.root, 'service'), { recursive: true });
  await fs.writeFile(path.join(state.root, 'service', 'pom.xml'), 'existing');

  await createSpringBootServiceScenario.run({});

  await assert.rejects(fs.stat(path.join(state.root, 'service', 'src/main/resources/application.yml')));
  assert.match(state.infoMessages.at(-1), /cancelled/i);
});

test('Spring Boot service creation reports a mixed write sequence', async () => {
  await reset({
    quickPicks: ['Reactive', 'Maven', 'No', 'None', 'PostgreSQL', 'None', 'Overwrite', 'Skip'],
    inputBoxes: ['3.5.4', 'demo', 'Demo', 'service', 'com.example.demo', '25']
  });
  const serviceRoot = path.join(state.root, 'service');
  await fs.mkdir(path.join(serviceRoot, 'src/main/resources'), { recursive: true });
  await fs.writeFile(path.join(serviceRoot, 'pom.xml'), 'replace this content');
  await fs.writeFile(path.join(serviceRoot, 'src/main/resources/application.yml'), 'keep this content');

  await createSpringBootServiceScenario.run({});

  assert.match(await fs.readFile(path.join(serviceRoot, 'pom.xml'), 'utf8'), /<project/);
  assert.equal(await fs.readFile(path.join(serviceRoot, 'src/main/resources/application.yml'), 'utf8'), 'keep this content');
  assert.match(state.infoMessages.at(-1), /Files created: 2\. Files overwritten: 1\. Files skipped: 1\./);
});

test('Spring Boot service creation stops later writes after an earlier file is created', async () => {
  await reset({
    quickPicks: ['Reactive', 'Maven', 'No', 'None', 'PostgreSQL', 'None', undefined],
    inputBoxes: ['3.5.4', 'demo', 'Demo', 'service', 'com.example.demo', '25']
  });
  const serviceRoot = path.join(state.root, 'service');
  const existingMainClass = path.join(serviceRoot, 'src/main/java/com/example/demo/DemoApplication.java');
  await fs.mkdir(path.dirname(existingMainClass), { recursive: true });
  await fs.writeFile(existingMainClass, 'keep this content');

  await createSpringBootServiceScenario.run({});

  assert.match(await fs.readFile(path.join(serviceRoot, 'pom.xml'), 'utf8'), /<project/);
  assert.equal(await fs.readFile(existingMainClass, 'utf8'), 'keep this content');
  await assert.rejects(fs.stat(path.join(serviceRoot, 'src/main/resources/application.yml')));
  assert.match(state.infoMessages.at(-1), /Files created: 1\. Files overwritten: 0\. Files skipped: 0\./);
});

test('Azure starter creation stops when an overwrite picker is dismissed', async () => {
  await reset({
    quickPicks: ['Bicep', undefined],
    inputBoxes: ['infra/azure', 'rg-demo', 'westeurope', 'app-demo', 'psql-demo', 'appdb', 'appadmin', 'appuser']
  });
  await fs.mkdir(path.join(state.root, 'infra', 'azure'), { recursive: true });
  await fs.writeFile(path.join(state.root, 'infra', 'azure', 'main.bicep'), 'existing');

  await createAzureDeploymentStarterScenario.run({});

  await assert.rejects(fs.stat(path.join(state.root, 'infra', 'azure', 'main.parameters.json')));
  assert.match(state.infoMessages.at(-1), /cancelled/i);
});

test('Azure starter creation reports a mixed write sequence', async () => {
  await reset({
    quickPicks: ['Bicep', 'Overwrite', 'Skip'],
    inputBoxes: ['infra/azure', 'rg-demo', 'westeurope', 'app-demo', 'psql-demo', 'appdb', 'appadmin', 'appuser']
  });
  const targetFolder = path.join(state.root, 'infra', 'azure');
  await fs.mkdir(targetFolder, { recursive: true });
  await fs.writeFile(path.join(targetFolder, 'main.bicep'), 'replace this content');
  await fs.writeFile(path.join(targetFolder, 'DEPLOY.md'), 'keep this content');

  await createAzureDeploymentStarterScenario.run({});

  assert.match(await fs.readFile(path.join(targetFolder, 'main.bicep'), 'utf8'), /param location string/);
  assert.equal(await fs.readFile(path.join(targetFolder, 'DEPLOY.md'), 'utf8'), 'keep this content');
  assert.match(state.infoMessages.at(-1), /Files created: 2\. Files overwritten: 1\. Files skipped: 1\./);
});

test('Azure starter creation stops later writes after an earlier file is created', async () => {
  await reset({
    quickPicks: ['Bicep', undefined],
    inputBoxes: ['infra/azure', 'rg-demo', 'westeurope', 'app-demo', 'psql-demo', 'appdb', 'appadmin', 'appuser']
  });
  const targetFolder = path.join(state.root, 'infra', 'azure');
  await fs.mkdir(targetFolder, { recursive: true });
  await fs.writeFile(path.join(targetFolder, 'main.parameters.json'), 'keep this content');

  await createAzureDeploymentStarterScenario.run({});

  assert.match(await fs.readFile(path.join(targetFolder, 'main.bicep'), 'utf8'), /param location string/);
  assert.match(await fs.readFile(path.join(targetFolder, 'resources.bicep'), 'utf8'), /SPRING_DATASOURCE_URL/);
  assert.equal(await fs.readFile(path.join(targetFolder, 'main.parameters.json'), 'utf8'), 'keep this content');
  await assert.rejects(fs.stat(path.join(targetFolder, 'DEPLOY.md')));
  assert.match(state.infoMessages.at(-1), /Files created: 2\. Files overwritten: 0\. Files skipped: 0\./);
});

test('SecurityConfig creation reports cancellation when an overwrite picker is dismissed', async () => {
  await reset({
    quickPicks: ['Reactive', 'Basic Authentication', undefined],
    inputBoxes: ['com.example.demo', 'service']
  });
  const target = path.join(state.root, 'service', 'src/main/java/com/example/demo/SecurityConfig.java');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, 'existing');

  await addSpringSecurityConfigScenario.run({});

  assert.equal(await fs.readFile(target, 'utf8'), 'existing');
  assert.match(state.infoMessages.at(-1), /cancelled/i);
});

test('SecurityConfig reports overwritten files separately from created files', async () => {
  await reset({
    quickPicks: ['Reactive', 'Basic Authentication', 'Overwrite'],
    inputBoxes: ['com.example.demo', 'service']
  });
  const target = path.join(state.root, 'service', 'src/main/java/com/example/demo/SecurityConfig.java');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, 'existing');

  await addSpringSecurityConfigScenario.run({});

  assert.match(state.infoMessages.at(-1), /Files created: 0\. Files overwritten: 1\. Files skipped: 0\./);
});

test('SecurityConfig reports a skipped existing file', async () => {
  await reset({
    quickPicks: ['Reactive', 'Basic Authentication', 'Skip'],
    inputBoxes: ['com.example.demo', 'service']
  });
  const target = path.join(state.root, 'service', 'src/main/java/com/example/demo/SecurityConfig.java');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, 'keep this content');

  await addSpringSecurityConfigScenario.run({});

  assert.equal(await fs.readFile(target, 'utf8'), 'keep this content');
  assert.match(state.infoMessages.at(-1), /Files created: 0\. Files overwritten: 0\. Files skipped: 1\./);
});

test('scenario pack template uses the shared overwrite choice', async () => {
  await reset({
    quickPicks: ['Overwrite'],
    inputBoxes: ['demo-pack', 'Demo pack', 'Create demo files.']
  });
  const target = path.join(state.root, '.skaffold', 'scenario-packs', 'demo-pack.json');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, 'existing');

  await createScenarioPackTemplate();

  const createdPack = JSON.parse(await fs.readFile(target, 'utf8'));
  assert.equal(createdPack.id, 'demo-pack');
  assert.equal(createdPack.description, 'Create demo files.');
});

test('Azure snapshot command uses the shared skip choice', async () => {
  await reset({ quickPicks: ['Yes', 'Skip'] });
  const target = path.join(state.root, 'test', '__snapshots__', 'azureDeploymentStarter.snap.cjs');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, 'keep this snapshot');

  await updateAzureSnapshotsCommand();

  assert.equal(await fs.readFile(target, 'utf8'), 'keep this snapshot');
});

test('Azure snapshot command rejects a symlink parent', async () => {
  await reset({ quickPicks: ['Yes'] });
  const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skaffolding-snapshot-outside-'));
  await fs.symlink(outsideRoot, path.join(state.root, 'test'));

  try {
    await assert.rejects(updateAzureSnapshotsCommand(), /symlink.*parent/i);
    await assert.rejects(
      fs.stat(path.join(outsideRoot, '__snapshots__', 'azureDeploymentStarter.snap.cjs'))
    );
  } finally {
    await fs.rm(outsideRoot, { recursive: true, force: true });
  }
});

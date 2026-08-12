const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const inspectorPath = path.join(projectRoot, 'scripts', 'check-vsix.cjs');
const runtimeSmokePath = path.join(projectRoot, 'scripts', 'smoke-vsix-runtime.cjs');
const packageManifest = require('../package.json');
const releaseMetadata = {
  publisher: 'release-publisher',
  repository: {
    type: 'git',
    url: 'https://github.com/example/skaffolding-vsplugin.git'
  },
  license: 'MIT'
};

const springTemplateFiles = {
  'out/scenarios/springBootServiceTemplates.js': 'module.exports = {};',
  'out/scenarios/springBootTestTemplates.js': 'module.exports = {};'
};

function createVsix({
  files,
  manifest,
  includeLicense = true,
  addReleaseMetadata = true,
  includeSpringTemplates = true
}) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffold-vsix-'));
  const extensionRoot = path.join(temporaryRoot, 'extension');
  const vsixPath = path.join(temporaryRoot, 'extension.vsix');

  fs.mkdirSync(extensionRoot, { recursive: true });
  fs.writeFileSync(
    path.join(extensionRoot, 'package.json'),
    JSON.stringify(addReleaseMetadata ? { ...releaseMetadata, ...manifest } : manifest),
    'utf8'
  );

  if (includeLicense) {
    fs.writeFileSync(path.join(extensionRoot, 'LICENSE.txt'), 'MIT License\n', 'utf8');
  }

  const packagedFiles = includeSpringTemplates ? { ...springTemplateFiles, ...files } : files;
  for (const [relativePath, contents] of Object.entries(packagedFiles)) {
    const targetPath = path.join(extensionRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, contents, 'utf8');
  }

  childProcess.execFileSync('zip', ['-q', '-r', vsixPath, 'extension'], {
    cwd: temporaryRoot
  });

  return { temporaryRoot, vsixPath };
}

function inspectVsix(vsixPath) {
  return childProcess.spawnSync(process.execPath, [inspectorPath, vsixPath], {
    encoding: 'utf8'
  });
}

function smokeVsix(vsixPath) {
  return childProcess.spawnSync(process.execPath, [runtimeSmokePath, vsixPath], {
    encoding: 'utf8'
  });
}

test('declares the commands needed to build and inspect a VSIX', () => {
  assert.equal(packageManifest.scripts['vscode:prepublish'], 'npm run compile');
  assert.match(packageManifest.scripts.package, /vsce package/);
  assert.equal(packageManifest.scripts['check:package'], 'node scripts/check-vsix.cjs');
  assert.equal(packageManifest.scripts['smoke:package'], 'node scripts/smoke-vsix-runtime.cjs');
  assert.equal(
    packageManifest.scripts['snapshots:update:azure'],
    'npm run compile && node scripts/update-azure-snapshots.cjs'
  );
  assert.equal(packageManifest.main, './out/extension.js');
});

test('does not contribute the development-only Azure snapshot update command', () => {
  const commands = packageManifest.contributes.commands.map((command) => command.command);

  assert.equal(commands.includes('skaffold.updateAzureSnapshotHashes'), false);
});

test('declares release publisher, repository, and license metadata', () => {
  assert.equal(typeof packageManifest.publisher, 'string');
  assert.notEqual(packageManifest.publisher, 'local');
  assert.match(packageManifest.publisher, /^[a-zA-Z0-9-]+$/);
  assert.equal(packageManifest.repository.type, 'git');
  assert.match(packageManifest.repository.url, /^https:\/\/github\.com\//);
  assert.equal(packageManifest.license, 'MIT');
  assert.equal(fs.existsSync(path.join(projectRoot, 'LICENSE')), true);
});

test('accepts a VSIX with the manifest entry point and scenario schema', () => {
  const fixture = createVsix({
    manifest: { main: './out/extension.js' },
    files: {
      'out/extension.js': 'module.exports = {};',
      'schemas/scenario-pack.schema.json': '{}'
    }
  });

  try {
    const result = inspectVsix(fixture.vsixPath);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /VSIX package check passed/);
  } finally {
    fs.rmSync(fixture.temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects a VSIX that omits a Spring Boot runtime template module', () => {
  for (const missingPath of Object.keys(springTemplateFiles)) {
    const files = {
      'out/extension.js': 'module.exports = {};',
      'schemas/scenario-pack.schema.json': '{}',
      ...springTemplateFiles
    };
    delete files[missingPath];
    const fixture = createVsix({
      manifest: { main: './out/extension.js' },
      files,
      includeSpringTemplates: false
    });

    try {
      const result = inspectVsix(fixture.vsixPath);

      assert.notEqual(result.status, 0, missingPath);
      assert.match(result.stderr, new RegExp(missingPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    } finally {
      fs.rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
  }
});

test('packaged extension runtime smoke loads and activates the declared main module', () => {
  const commandId = 'skaffold.createSpringBootService';
  const fixture = createVsix({
    manifest: {
      main: './out/extension.js',
      contributes: { commands: [{ command: commandId }] }
    },
    files: {
      'out/extension.js': `
        require('./scenarios/springBootServiceTemplates');
        require('./scenarios/springBootTestTemplates');
        const vscode = require('vscode');
        exports.activate = (context) => {
          context.subscriptions.push(vscode.commands.registerCommand('${commandId}', () => {}));
        };
      `,
      'schemas/scenario-pack.schema.json': '{}'
    }
  });

  try {
    const result = smokeVsix(fixture.vsixPath);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /runtime smoke passed/i);
    assert.match(result.stdout, /1 command registered/);
  } finally {
    fs.rmSync(fixture.temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects a VSIX that includes excluded project files', () => {
  const excludedPaths = [
    'test/packageManifest.test.cjs',
    'scripts/check-vsix.cjs',
    '.superpowers/sdd/task-8-report.md',
    'docs/implementation-plan.md',
    'examples/scenario-pack.json',
    '.skaffold/scenario-pack.json',
    'tsconfig.json',
    'src/extension.ts',
    'out/testing/azureSnapshot.js',
    'out/scenarios/updateAzureSnapshotsCommand.js',
    '.vscode/launch.json',
    '.gitignore',
    '.git/config'
  ];

  for (const excludedPath of excludedPaths) {
    const fixture = createVsix({
      manifest: { main: './out/extension.js' },
      files: {
        'out/extension.js': 'module.exports = {};',
        'schemas/scenario-pack.schema.json': '{}',
        [excludedPath]: 'development artifact'
      }
    });

    try {
      const result = inspectVsix(fixture.vsixPath);

      assert.notEqual(result.status, 0, excludedPath);
      assert.match(result.stderr, new RegExp(excludedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    } finally {
      fs.rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
  }
});

test('rejects a VSIX that contributes the development-only Azure snapshot update command', () => {
  const fixture = createVsix({
    manifest: {
      main: './out/extension.js',
      contributes: {
        commands: [{ command: 'skaffold.updateAzureSnapshotHashes' }]
      }
    },
    files: {
      'out/extension.js': 'module.exports = {};',
      'schemas/scenario-pack.schema.json': '{}'
    }
  });

  try {
    const result = inspectVsix(fixture.vsixPath);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /updateAzureSnapshotHashes/);
  } finally {
    fs.rmSync(fixture.temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects a VSIX that omits the compiled extension entry point', () => {
  const fixture = createVsix({
    manifest: { main: './out/extension.js' },
    files: {
      'schemas/scenario-pack.schema.json': '{}'
    }
  });

  try {
    const result = inspectVsix(fixture.vsixPath);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /out\/extension\.js/);
  } finally {
    fs.rmSync(fixture.temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects a VSIX with no main manifest field', () => {
  const fixture = createVsix({
    manifest: {},
    files: {
      'out/extension.js': 'module.exports = {};',
      'schemas/scenario-pack.schema.json': '{}'
    }
  });

  try {
    const result = inspectVsix(fixture.vsixPath);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not define main/);
  } finally {
    fs.rmSync(fixture.temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects a VSIX that omits the scenario schema', () => {
  const fixture = createVsix({
    manifest: { main: './out/extension.js' },
    files: {
      'out/extension.js': 'module.exports = {};'
    }
  });

  try {
    const result = inspectVsix(fixture.vsixPath);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /schemas\/scenario-pack\.schema\.json/);
  } finally {
    fs.rmSync(fixture.temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects a VSIX with missing release metadata', () => {
  const invalidManifests = [
    [{ main: './out/extension.js' }, /publisher/],
    [{ ...releaseMetadata, main: './out/extension.js', publisher: 'local' }, /publisher/],
    [{ publisher: 'release-publisher', license: 'MIT', main: './out/extension.js' }, /repository/],
    [{ publisher: 'release-publisher', repository: releaseMetadata.repository, main: './out/extension.js' }, /license/]
  ];

  for (const [manifest, message] of invalidManifests) {
    const fixture = createVsix({
      manifest,
      addReleaseMetadata: false,
      files: {
        'out/extension.js': 'module.exports = {};',
        'schemas/scenario-pack.schema.json': '{}'
      }
    });

    try {
      const result = inspectVsix(fixture.vsixPath);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, message);
    } finally {
      fs.rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
  }
});

test('rejects a VSIX that omits the license file', () => {
  const fixture = createVsix({
    manifest: { main: './out/extension.js' },
    includeLicense: false,
    files: {
      'out/extension.js': 'module.exports = {};',
      'schemas/scenario-pack.schema.json': '{}'
    }
  });

  try {
    const result = inspectVsix(fixture.vsixPath);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /LICENSE/);
  } finally {
    fs.rmSync(fixture.temporaryRoot, { recursive: true, force: true });
  }
});

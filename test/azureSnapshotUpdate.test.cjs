const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(projectRoot, 'scripts', 'update-azure-snapshots.cjs');

test('development snapshot script writes inside its current workspace', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffolding-snapshot-script-'));
  const target = path.join(workspaceRoot, 'test', '__snapshots__', 'azureDeploymentStarter.snap.cjs');

  try {
    const result = childProcess.spawnSync(process.execPath, [scriptPath], {
      cwd: workspaceRoot,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(fs.readFileSync(target, 'utf8'), /^module\.exports = \{/);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('development snapshot script rejects a symlink parent', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffolding-snapshot-script-'));
  const workspaceRoot = path.join(temporaryRoot, 'workspace');
  const outsideRoot = path.join(temporaryRoot, 'outside');
  fs.mkdirSync(workspaceRoot);
  fs.mkdirSync(outsideRoot);
  fs.symlinkSync(outsideRoot, path.join(workspaceRoot, 'test'));

  try {
    const result = childProcess.spawnSync(process.execPath, [scriptPath], {
      cwd: workspaceRoot,
      encoding: 'utf8'
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /symlink.*parent/i);
    assert.equal(
      fs.existsSync(path.join(outsideRoot, '__snapshots__', 'azureDeploymentStarter.snap.cjs')),
      false
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

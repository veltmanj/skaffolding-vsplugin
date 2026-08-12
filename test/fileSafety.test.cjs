const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createWorkspaceDirectory,
  resolveWorkspacePath
} = require('../out/scenarios/fileSafety.js');

test('resolves a valid relative path inside the workspace', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffold-file-safety-'));
  const workspaceRoot = path.join(temporaryRoot, 'workspace');
  fs.mkdirSync(workspaceRoot);

  try {
    assert.equal(
      resolveWorkspacePath(workspaceRoot, 'src/file.txt'),
      path.join(workspaceRoot, 'src/file.txt')
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects parent-directory traversal', () => {
  assert.throws(() => {
    resolveWorkspacePath('/tmp/work', '../file.txt');
  }, /outside workspace/);
});

test('rejects an absolute input path', () => {
  assert.throws(() => {
    resolveWorkspacePath('/tmp/work', '/tmp/file.txt');
  }, /absolute/);
});

test('rejects a path in a sibling directory with the same prefix', () => {
  assert.throws(() => {
    resolveWorkspacePath('/tmp/work', '../work-other/file.txt');
  }, /outside workspace/);
});

test('rejects an existing symlink that points outside the workspace', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffold-file-safety-'));
  const workspaceRoot = path.join(temporaryRoot, 'workspace');
  const outsideRoot = path.join(temporaryRoot, 'outside');
  fs.mkdirSync(workspaceRoot);
  fs.mkdirSync(outsideRoot);
  fs.symlinkSync(outsideRoot, path.join(workspaceRoot, 'linked-outside'));

  try {
    assert.throws(() => {
      resolveWorkspacePath(workspaceRoot, 'linked-outside/generated.txt');
    }, /symlink.*parent/i);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects an existing symlink parent that points inside the workspace', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffold-file-safety-'));
  const workspaceRoot = path.join(temporaryRoot, 'workspace');
  const generatedRoot = path.join(workspaceRoot, 'generated');
  fs.mkdirSync(generatedRoot, { recursive: true });
  fs.symlinkSync(generatedRoot, path.join(workspaceRoot, 'linked-generated'));

  try {
    assert.throws(() => {
      resolveWorkspacePath(workspaceRoot, 'linked-generated/generated.txt');
    }, /symlink.*parent/i);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects an existing symlink leaf', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffold-file-safety-'));
  const workspaceRoot = path.join(temporaryRoot, 'workspace');
  fs.mkdirSync(workspaceRoot);
  fs.writeFileSync(path.join(workspaceRoot, 'real.txt'), 'content');
  fs.symlinkSync('real.txt', path.join(workspaceRoot, 'linked.txt'));

  try {
    assert.throws(() => {
      resolveWorkspacePath(workspaceRoot, 'linked.txt');
    }, /symlink.*leaf/i);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects a dangling symlink in the target path', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffold-file-safety-'));
  const workspaceRoot = path.join(temporaryRoot, 'workspace');
  fs.mkdirSync(workspaceRoot);
  fs.symlinkSync('missing', path.join(workspaceRoot, 'dangling'));

  try {
    assert.throws(() => {
      resolveWorkspacePath(workspaceRoot, 'dangling/generated.txt');
    }, /dangling.*symlink/i);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects a parent that is replaced by a symlink before directory creation', async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffold-directory-race-'));
  const workspaceRoot = path.join(temporaryRoot, 'workspace');
  const outsideRoot = path.join(temporaryRoot, 'outside');
  const parent = path.join(workspaceRoot, 'parent');
  fs.mkdirSync(parent, { recursive: true });
  fs.mkdirSync(outsideRoot);
  const targetDirectory = resolveWorkspacePath(workspaceRoot, 'parent/generated');

  fs.rmSync(parent, { recursive: true });
  fs.symlinkSync(outsideRoot, parent);

  try {
    await assert.rejects(
      createWorkspaceDirectory(workspaceRoot, targetDirectory),
      /symlink.*parent/i
    );
    assert.equal(fs.existsSync(path.join(outsideRoot, 'generated')), false);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  shouldWriteFile,
  writeGeneratedFile,
  writeFileWithExplicitOverwrite,
  writeWorkspaceFileWithExplicitOverwrite
} = require('../out/scenarios/fileWriter.js');
const { resolveWorkspacePath } = require('../out/scenarios/fileSafety.js');

function uri(filePath) {
  return { fsPath: filePath };
}

test('writes a file that does not exist', () => {
  assert.equal(shouldWriteFile(false, 'skip'), true);
});

test('skips an existing file when the user selects skip', () => {
  assert.equal(shouldWriteFile(true, 'skip'), false);
});

test('writes an existing file when the user selects overwrite', () => {
  assert.equal(shouldWriteFile(true, 'overwrite'), true);
});

test('keeps existing file content after a skip decision', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffolding-file-writer-'));
  const targetFile = path.join(tempDir, 'existing.txt');
  fs.writeFileSync(targetFile, 'existing content', 'utf8');

  try {
    if (shouldWriteFile(true, 'skip')) {
      fs.writeFileSync(targetFile, 'new content', 'utf8');
    }

    assert.equal(fs.readFileSync(targetFile, 'utf8'), 'existing content');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('cancels the current generator when the overwrite picker is dismissed', async () => {
  let writeCount = 0;

  const result = await writeFileWithExplicitOverwrite(
    {},
    'new content',
    async () => undefined,
    {
      lstatFile: async () => ({ device: 1, inode: 1 }),
      createFile: async () => {
        writeCount += 1;
      },
      overwriteFile: async () => {
        writeCount += 1;
      }
    }
  );

  assert.equal(result, 'cancelled');
  assert.equal(writeCount, 0);
});

test('asks again before overwriting a file that appears after the first check', async () => {
  const existingChecks = [false, true];
  let decisionCount = 0;
  let writeCount = 0;

  const result = await writeFileWithExplicitOverwrite(
    {},
    'new content',
    async () => {
      decisionCount += 1;
      return 'skip';
    },
    {
      lstatFile: async () => existingChecks.shift() ? ({ device: 1, inode: 1 }) : undefined,
      createFile: async () => {
        writeCount += 1;
      },
      overwriteFile: async () => {
        writeCount += 1;
      }
    }
  );

  assert.equal(result, 'skipped');
  assert.equal(decisionCount, 1);
  assert.equal(writeCount, 0);
});

test('reports an overwrite only after the user confirms it', async () => {
  const existingChecks = [true, true];
  let writeCount = 0;

  const result = await writeFileWithExplicitOverwrite(
    {},
    'new content',
    async () => 'overwrite',
    {
      lstatFile: async () => existingChecks.shift() ? ({ device: 1, inode: 1 }) : undefined,
      createFile: async () => {
        writeCount += 1;
      },
      overwriteFile: async () => {
        writeCount += 1;
      }
    }
  );

  assert.equal(result, 'overwritten');
  assert.equal(writeCount, 1);
});

test('creates a new file with exclusive create semantics', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffolding-file-writer-'));
  const targetFile = path.join(tempDir, 'new.txt');

  try {
    await writeGeneratedFile(tempDir, uri(targetFile), 'first');
    await assert.rejects(
      writeGeneratedFile(tempDir, uri(targetFile), 'second'),
      (error) => error && error.code === 'EEXIST'
    );
    assert.equal(fs.readFileSync(targetFile, 'utf8'), 'first');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('rejects a symlink leaf immediately before an approved overwrite', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffolding-file-writer-'));
  const realFile = path.join(tempDir, 'real.txt');
  const targetFile = path.join(tempDir, 'target.txt');
  fs.writeFileSync(realFile, 'protected', 'utf8');
  fs.symlinkSync(realFile, targetFile);

  try {
    await assert.rejects(
      writeWorkspaceFileWithExplicitOverwrite(
        tempDir,
        uri(targetFile),
        'replacement',
        async () => 'overwrite'
      ),
      /symlink/i
    );
    assert.equal(fs.readFileSync(realFile, 'utf8'), 'protected');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('does not overwrite a file that appears after overwrite approval', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffolding-file-writer-'));
  const targetFile = path.join(tempDir, 'target.txt');
  fs.writeFileSync(targetFile, 'approved file', 'utf8');

  try {
    await assert.rejects(
      writeWorkspaceFileWithExplicitOverwrite(
        tempDir,
        uri(targetFile),
        'replacement',
        async () => {
          fs.unlinkSync(targetFile);
          fs.writeFileSync(targetFile, 'appeared after approval', 'utf8');
          return 'overwrite';
        }
      ),
      /changed after overwrite approval/i
    );
    assert.equal(fs.readFileSync(targetFile, 'utf8'), 'appeared after approval');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('rejects a parent that is replaced by a symlink before file creation', async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffolding-file-race-'));
  const workspaceRoot = path.join(temporaryRoot, 'workspace');
  const outsideRoot = path.join(temporaryRoot, 'outside');
  const parent = path.join(workspaceRoot, 'parent');
  fs.mkdirSync(parent, { recursive: true });
  fs.mkdirSync(outsideRoot);
  const targetFile = resolveWorkspacePath(workspaceRoot, 'parent/created.txt');

  fs.rmSync(parent, { recursive: true });
  fs.symlinkSync(outsideRoot, parent);

  try {
    await assert.rejects(
      writeWorkspaceFileWithExplicitOverwrite(
        workspaceRoot,
        uri(targetFile),
        'generated content',
        async () => 'overwrite'
      ),
      /symlink.*parent/i
    );
    assert.equal(fs.existsSync(path.join(outsideRoot, 'created.txt')), false);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

const childProcess = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');

const workspaceRoot = path.resolve(__dirname, '..');
const archivePath = path.resolve(workspaceRoot, process.argv[2] || 'skaffolding-vsplugin.vsix');

main().catch((error) => {
  console.error(`Packaged extension runtime smoke failed: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  if (!fs.existsSync(archivePath)) {
    throw new Error(`VSIX file not found: ${archivePath}. Run npm run package first.`);
  }

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffold-vsix-runtime-'));
  const originalLoad = Module._load;

  try {
    childProcess.execFileSync('unzip', ['-q', archivePath, '-d', temporaryRoot]);

    const extensionRoot = path.join(temporaryRoot, 'extension');
    const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
    if (typeof manifest.main !== 'string' || manifest.main.length === 0) {
      throw new Error('The VSIX package.json does not define main.');
    }

    const mainPath = path.resolve(extensionRoot, manifest.main);
    if (mainPath !== extensionRoot && !mainPath.startsWith(`${extensionRoot}${path.sep}`)) {
      throw new Error(`The VSIX main path escapes the extension root: ${manifest.main}.`);
    }

    const registeredCommands = new Map();
    const vscode = createVscodeStub(registeredCommands);
    Module._load = function loadVscodeStub(request, parent, isMain) {
      if (request === 'vscode') {
        return vscode;
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    const extension = require(mainPath);
    if (typeof extension.activate !== 'function') {
      throw new Error(`The packaged main module does not export activate(): ${manifest.main}.`);
    }

    const extensionContext = {
      extensionPath: extensionRoot,
      extensionUri: vscode.Uri.file(extensionRoot),
      subscriptions: []
    };
    await Promise.resolve(extension.activate(extensionContext));

    const contributedCommands = Array.isArray(manifest.contributes?.commands)
      ? manifest.contributes.commands
          .map((entry) => entry?.command)
          .filter((command) => typeof command === 'string' && command.length > 0)
      : [];
    const missingCommands = contributedCommands.filter((command) => !registeredCommands.has(command));
    if (missingCommands.length > 0) {
      throw new Error(`Activation did not register contributed commands: ${missingCommands.join(', ')}.`);
    }

    const count = registeredCommands.size;
    console.log(
      `Packaged extension runtime smoke passed: ${path.basename(archivePath)} (${count} command${count === 1 ? '' : 's'} registered).`
    );
  } finally {
    Module._load = originalLoad;
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function createVscodeStub(registeredCommands) {
  return {
    commands: {
      registerCommand(command, callback) {
        registeredCommands.set(command, callback);
        return {
          dispose() {
            registeredCommands.delete(command);
          }
        };
      }
    },
    Uri: {
      file(fsPath) {
        return { fsPath };
      }
    },
    window: {},
    workspace: {}
  };
}

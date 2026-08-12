const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const workspaceRoot = path.resolve(__dirname, '..');
const archivePath = path.resolve(
  workspaceRoot,
  process.argv[2] || 'skaffolding-vsplugin.vsix'
);

if (!fs.existsSync(archivePath)) {
  fail(`VSIX file not found: ${archivePath}. Run npm run package first.`);
}

const entries = listEntries(archivePath);
const packagedManifestPath = 'extension/package.json';

if (!entries.has(packagedManifestPath)) {
  fail('VSIX is missing extension/package.json.');
}

const packagedManifest = readPackagedManifest(archivePath, packagedManifestPath);
const developmentOnlyCommand = 'skaffold.updateAzureSnapshotHashes';

if (
  typeof packagedManifest.publisher !== 'string' ||
  packagedManifest.publisher.length === 0 ||
  packagedManifest.publisher === 'local'
) {
  fail('The VSIX package.json must define a non-local publisher.');
}

const repositoryUrl = typeof packagedManifest.repository === 'string'
  ? packagedManifest.repository
  : packagedManifest.repository?.url;
if (typeof repositoryUrl !== 'string' || repositoryUrl.length === 0) {
  fail('The VSIX package.json must define repository metadata.');
}

if (typeof packagedManifest.license !== 'string' || packagedManifest.license.length === 0) {
  fail('The VSIX package.json must define license metadata.');
}

if (contributesCommand(packagedManifest, developmentOnlyCommand)) {
  fail(`VSIX contributes development-only command: ${developmentOnlyCommand}.`);
}

if (typeof packagedManifest.main !== 'string' || packagedManifest.main.length === 0) {
  fail('The VSIX package.json does not define main.');
}

const mainPath = `extension/${packagedManifest.main.replace(/^\.\//, '')}`;
const requiredPaths = [
  mainPath,
  'extension/out/extension.js',
  'extension/out/scenarios/springBootServiceTemplates.js',
  'extension/out/scenarios/springBootTestTemplates.js',
  'extension/schemas/scenario-pack.schema.json',
  'extension/LICENSE.txt'
];
const missingPaths = requiredPaths.filter((entry) => !entries.has(entry));

if (missingPaths.length > 0) {
  fail(`VSIX is missing required files: ${missingPaths.join(', ')}.`);
}

const excludedPaths = [...entries].filter(isExcludedPath);

if (excludedPaths.length > 0) {
  fail(`VSIX includes excluded development files: ${excludedPaths.join(', ')}.`);
}

console.log(`VSIX package check passed: ${path.basename(archivePath)}`);

function isExcludedPath(entry) {
  if (!entry.startsWith('extension/')) {
    return false;
  }

  const packagedPath = entry.slice('extension/'.length);

  return (
    packagedPath === 'tsconfig.json' ||
    packagedPath === 'package-lock.json' ||
    packagedPath === '.DS_Store' ||
    packagedPath.endsWith('.ts') ||
    packagedPath.endsWith('.map') ||
    packagedPath.startsWith('out/testing/') ||
    packagedPath === 'out/scenarios/updateAzureSnapshotsCommand.js' ||
    packagedPath.startsWith('test/') ||
    packagedPath.startsWith('scripts/') ||
    packagedPath.startsWith('.superpowers/') ||
    packagedPath.startsWith('docs/') ||
    packagedPath.startsWith('examples/') ||
    packagedPath.startsWith('.skaffold/') ||
    packagedPath.startsWith('src/') ||
    packagedPath.startsWith('.vscode/') ||
    packagedPath.startsWith('.git') ||
    packagedPath.startsWith('node_modules/')
  );
}

function contributesCommand(manifest, commandId) {
  const commands = manifest.contributes?.commands;
  return Array.isArray(commands) && commands.some((command) => command?.command === commandId);
}

function listEntries(filePath) {
  try {
    const output = childProcess.execFileSync('unzip', ['-Z1', filePath], {
      encoding: 'utf8'
    });
    return new Set(output.split(/\r?\n/).filter(Boolean));
  } catch (error) {
    fail(`Cannot read VSIX file with unzip: ${error.message}`);
  }
}

function readPackagedManifest(filePath, manifestPath) {
  try {
    const output = childProcess.execFileSync('unzip', ['-p', filePath, manifestPath], {
      encoding: 'utf8'
    });
    return JSON.parse(output);
  } catch (error) {
    fail(`Cannot read VSIX package.json: ${error.message}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

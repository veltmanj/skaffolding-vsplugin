const path = require('node:path');

const {
  createWorkspaceDirectory,
  resolveWorkspacePath
} = require('../out/scenarios/fileSafety.js');
const { writeWorkspaceFileWithExplicitOverwrite } = require('../out/scenarios/fileWriter.js');
const {
  buildAzureSnapshotData,
  renderAzureSnapshotModule
} = require('../out/testing/azureSnapshot.js');

async function main() {
  const workspaceRoot = process.cwd();
  const relativeTarget = path.join('test', '__snapshots__', 'azureDeploymentStarter.snap.cjs');
  let targetFile = resolveWorkspacePath(workspaceRoot, relativeTarget);
  const content = renderAzureSnapshotModule(buildAzureSnapshotData());

  await createWorkspaceDirectory(workspaceRoot, path.dirname(targetFile));
  targetFile = resolveWorkspacePath(workspaceRoot, relativeTarget);
  await writeWorkspaceFileWithExplicitOverwrite(
    workspaceRoot,
    { fsPath: targetFile },
    content,
    async () => 'overwrite'
  );

  console.log('Updated snapshot file:', targetFile);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

import * as crypto from 'node:crypto';
import {
  AzureDeploymentAnswers,
  buildAzureStarterFiles,
  GeneratedFile
} from '../scenarios/azureDeploymentTemplates';

interface SnapshotEntry {
  path: string;
  sha256: string;
}

interface AzureSnapshotData {
  bicep: SnapshotEntry[];
  terraform: SnapshotEntry[];
}

export function buildAzureSnapshotData(): AzureSnapshotData {
  return {
    bicep: normalizeFiles(buildAzureStarterFiles(defaultAnswers('Bicep'))),
    terraform: normalizeFiles(buildAzureStarterFiles(defaultAnswers('Terraform')))
  };
}

export function renderAzureSnapshotModule(snapshotData: AzureSnapshotData): string {
  return `module.exports = ${toCommonJsObject(snapshotData)};\n`;
}

function defaultAnswers(iacFlavor: 'Bicep' | 'Terraform'): AzureDeploymentAnswers {
  return {
    iacFlavor,
    targetFolder: 'infra/azure',
    resourceGroupName: 'rg-demo-dev',
    location: 'westeurope',
    appServiceName: 'app-demo-dev',
    postgresServerName: 'psql-demo-dev',
    postgresDatabaseName: 'appdb',
    postgresAdminUser: 'appadmin',
    postgresAppUser: 'appuser'
  };
}

function normalizeFiles(files: GeneratedFile[]): SnapshotEntry[] {
  return files
    .map((file) => ({
      path: file.path,
      sha256: sha256(file.content)
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function toCommonJsObject(snapshotData: AzureSnapshotData): string {
  return JSON.stringify(snapshotData, null, 2)
    .replace(/"([^"]+)":/g, '$1:')
    .replace(/"([^"]+)"/g, "'$1'");
}

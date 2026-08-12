const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  buildAzureStarterFiles,
  escapeTerraformString,
  shellQuote
} = require('../out/scenarios/azureDeploymentTemplates.js');
const snapshots = require('./__snapshots__/azureDeploymentStarter.snap.cjs');

function baseAnswers(iacFlavor) {
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

test('buildAzureStarterFiles returns Bicep files', () => {
  const files = buildAzureStarterFiles(baseAnswers('Bicep'));
  const normalized = normalizeFilesForSnapshot(files);
  assert.deepEqual(normalized, snapshots.bicep);
});

test('buildAzureStarterFiles returns Terraform files', () => {
  const files = buildAzureStarterFiles(baseAnswers('Terraform'));
  const normalized = normalizeFilesForSnapshot(files);
  assert.deepEqual(normalized, snapshots.terraform);
});

test('Azure starter parameter examples do not store a database password', () => {
  const bicepFiles = buildAzureStarterFiles(baseAnswers('Bicep'));
  const terraformFiles = buildAzureStarterFiles(baseAnswers('Terraform'));

  assert.doesNotMatch(fileContent(bicepFiles, 'main.parameters.json'), /postgresAdminPassword|REPLACE_ME/);
  assert.doesNotMatch(fileContent(terraformFiles, 'terraform.tfvars.example'), /postgres_admin_password|REPLACE_ME/);
});

test('Azure starter configures App Service database environment variables', () => {
  const bicepResources = fileContent(buildAzureStarterFiles(baseAnswers('Bicep')), 'resources.bicep');
  const terraformMain = fileContent(buildAzureStarterFiles(baseAnswers('Terraform')), 'main.tf');

  assert.match(bicepResources, /SPRING_DATASOURCE_URL/);
  assert.match(bicepResources, /SPRING_DATASOURCE_USERNAME/);
  assert.match(bicepResources, /SPRING_DATASOURCE_PASSWORD/);
  assert.match(bicepResources, /jdbc:postgresql:\/\/\$\{postgresServer\.properties\.fullyQualifiedDomainName\}:5432\/\$\{postgresDatabaseName\}\?sslmode=require/);
  assert.match(bicepResources, /SPRING_DATASOURCE_USERNAME'[\s\S]{0,100}value: postgresAppUser/);
  assert.match(bicepResources, /SPRING_DATASOURCE_PASSWORD'[\s\S]{0,100}value: postgresAppPassword/);
  assert.doesNotMatch(bicepResources, /SPRING_DATASOURCE_(?:USERNAME|PASSWORD)'[\s\S]{0,100}postgresAdmin/);

  assert.match(terraformMain, /SPRING_DATASOURCE_URL/);
  assert.match(terraformMain, /SPRING_DATASOURCE_USERNAME/);
  assert.match(terraformMain, /SPRING_DATASOURCE_PASSWORD/);
  assert.match(terraformMain, /jdbc:postgresql:\/\/\$\{azurerm_postgresql_flexible_server\.db\.fqdn\}:5432\/\$\{azurerm_postgresql_flexible_server_database\.appdb\.name\}\?sslmode=require/);
  assert.match(terraformMain, /SPRING_DATASOURCE_USERNAME\s+= var\.postgres_app_user/);
  assert.match(terraformMain, /SPRING_DATASOURCE_PASSWORD\s+= var\.postgres_app_password/);
  assert.doesNotMatch(terraformMain, /SPRING_DATASOURCE_(?:USERNAME|PASSWORD)\s+= var\.postgres_admin/);
});

test('Azure starter deploy guides explain secure database password input', () => {
  const bicepDeployGuide = fileContent(buildAzureStarterFiles(baseAnswers('Bicep')), 'DEPLOY.md');
  const terraformDeployGuide = fileContent(buildAzureStarterFiles(baseAnswers('Terraform')), 'DEPLOY.md');

  assert.match(bicepDeployGuide, /read -r -s POSTGRES_ADMIN_PASSWORD/);
  assert.match(bicepDeployGuide, /postgresAdminPassword="\$POSTGRES_ADMIN_PASSWORD"/);
  assert.match(bicepDeployGuide, /read -r -s POSTGRES_APP_PASSWORD/);
  assert.match(bicepDeployGuide, /postgresAppPassword="\$POSTGRES_APP_PASSWORD"/);
  assert.match(bicepDeployGuide, /CREATE ROLE/);
  assert.match(bicepDeployGuide, /administrator.*provision/i);
  assert.match(bicepDeployGuide, /\\getenv app_password POSTGRES_APP_PASSWORD/);
  assert.doesNotMatch(bicepDeployGuide, /--set=app_password/);
  assert.match(terraformDeployGuide, /read -r -s TF_VAR_postgres_admin_password/);
  assert.match(terraformDeployGuide, /export TF_VAR_postgres_admin_password/);
  assert.match(terraformDeployGuide, /read -r -s TF_VAR_postgres_app_password/);
  assert.match(terraformDeployGuide, /export TF_VAR_postgres_app_password/);
  assert.match(terraformDeployGuide, /CREATE ROLE/);
  assert.match(terraformDeployGuide, /administrator.*provision/i);
  assert.match(terraformDeployGuide, /\\getenv app_password TF_VAR_postgres_app_password/);
  assert.doesNotMatch(terraformDeployGuide, /--set=app_password/);
});

test('Azure starter creates the application resource group in Bicep and Terraform', () => {
  const bicepMain = fileContent(buildAzureStarterFiles(baseAnswers('Bicep')), 'main.bicep');
  const bicepDeployGuide = fileContent(buildAzureStarterFiles(baseAnswers('Bicep')), 'DEPLOY.md');
  const terraformMain = fileContent(buildAzureStarterFiles(baseAnswers('Terraform')), 'main.tf');

  assert.match(bicepMain, /^targetScope = 'subscription'/m);
  assert.match(bicepMain, /resource resourceGroup 'Microsoft\.Resources\/resourceGroups@2025-04-01' = \{/);
  assert.match(bicepMain, /scope: resourceGroup/);
  assert.match(bicepDeployGuide, /az deployment sub create/);
  assert.match(terraformMain, /resource "azurerm_resource_group" "rg"/);
});

test('Azure starter adds one manual PostgreSQL firewall rule with a replacement-only address', () => {
  const bicepResources = fileContent(buildAzureStarterFiles(baseAnswers('Bicep')), 'resources.bicep');
  const bicepParameters = fileContent(buildAzureStarterFiles(baseAnswers('Bicep')), 'main.parameters.json');
  const terraformMain = fileContent(buildAzureStarterFiles(baseAnswers('Terraform')), 'main.tf');
  const terraformVariables = fileContent(buildAzureStarterFiles(baseAnswers('Terraform')), 'variables.tf');
  const terraformValues = fileContent(buildAzureStarterFiles(baseAnswers('Terraform')), 'terraform.tfvars.example');
  const terraformDeployGuide = fileContent(buildAzureStarterFiles(baseAnswers('Terraform')), 'DEPLOY.md');

  assert.match(bicepResources, /resource postgresFirewallRule 'Microsoft\.DBforPostgreSQL\/flexibleServers\/firewallRules@2023-12-01-preview' = \{/);
  assert.match(bicepResources, /name: 'manual-client-access'/);
  assert.match(bicepResources, /startIpAddress: postgresFirewallStartIp/);
  assert.match(bicepParameters, /"postgresFirewallStartIp"[\s\S]*"REPLACE_WITH_YOUR_PUBLIC_IP"/);
  assert.match(terraformMain, /resource "azurerm_postgresql_flexible_server_firewall_rule" "manual_client_access"/);
  assert.match(terraformMain, /start_ip_address = var\.postgres_firewall_start_ip/);
  assert.match(terraformVariables, /variable "postgres_firewall_start_ip"/);
  assert.match(terraformValues, /postgres_firewall_start_ip\s+= "REPLACE_WITH_YOUR_PUBLIC_IP"/);
  assert.match(terraformDeployGuide, /Replace REPLACE_WITH_YOUR_PUBLIC_IP/);
});

test('Azure starter adds the Azure-services PostgreSQL firewall rule and its security warning', () => {
  const bicepResources = fileContent(buildAzureStarterFiles(baseAnswers('Bicep')), 'resources.bicep');
  const bicepDeployGuide = fileContent(buildAzureStarterFiles(baseAnswers('Bicep')), 'DEPLOY.md');
  const terraformMain = fileContent(buildAzureStarterFiles(baseAnswers('Terraform')), 'main.tf');
  const terraformDeployGuide = fileContent(buildAzureStarterFiles(baseAnswers('Terraform')), 'DEPLOY.md');

  assert.match(bicepResources, /resource postgresAzureServicesFirewallRule 'Microsoft\.DBforPostgreSQL\/flexibleServers\/firewallRules@2023-12-01-preview' = \{/);
  assert.match(bicepResources, /name: 'allow-azure-services'/);
  assert.match(bicepResources, /startIpAddress: '0\.0\.0\.0'/);
  assert.match(bicepResources, /endIpAddress: '0\.0\.0\.0'/);
  assert.match(terraformMain, /resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_azure_services"/);
  assert.match(terraformMain, /name\s+= "allow-azure-services"/);
  assert.match(terraformMain, /start_ip_address = "0\.0\.0\.0"/);
  assert.match(terraformMain, /end_ip_address\s+= "0\.0\.0\.0"/);
  assert.match(bicepDeployGuide, /any Azure service, including services in other customer subscriptions/i);
  assert.match(terraformDeployGuide, /any Azure service, including services in other customer subscriptions/i);
  assert.match(bicepDeployGuide, /private access with virtual network integration/i);
  assert.match(terraformDeployGuide, /private access with virtual network integration/i);
});

test('Terraform starter sets the Java server version and gives Entra remote-state authentication steps', () => {
  const terraformMain = fileContent(buildAzureStarterFiles(baseAnswers('Terraform')), 'main.tf');
  const terraformDeployGuide = fileContent(buildAzureStarterFiles(baseAnswers('Terraform')), 'DEPLOY.md');

  assert.match(terraformMain, /java_server_version\s+= "25"/);
  assert.match(terraformDeployGuide, /az login/);
  assert.match(terraformDeployGuide, /Storage Blob Data Contributor/);
  assert.match(terraformDeployGuide, /use_cli=true/);
  assert.match(terraformDeployGuide, /use_azuread_auth=true/);
  assert.match(terraformDeployGuide, /Do not pass secrets with `-backend-config`/i);
});

test('Terraform starter protects state and warns against source control for secret files', () => {
  const terraformMain = fileContent(buildAzureStarterFiles(baseAnswers('Terraform')), 'main.tf');
  const terraformIgnore = fileContent(buildAzureStarterFiles(baseAnswers('Terraform')), '.gitignore');
  const terraformDeployGuide = fileContent(buildAzureStarterFiles(baseAnswers('Terraform')), 'DEPLOY.md');

  assert.match(terraformMain, /backend "azurerm" \{\}/);
  assert.match(terraformIgnore, /^\.terraform\/$/m);
  assert.match(terraformIgnore, /^\*\.tfstate$/m);
  assert.match(terraformIgnore, /^terraform\.tfvars$/m);
  assert.match(terraformDeployGuide, /remote Azure Storage backend/i);
  assert.match(terraformDeployGuide, /Do not commit .*state.*tfvars/i);
});

test('Azure starter rejects unsafe Azure inputs before it renders deployment files', () => {
  const unsafeResourceGroup = {
    ...baseAnswers('Bicep'),
    resourceGroupName: "rg-demo'; output injected string = 'unsafe"
  };
  const unsafeLocation = {
    ...baseAnswers('Terraform'),
    location: 'westeurope\nunsafe'
  };
  const unsafeTargetFolder = {
    ...baseAnswers('Bicep'),
    targetFolder: '../outside'
  };

  assert.throws(() => buildAzureStarterFiles(unsafeResourceGroup), /resource group name/i);
  assert.throws(() => buildAzureStarterFiles(unsafeLocation), /location/i);
  assert.throws(() => buildAzureStarterFiles(unsafeTargetFolder), /target folder/i);
});

test('Azure starter encodes Azure inputs for Bicep, Terraform, and shell commands', () => {
  assert.equal(escapeTerraformString('value"with quote'), 'value\\"with quote');
  assert.equal(shellQuote("value'with quote"), "'value'\\''with quote'");
});

test('Azure starter enforces resource name limits and trailing-period rules', () => {
  assert.doesNotThrow(() => buildAzureStarterFiles({
    ...baseAnswers('Bicep'),
    resourceGroupName: 'r'.repeat(90),
    appServiceName: 'a'.repeat(60),
    postgresServerName: 'p'.repeat(63)
  }));

  const invalidCases = [
    [{ resourceGroupName: 'r'.repeat(91) }, /resource group name/i],
    [{ resourceGroupName: 'rg-demo.' }, /trailing period/i],
    [{ appServiceName: 'a'.repeat(61) }, /App Service name/i],
    [{ postgresServerName: 'p'.repeat(64) }, /PostgreSQL server name/i]
  ];

  for (const [changes, message] of invalidCases) {
    assert.throws(
      () => buildAzureStarterFiles({ ...baseAnswers('Bicep'), ...changes }),
      message
    );
  }
});

test('Azure starter keeps generated service plan names within 60 characters', () => {
  const answers = { ...baseAnswers('Bicep'), appServiceName: 'a'.repeat(60) };
  const bicepResources = fileContent(buildAzureStarterFiles(answers), 'resources.bicep');
  const terraformMain = fileContent(
    buildAzureStarterFiles({ ...answers, iacFlavor: 'Terraform' }),
    'main.tf'
  );
  const bicepPlanName = bicepResources.match(/resource plan[\s\S]*?name: '([^']+)'/)[1];
  const terraformPlanName = terraformMain.match(/resource "azurerm_service_plan" "plan"[\s\S]*?name\s+= "([^"]+)"/)[1];

  assert.equal(bicepPlanName.length, 60);
  assert.equal(terraformPlanName.length, 60);
  assert.equal(bicepPlanName.endsWith('-plan'), true);
  assert.equal(terraformPlanName.endsWith('-plan'), true);
});

test('Azure starter rejects reserved PostgreSQL administrator names', () => {
  for (const postgresAdminUser of ['admin', 'root', 'azure_superuser', 'pg_owner']) {
    assert.throws(
      () => buildAzureStarterFiles({ ...baseAnswers('Bicep'), postgresAdminUser }),
      /PostgreSQL admin user.*reserved/i
    );
  }
});

test('Azure starter rejects reserved PostgreSQL application role names', () => {
  const reservedNames = [
    'public',
    'azure_pg_admin',
    'azuresu',
    'pg_read_all_data',
    'pg_write_all_data',
    'pg_monitor',
    'postgres'
  ];

  for (const postgresAppUser of reservedNames) {
    assert.throws(
      () => buildAzureStarterFiles({ ...baseAnswers('Bicep'), postgresAppUser }),
      /PostgreSQL application user.*reserved/i,
      postgresAppUser
    );
  }
});

test('Azure starter keeps the PostgreSQL administrator out of application settings', () => {
  const bicepFiles = buildAzureStarterFiles(baseAnswers('Bicep'));
  const terraformFiles = buildAzureStarterFiles(baseAnswers('Terraform'));
  const bicepParameters = fileContent(bicepFiles, 'main.parameters.json');
  const terraformValues = fileContent(terraformFiles, 'terraform.tfvars.example');

  assert.match(bicepParameters, /"postgresAppUser"[\s\S]*"appuser"/);
  assert.match(terraformValues, /postgres_app_user\s+= "appuser"/);
  assert.doesNotMatch(bicepParameters, /postgresAppPassword/);
  assert.doesNotMatch(terraformValues, /postgres_app_password/);
});

function fileContent(files, fileName) {
  const file = files.find((candidate) => candidate.path.endsWith(`/${fileName}`));
  assert.ok(file, `Generated files should include ${fileName}.`);
  return file.content;
}

function normalizeFilesForSnapshot(files) {
  return files
    .map((file) => ({
      path: file.path,
      sha256: sha256(file.content)
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

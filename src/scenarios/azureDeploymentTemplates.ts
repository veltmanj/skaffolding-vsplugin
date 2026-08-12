import * as path from 'node:path';

type IaCFlavor = 'Bicep' | 'Terraform';

export interface AzureDeploymentAnswers {
  iacFlavor: IaCFlavor;
  targetFolder: string;
  resourceGroupName: string;
  location: string;
  appServiceName: string;
  postgresServerName: string;
  postgresDatabaseName: string;
  postgresAdminUser: string;
  postgresAppUser: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export function buildAzureStarterFiles(answers: AzureDeploymentAnswers): GeneratedFile[] {
  const validationError = validateAzureDeploymentAnswers(answers);
  if (validationError) {
    throw new Error(validationError);
  }

  if (answers.iacFlavor === 'Bicep') {
    return buildBicepFiles(answers);
  }
  return buildTerraformFiles(answers);
}

export function validateAzureDeploymentAnswers(answers: AzureDeploymentAnswers): string | undefined {
  if (answers.iacFlavor !== 'Bicep' && answers.iacFlavor !== 'Terraform') {
    return 'IaC type must be Bicep or Terraform.';
  }
  if (!isSafeTargetFolder(answers.targetFolder)) {
    return 'Target folder must be a safe relative path.';
  }
  if (!/^[A-Za-z0-9_().-]{1,90}$/.test(answers.resourceGroupName)) {
    return 'Resource group name must contain 1 to 90 supported characters.';
  }
  if (answers.resourceGroupName.endsWith('.')) {
    return 'Resource group name cannot have a trailing period.';
  }
  if (!/^[a-z0-9]{2,50}$/.test(answers.location)) {
    return 'Location must contain lowercase letters and numbers only.';
  }
  if (!isAzureDnsName(answers.appServiceName, 2, 60)) {
    return 'App Service name must use lowercase letters, numbers, and hyphens.';
  }
  if (!isAzureDnsName(answers.postgresServerName, 3, 63)) {
    return 'PostgreSQL server name must use lowercase letters, numbers, and hyphens.';
  }
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(answers.postgresDatabaseName)) {
    return 'PostgreSQL database name must start with a lowercase letter and use lowercase letters, numbers, or underscores.';
  }
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(answers.postgresAdminUser)) {
    return 'PostgreSQL admin user must start with a lowercase letter and use lowercase letters, numbers, or underscores.';
  }
  if (isReservedPostgresRole(answers.postgresAdminUser)) {
    return 'PostgreSQL admin user is reserved by PostgreSQL or Azure.';
  }
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(answers.postgresAppUser)) {
    return 'PostgreSQL application user must start with a lowercase letter and use lowercase letters, numbers, or underscores.';
  }
  if (isReservedPostgresRole(answers.postgresAppUser)) {
    return 'PostgreSQL application user is reserved by PostgreSQL or Azure.';
  }
  if (answers.postgresAppUser === answers.postgresAdminUser) {
    return 'PostgreSQL application user must differ from the PostgreSQL admin user.';
  }
  return undefined;
}

export function escapeTerraformString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function buildBicepFiles(a: AzureDeploymentAnswers): GeneratedFile[] {
  const root = normalizedRoot(a.targetFolder);
  const planName = servicePlanName(a.appServiceName);
  return [
    {
      path: `${root}/main.bicep`,
      content: `targetScope = 'subscription'

param resourceGroupName string
param location string
param appServiceName string
param postgresServerName string
param postgresDatabaseName string
param postgresAdminUser string
@secure()
param postgresAdminPassword string
param postgresAppUser string
@secure()
param postgresAppPassword string
param postgresFirewallStartIp string
param postgresFirewallEndIp string

resource resourceGroup 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: resourceGroupName
  location: location
}

module applicationResources './resources.bicep' = {
  name: 'azure-starter-resources'
  scope: resourceGroup
  params: {
    location: location
    appServiceName: appServiceName
    postgresServerName: postgresServerName
    postgresDatabaseName: postgresDatabaseName
    postgresAdminUser: postgresAdminUser
    postgresAdminPassword: postgresAdminPassword
    postgresAppUser: postgresAppUser
    postgresAppPassword: postgresAppPassword
    postgresFirewallStartIp: postgresFirewallStartIp
    postgresFirewallEndIp: postgresFirewallEndIp
  }
}

output webAppName string = applicationResources.outputs.webAppName
output postgresHost string = applicationResources.outputs.postgresHost
`
    },
    {
      path: `${root}/resources.bicep`,
      content: `param location string
param appServiceName string
param postgresServerName string
param postgresDatabaseName string
param postgresAdminUser string
@secure()
param postgresAdminPassword string
param postgresAppUser string
@secure()
param postgresAppPassword string
param postgresFirewallStartIp string
param postgresFirewallEndIp string

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${planName}'
  location: location
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: appServiceName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: plan.id
    siteConfig: {
      linuxFxVersion: 'JAVA|25-java25'
      appSettings: [
        {
          name: 'SPRING_PROFILES_ACTIVE'
          value: 'dev'
        }
        {
          name: 'SPRING_DATASOURCE_URL'
          value: 'jdbc:postgresql://\${postgresServer.properties.fullyQualifiedDomainName}:5432/\${postgresDatabaseName}?sslmode=require'
        }
        {
          name: 'SPRING_DATASOURCE_USERNAME'
          value: postgresAppUser
        }
        {
          name: 'SPRING_DATASOURCE_PASSWORD'
          value: postgresAppPassword
        }
      ]
    }
  }
}

resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: postgresServerName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: postgresAdminUser
    administratorLoginPassword: postgresAdminPassword
    version: '16'
    storage: {
      storageSizeGB: 32
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

resource postgresFirewallRule 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: postgresServer
  name: 'manual-client-access'
  properties: {
    startIpAddress: postgresFirewallStartIp
    endIpAddress: postgresFirewallEndIp
  }
}

resource postgresAzureServicesFirewallRule 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: postgresServer
  name: 'allow-azure-services'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: postgresServer
  name: postgresDatabaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

output webAppName string = webApp.name
output postgresHost string = postgresServer.properties.fullyQualifiedDomainName
`
    },
    {
      path: `${root}/main.parameters.json`,
      content: JSON.stringify({
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',
        contentVersion: '1.0.0.0',
        parameters: {
          resourceGroupName: { value: a.resourceGroupName },
          location: { value: a.location },
          appServiceName: { value: a.appServiceName },
          postgresServerName: { value: a.postgresServerName },
          postgresDatabaseName: { value: a.postgresDatabaseName },
          postgresAdminUser: { value: a.postgresAdminUser },
          postgresAppUser: { value: a.postgresAppUser },
          postgresFirewallStartIp: { value: 'REPLACE_WITH_YOUR_PUBLIC_IP' },
          postgresFirewallEndIp: { value: 'REPLACE_WITH_YOUR_PUBLIC_IP' }
        }
      }, null, 2) + '\n'
    },
    {
      path: `${root}/DEPLOY.md`,
      content: `# Azure Bicep Deploy

The template creates the application resource group.

Do not add either database password to \`main.parameters.json\`.

Replace both \`REPLACE_WITH_YOUR_PUBLIC_IP\` values before deployment. For one client, use the same public IPv4 address for both values. Azure firewall rules use a start and end IPv4 address. They do not use CIDR text.

The template also allows any Azure service, including services in other customer subscriptions. Use this public-access rule only when it is required. For production, use private access with virtual network integration. Private access does not use firewall rules.

Use the administrator credentials only for provisioning. The Spring application uses a separate database user.

Enter both passwords in the current shell. The commands do not save them in a file. Use a different strong password for each user.

read -r -s POSTGRES_ADMIN_PASSWORD
printf '\\n'
read -r -s POSTGRES_APP_PASSWORD
printf '\\n'
export POSTGRES_APP_PASSWORD

Run this command:

az deployment sub create \\
  --location ${shellQuote(a.location)} \\
  --template-file main.bicep \\
  --parameters @main.parameters.json postgresAdminPassword="$POSTGRES_ADMIN_PASSWORD" postgresAppPassword="$POSTGRES_APP_PASSWORD"

Create the application role after the deployment. This role can connect and create objects in the public schema. The administrator is used only for this provisioning step.

POSTGRES_HOST=$(az postgres flexible-server show \\
  --resource-group ${shellQuote(a.resourceGroupName)} \\
  --name ${shellQuote(a.postgresServerName)} \\
  --query fullyQualifiedDomainName \\
  --output tsv)

PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" psql \\
  "host=$POSTGRES_HOST port=5432 dbname=${a.postgresDatabaseName} user=${a.postgresAdminUser} sslmode=require" \\
  --set=app_user=${shellQuote(a.postgresAppUser)} <<'SQL'
\\getenv app_password POSTGRES_APP_PASSWORD
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user') \\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_user') \\gexec
GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";
SQL

Restart the web app after you create the role. For production, put the application password in Azure Key Vault and use an App Service Key Vault reference.

Clear the password after deployment:

unset POSTGRES_ADMIN_PASSWORD POSTGRES_APP_PASSWORD PGPASSWORD
`
    }
  ];
}

function buildTerraformFiles(a: AzureDeploymentAnswers): GeneratedFile[] {
  const root = normalizedRoot(a.targetFolder);
  const planName = servicePlanName(a.appServiceName);
  return [
    {
      path: `${root}/main.tf`,
      content: `terraform {
  required_version = ">= 1.8.0"

  backend "azurerm" {}

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.40"
    }
  }
}

provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
}

resource "azurerm_service_plan" "plan" {
  name                = "${planName}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  os_type             = "Linux"
  sku_name            = "B1"
}

resource "azurerm_linux_web_app" "app" {
  name                = var.app_service_name
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  service_plan_id     = azurerm_service_plan.plan.id

  site_config {
    application_stack {
      java_version        = "25"
      java_server         = "JAVA"
      java_server_version = "25"
    }
  }

  app_settings = {
    SPRING_PROFILES_ACTIVE    = "dev"
    SPRING_DATASOURCE_URL      = "jdbc:postgresql://\${azurerm_postgresql_flexible_server.db.fqdn}:5432/\${azurerm_postgresql_flexible_server_database.appdb.name}?sslmode=require"
    SPRING_DATASOURCE_USERNAME = var.postgres_app_user
    SPRING_DATASOURCE_PASSWORD = var.postgres_app_password
  }
}

resource "azurerm_postgresql_flexible_server" "db" {
  name                   = var.postgres_server_name
  resource_group_name    = azurerm_resource_group.rg.name
  location               = azurerm_resource_group.rg.location
  version                = "16"
  administrator_login    = var.postgres_admin_user
  administrator_password = var.postgres_admin_password
  sku_name               = "B_Standard_B1ms"
  storage_mb             = 32768
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "manual_client_access" {
  name             = "manual-client-access"
  server_id        = azurerm_postgresql_flexible_server.db.id
  start_ip_address = var.postgres_firewall_start_ip
  end_ip_address   = var.postgres_firewall_end_ip
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_azure_services" {
  name             = "allow-azure-services"
  server_id        = azurerm_postgresql_flexible_server.db.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

resource "azurerm_postgresql_flexible_server_database" "appdb" {
  name      = var.postgres_database_name
  server_id = azurerm_postgresql_flexible_server.db.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

output "postgres_host" {
  value = azurerm_postgresql_flexible_server.db.fqdn
}
`
    },
    {
      path: `${root}/variables.tf`,
      content: `variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "app_service_name" {
  type = string
}

variable "postgres_server_name" {
  type = string
}

variable "postgres_database_name" {
  type = string
}

variable "postgres_admin_user" {
  type = string
}

variable "postgres_admin_password" {
  type      = string
  sensitive = true
}

variable "postgres_app_user" {
  type = string
}

variable "postgres_app_password" {
  type      = string
  sensitive = true
}

variable "postgres_firewall_start_ip" {
  type        = string
  description = "Replace the example value with the first allowed public IPv4 address."
}

variable "postgres_firewall_end_ip" {
  type        = string
  description = "Replace the example value with the last allowed public IPv4 address. Use the same address for one client."
}
`
    },
    {
      path: `${root}/terraform.tfvars.example`,
      content: `resource_group_name         = "${escapeTerraformString(a.resourceGroupName)}"
location                    = "${escapeTerraformString(a.location)}"
app_service_name            = "${escapeTerraformString(a.appServiceName)}"
postgres_server_name        = "${escapeTerraformString(a.postgresServerName)}"
postgres_database_name      = "${escapeTerraformString(a.postgresDatabaseName)}"
postgres_admin_user         = "${escapeTerraformString(a.postgresAdminUser)}"
postgres_app_user           = "${escapeTerraformString(a.postgresAppUser)}"
postgres_firewall_start_ip  = "REPLACE_WITH_YOUR_PUBLIC_IP"
postgres_firewall_end_ip    = "REPLACE_WITH_YOUR_PUBLIC_IP"
`
    },
    {
      path: `${root}/.gitignore`,
      content: `.terraform/
*.tfstate
*.tfstate.*
*.tfplan
terraform.tfvars
backend.tfvars
`
    },
    {
      path: `${root}/DEPLOY.md`,
      content: `# Azure Terraform Deploy

The template creates the application resource group.

Configure a remote Azure Storage backend before you run Terraform. Do not use local state. State can contain secret values.

Do not commit state files, plan files, backend values, or \`terraform.tfvars\` to source control. The generated \`.gitignore\` protects these local files.

Sign in to Azure before you run Terraform:

\`az login\`

Use Microsoft Entra ID for the remote-state storage account. Give your user or workload identity the \`Storage Blob Data Contributor\` role on the state storage account. The account must also have the Azure permissions that the deployment needs.

Do not pass secrets with \`-backend-config\`. Terraform can save backend values in \`.terraform\` and plan files. Use Microsoft Entra ID authentication instead.

Copy the example values. Replace REPLACE_WITH_YOUR_PUBLIC_IP in both values. For one client, use the same public IPv4 address for both values. Azure firewall rules use a start and end IPv4 address. They do not use CIDR text.

The template also allows any Azure service, including services in other customer subscriptions. Use this public-access rule only when it is required. For production, use private access with virtual network integration. Private access does not use firewall rules.

cp terraform.tfvars.example terraform.tfvars

Use the administrator credentials only for provisioning. The Spring application uses a separate database user.

Enter both passwords in the current shell. Terraform reads these environment variables. Use a different strong password for each user. The protected remote state contains sensitive values, so limit access to it.

read -r -s TF_VAR_postgres_admin_password
printf '\\n'
export TF_VAR_postgres_admin_password
read -r -s TF_VAR_postgres_app_password
printf '\\n'
export TF_VAR_postgres_app_password

Run Terraform with your protected remote backend values:

terraform init \\
  -backend-config="resource_group_name=REPLACE_WITH_STATE_RESOURCE_GROUP" \\
  -backend-config="storage_account_name=REPLACE_WITH_STATE_STORAGE_ACCOUNT" \\
  -backend-config="container_name=REPLACE_WITH_STATE_CONTAINER" \\
  -backend-config="key=app.terraform.tfstate" \\
  -backend-config="use_cli=true" \\
  -backend-config="use_azuread_auth=true"
terraform plan
terraform apply

Create the application role after the deployment. This role can connect and create objects in the public schema. The administrator is used only for this provisioning step.

POSTGRES_HOST=$(terraform output -raw postgres_host)
PGPASSWORD="$TF_VAR_postgres_admin_password" psql \\
  "host=$POSTGRES_HOST port=5432 dbname=${a.postgresDatabaseName} user=${a.postgresAdminUser} sslmode=require" \\
  --set=app_user=${shellQuote(a.postgresAppUser)} <<'SQL'
\\getenv app_password TF_VAR_postgres_app_password
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user') \\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_user') \\gexec
GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";
SQL

Restart the web app after you create the role. For production, put the application password in Azure Key Vault and use an App Service Key Vault reference.

Clear the password after deployment:

unset TF_VAR_postgres_admin_password TF_VAR_postgres_app_password PGPASSWORD
`
    }
  ];
}

function isSafeTargetFolder(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0 || /[\r\n\0]/.test(value)) {
    return false;
  }
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes('\\')) {
    return false;
  }
  const segments = value.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function isAzureDnsName(value: string, minimumLength: number, maximumLength: number): boolean {
  if (value.length < minimumLength || value.length > maximumLength) {
    return false;
  }
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value);
}

function isReservedPostgresRole(value: string): boolean {
  const reservedNames = new Set([
    'admin',
    'administrator',
    'azure_pg_admin',
    'azure_superuser',
    'azuresu',
    'guest',
    'postgres',
    'public',
    'root'
  ]);
  return reservedNames.has(value) || value.startsWith('pg_');
}

function servicePlanName(appServiceName: string): string {
  return `${appServiceName.slice(0, 55)}-plan`;
}

function normalizedRoot(targetFolder: string): string {
  return targetFolder.replace(/\/$/, '');
}

# Skaffolding VS Plugin

Scenario-based scaffolding for new projects.

The current first focus group is Java 25, Spring Boot, Azure, and PostgreSQL.

## Repository status

This project was not a Git repository in the shared workspace. It is now being
prepared for its first public GitHub repository.

## Commands

- `Skaffold: Run Scenario`
- `Skaffold: Create Scenario Pack Template`
- `Skaffold: Create Spring Boot Service`
- `Skaffold: Create Azure Deployment Starter`
- `Skaffold: Add Spring SecurityConfig`

The default macOS keybinding for `Skaffold: Run Scenario` is Cmd+Alt+S.

## Development

Install, build, and test the extension with:

```sh
npm install
npm run compile
npm test
```

Press F5 in VS Code to start the Extension Development Host. Then open the
Command Palette and run `Skaffold: Run Scenario`.

Update Azure output snapshots during development with:

```sh
npm run snapshots:update:azure
```

The snapshot script uses the same safe path and file writer helpers as the
extension. The release VSIX does not include this script or its test helper
files.

## Safe file generation

All generated files must stay inside the first open workspace folder.
The extension rejects absolute paths and paths outside the workspace. It uses
`lstat` on each existing target component. It rejects symlink parents,
symlink leaves, and dangling symlinks. A scenario stops when a path is unsafe.

The extension protects existing files. For each existing target, choose
`Overwrite` or `Skip`. `Skip` leaves the file unchanged. Dismiss the choice
to cancel the current scenario. The scenario then stops before it writes any
later files. The final message reports created, overwritten, and skipped
files. New files use exclusive create. Before an approved overwrite, the
extension checks the file again. It stops if the target is a symlink or if a
different file appeared after approval.

## Current scenarios

### Spring Boot: Create Service

This scenario asks for the service style, service name, folder, base package,
Maven or Gradle, Java version, TDD settings, persistence, database, and
migration tool. It creates the build file, `application.yml`, the main class,
and `ARCHITECTURE_NOTES.md`. QueryDSL selection adds its API and annotation
processor configuration.

### Spring Boot: Add SecurityConfig

This scenario creates `SecurityConfig.java` for Basic, JWT, Detached JWS, or
WebAuthn. Detached JWS and WebAuthn are marked as incomplete placeholders.
Do not use those two templates for production verification or authentication.

### Azure: Create Deployment Starter

This scenario creates Bicep or Terraform starter files for Spring Boot and
PostgreSQL. It also creates a deployment guide. The generated Spring settings
use a separate application database user and password. They do not use the
PostgreSQL administrator credentials.

The scenario checks Azure name limits. A resource group name can contain up to
90 characters and cannot end with a period. An App Service name can contain up
to 60 characters. A PostgreSQL server name can contain up to 63 characters.
The generated App Service plan name also stays within its 60-character limit.
The scenario rejects reserved PostgreSQL administrator names.

## JSON scenario packs

Add JSON files to `.skaffold/scenario-packs/`, then run
`Skaffold: Run Scenario`. You can create a starter with
`Skaffold: Create Scenario Pack Template`.

The runtime validates each pack before it loads it. It checks the pack fields,
prompt fields and types, prompt IDs, defaults, select options, and file
definitions. An invalid JSON file is skipped and a warning names the file and
the invalid field. A valid pack in the same folder can still load.

Pack IDs use lowercase kebab case. They can contain lowercase letters,
numbers, and single dashes between segments.

Prompt IDs use lower camel case. An ID must start with a lowercase letter. The
remaining characters must be letters or numbers. Each `{{placeholder}}` must
use this pattern and must name a declared prompt. The runtime rejects unknown
placeholders, malformed IDs, and unmatched placeholder delimiters. The JSON
schema applies prompt-specific default types. It requires non-empty options
for select prompts and rejects options for other prompt types.

The editor also validates files that match
`**/.skaffold/scenario-packs/*.json` with
`schemas/scenario-pack.schema.json`.

Reference example: `examples/scenario-packs/java-clean-module.json`.

## Azure secrets and network access

Never put a PostgreSQL password in `main.parameters.json` or
`terraform.tfvars`. The generated guides use two passwords. One password is
for the PostgreSQL administrator. The other password is for the application
database user. Use the administrator only to provision the server and the
application role. Do not use the administrator in Spring datasource settings.

The Bicep guide reads both passwords into the current shell. The Terraform
guide uses `TF_VAR_postgres_admin_password` and
`TF_VAR_postgres_app_password`. The role creation command reads the
application password from the environment. It does not put this password in a
`psql` process argument. Clear all password variables after provisioning.

For production, store the application password in Azure Key Vault. Use an App
Service Key Vault reference. Limit access to Terraform state because state can
contain sensitive values.

The starter enables public PostgreSQL access for the manual client rule. It
also includes the Azure-services rule, which can allow any Azure service,
including services in another customer subscription. Use this only when it is
needed. For production, use private access with virtual network integration.
Private access does not use firewall rules. Replace the example public IP
values before deployment.

## Terraform state protection

Configure an Azure Storage remote backend before running Terraform. Do not use
local state. State and plan files can contain secret values.

Use Microsoft Entra ID for the state storage account and grant the user or
workload identity the `Storage Blob Data Contributor` role. Do not pass secrets
with `-backend-config`; Terraform can save backend values in `.terraform` and
plan files. Do not commit state, plan files, backend values, or
`terraform.tfvars`. The generated `.gitignore` protects the local files.

## VSIX packaging

Build and inspect a release package with:

```sh
npm run package
npm run check:package
```

`npm run package` runs the `vscode:prepublish` compile step and creates
`skaffolding-vsplugin.vsix`. The package check confirms that the compiled
extension entry point and `schemas/scenario-pack.schema.json` are present and
that development files are excluded. This includes `out/testing` and the Azure
snapshot update command. The check also requires a non-local publisher,
repository metadata, license metadata, and the packaged `LICENSE.txt` file.
The source license file is `LICENSE`.

The package uses the MIT license. See [LICENSE](LICENSE).

## Current development and release limitations

- This is an early development extension, not a finished production product.
- The supported focus is Java 25, Spring Boot, Azure, and PostgreSQL.
- Azure commands create starter files. They do not run Azure or Terraform
  deployments for you.
- Detached JWS and WebAuthn output is placeholder code.
- Review all generated code, firewall rules, identities, secrets, and state
  settings before use in a real environment.

The project is not a Git repository in this workspace. No commit is created by
the development workflow.

## How to add a scenario

1. Create a file in `src/scenarios/`.
2. Export an object that implements `Scenario` from
   `src/scenarios/types.ts`.
3. Register it in `src/scenarios/registry.ts`.
4. Add a direct command in `package.json` if needed.

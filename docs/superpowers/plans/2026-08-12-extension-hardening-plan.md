# VS Code Extension Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the extension safe for workspace file generation, improve generated project output, and make VSIX packaging verifiable.

**Architecture:** Add small pure helpers for path validation, scenario pack validation, and file-write decisions. Reuse these helpers from the existing scenario commands. Keep VS Code interaction in command files and keep pure behavior testable with Node tests.

**Tech Stack:** TypeScript, VS Code Extension API, Node test runner, npm, `@vscode/vsce`.

## Global Constraints

- All generated paths must remain inside the active workspace.
- Existing files must not change without explicit overwrite confirmation.
- Invalid scenario packs must be skipped with a warning.
- Secret values must not be committed as real credentials.
- Use test-first development for behavior changes.
- Keep the current command model and JSON scenario pack format.

---

### Task 1: Add path safety helpers

**Files:**
- Create: `src/scenarios/fileSafety.ts`
- Create: `test/fileSafety.test.cjs`

**Interfaces:**
- Produces `resolveWorkspacePath(workspaceRoot: string, relativePath: string): string`.
- Produces `isExistingFile(filePath: string): Promise<boolean>` only if needed by shared write logic.

- [ ] **Step 1: Write failing tests** for accepting `src/file.txt`, rejecting `../file.txt`, rejecting `/tmp/file.txt`, and rejecting the sibling-prefix case where the workspace is `/tmp/work` and the target is `/tmp/work-other/file.txt`.
- [ ] **Step 2: Run `npm test`; confirm the new test fails because the helper does not exist.
- [ ] **Step 3: Implement path resolution with `path.resolve`, absolute-path rejection, and `path.relative` boundary checks.
- [ ] **Step 4: Run the focused test and then `npm test`; confirm all tests pass.

### Task 2: Add safe overwrite decisions

**Files:**
- Create: `src/scenarios/fileWriter.ts`
- Create: `test/fileWriter.test.cjs`

**Interfaces:**
- Produces `shouldWriteFile(exists: boolean, decision: 'overwrite' | 'skip'): boolean`.
- Produces `writeGeneratedFile(uri: vscode.Uri, content: string): Promise<void>` for the VS Code write operation.

- [ ] **Step 1: Write failing tests** that an absent file writes, an existing file skips when the decision is `skip`, and an existing file writes when the decision is `overwrite`.
- [ ] **Step 2: Run the focused tests and confirm failure.
- [ ] **Step 3: Implement the minimal pure decision helper and write helper.
- [ ] **Step 4: Run focused tests and `npm test`.
- [ ] **Step 5: Update the scenario pack, Spring, Azure, and security commands to use safe path resolution and overwrite decisions.
- [ ] **Step 6: Add command-level confirmation where a target exists and report created and skipped counts.
- [ ] **Step 7: Run `npm test`.

### Task 3: Strengthen scenario pack runtime validation

**Files:**
- Create: `src/scenarioPacks/validation.ts`
- Modify: `src/scenarios/scenarioPackRuntime.ts`
- Create: `test/scenarioPackValidation.test.cjs`

**Interfaces:**
- Produces `validateScenarioPack(value: unknown, fileName: string): ScenarioPackDefinition`.

- [ ] **Step 1: Write failing tests** for wrong top-level types, invalid prompt types, duplicate prompt IDs, invalid defaults, select prompts without options, and malformed files.
- [ ] **Step 2: Run the focused tests and confirm failure.
- [ ] **Step 3: Implement strict runtime validation with clear file and field error messages.
- [ ] **Step 4: Replace the local validator in `scenarioPackRuntime.ts` with the shared validator.
- [ ] **Step 5: Run focused tests and `npm test`.

### Task 4: Fix scenario pack template output

**Files:**
- Modify: `src/scenarios/scenarioPackTemplateCommand.ts`
- Create: `test/scenarioPackTemplate.test.cjs`

**Interfaces:**
- Export a testable `createTemplate(id: string, label: string, description: string): string` function.

- [ ] **Step 1: Write a failing test** that parses the generated JSON and checks that rendered README content contains real line breaks, not literal `\\n` text.
- [ ] **Step 2: Run the focused test and confirm failure.
- [ ] **Step 3: Replace `String.raw` with a normal multiline template string and export the pure template function.
- [ ] **Step 4: Run focused tests and `npm test`.

### Task 5: Improve generated Spring output

**Files:**
- Modify: `src/scenarios/springBootNewService.ts`
- Create: `test/springBootTemplates.test.cjs`

**Interfaces:**
- Export the existing render functions needed by tests without changing command behavior.

- [ ] **Step 1: Write failing tests** for QueryDSL dependencies and annotation processing in Maven and Gradle output.
- [ ] **Step 2: Run the focused tests and confirm failure.
- [ ] **Step 3: Add QueryDSL API and annotation processor configuration.
- [ ] **Step 4: Move the Spring Boot version to one named constant and use it in both Maven and Gradle output.
- [ ] **Step 5: Add input validation for Java version, service folder, package name, and service name.
- [ ] **Step 6: Add overwrite checks before creating the service files.
- [ ] **Step 7: Run focused tests and `npm test`.

### Task 6: Improve generated security output

**Files:**
- Modify: `src/scenarios/springSecurityConfig.ts`
- Create: `test/springSecurityConfig.test.cjs`

**Interfaces:**
- Export the servlet and reactive render functions for pure tests.

- [ ] **Step 1: Write failing tests** that identify Detached JWS and WebAuthn output as placeholder templates and verify the selected mode is stated in the generated comments.
- [ ] **Step 2: Run the focused tests and confirm failure.
- [ ] **Step 3: Add explicit placeholder comments and safe usage notes.
- [ ] **Step 4: Apply workspace path validation to the target service folder.
- [ ] **Step 5: Run focused tests and `npm test`.

### Task 7: Improve Azure starter output

**Files:**
- Modify: `src/scenarios/azureDeploymentTemplates.ts`
- Modify: `src/scenarios/azureDeploymentStarter.ts`
- Modify: `test/azureDeploymentStarter.test.cjs`

**Interfaces:**
- Keep `buildAzureStarterFiles(answers: AzureDeploymentAnswers): GeneratedFile[]` stable.

- [ ] **Step 1: Write failing tests** that require no real password value, require database connection settings, and require clear secret instructions.
- [ ] **Step 2: Run the focused tests and confirm failure.
- [ ] **Step 3: Add safe App Service database settings using deployment outputs or environment variables.
- [ ] **Step 4: Remove password placeholder values from parameter examples and document secure parameter input.
- [ ] **Step 5: Add target-folder path validation and overwrite checks.
- [ ] **Step 6: Update snapshot hashes only after the output is correct.
- [ ] **Step 7: Run focused tests and `npm test`.

### Task 8: Add VSIX packaging checks

**Files:**
- Modify: `package.json`
- Modify: `.vscodeignore`
- Create: `scripts/check-vsix.cjs`
- Create: `test/packageManifest.test.cjs`

**Interfaces:**
- Produces `npm run package` and `npm run check:package` commands.

- [ ] **Step 1: Write failing manifest tests** for the prepublish script, package command, and compiled entry point.
- [ ] **Step 2: Run the focused tests and confirm failure.
- [ ] **Step 3: Add `@vscode/vsce`, `vscode:prepublish`, `package`, and `check:package` scripts.
- [ ] **Step 4: Update `.vscodeignore` so compiled output and required schema files are included.
- [ ] **Step 5: Implement the package inspection script.
- [ ] **Step 6: Run `npm test`, `npm run package`, and `npm run check:package`.

### Task 9: Final verification and documentation

**Files:**
- Modify: `README.md`
- Modify: `package.json` only if packaging checks require metadata changes.

- [ ] **Step 1: Update README instructions for safe generation, packaging, and secret handling.
- [ ] **Step 2: Run `npm test`.
- [ ] **Step 3: Run `npm run compile`.
- [ ] **Step 4: Run `npm run package`.
- [ ] **Step 5: Run `npm run check:package`.
- [ ] **Step 6: Inspect the VSIX file list and confirm `out/extension.js` and the schema are present.
- [ ] **Step 7: Report changed files and verification results.

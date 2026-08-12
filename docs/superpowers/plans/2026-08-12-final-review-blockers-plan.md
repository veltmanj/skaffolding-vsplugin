# Final Review Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the parent-link race, align prompt and placeholder validation, and block reserved Azure PostgreSQL application roles.

**Architecture:** Keep workspace path and parent identity checks in `fileSafety.ts`. Make `fileWriter.ts` write only through checked file handles. Keep prompt rules in runtime validation and mirror the placeholder grammar in the JSON schema.

**Tech Stack:** TypeScript, Node file system APIs, Node test runner, Ajv Draft 2020-12, npm, VSCE.

## Global Constraints

- Use TDD for each behavior change.
- Keep every generated file inside the active workspace.
- Reject parent links that appear after initial path validation.
- Runtime and schema validation must reject the same prompt-shape and placeholder-syntax errors.
- Do not create a Git commit.
- Use ASD-STE100 Simplified English in the final report.

---

### Task 1: Safe parent operations

**Files:**

- Modify: `src/scenarios/fileSafety.ts`
- Modify: `src/scenarios/fileWriter.ts`
- Modify: scenario command callers and the snapshot script
- Test: `test/fileSafety.test.cjs`
- Test: `test/fileWriter.test.cjs`

**Interfaces:**

- Produce `createWorkspaceDirectory(workspaceRoot: string, directoryPath: string): Promise<void>`.
- Extend the shared writer with a required workspace root for real file operations.

- [x] **Step 1: Write failing race tests.** Replace a checked directory with a link. Call the safe directory and file operations. Assert rejection and assert that no outside file contains generated data.
- [x] **Step 2: Run `npm test -- --test-name-pattern='parent.*replaced|replaced.*parent'`.** Confirm that the test fails because the safe operation does not exist or the outside write occurs.
- [x] **Step 3: Add checked directory creation.** Walk from the workspace root. Reject links and non-directories. Record and compare parent `{ dev, ino }` values around each non-recursive `mkdir` call.
- [x] **Step 4: Add checked file open.** Capture parent identities, open with `O_NOFOLLOW`, and compare the identities before content write. Use `O_CREAT | O_EXCL` for new files. Keep the approved file identity check for overwrites.
- [x] **Step 5: Route all generators through the safe directory and writer APIs.** Pass the workspace root at each call site.
- [x] **Step 6: Run the focused file safety tests.** Confirm that the race tests pass and existing overwrite tests stay green.

### Task 2: Runtime and schema alignment

**Files:**

- Modify: `src/scenarioPacks/validation.ts`
- Modify: `schemas/scenario-pack.schema.json`
- Test: `test/scenarioPackValidation.test.cjs`

**Interfaces:**

- Keep `validateScenarioPack(value: unknown, fileName: string): ScenarioPackDefinition` stable.

- [x] **Step 1: Write failing tests.** Send `options` on `input` and `boolean` prompts to runtime validation. Send stray, unmatched, nested, and invalid-ID placeholder text to runtime and schema validation.
- [x] **Step 2: Run `npm test -- --test-name-pattern='options|placeholder'`.** Confirm the runtime options cases and schema stray-close case fail.
- [x] **Step 3: Reject non-select options at runtime.** Return a field-specific error from `validatePrompt`.
- [x] **Step 4: Align the schema pattern.** Allow valid `{{promptId}}` tokens and text, but reject unmatched `{{` and `}}` delimiters.
- [x] **Step 5: Run the focused validation tests.** Confirm all runtime and schema cases pass.

### Task 3: Reserved Azure application roles

**Files:**

- Modify: `src/scenarios/azureDeploymentTemplates.ts`
- Test: `test/azureDeploymentStarter.test.cjs`

**Interfaces:**

- Keep `validateAzureDeploymentAnswers` and `buildAzureStarterFiles` stable.

- [x] **Step 1: Write failing tests.** Test `public`, `azure_pg_admin`, `azuresu`, `pg_read_all_data`, `pg_write_all_data`, `postgres`, and another `pg_` system role as application users.
- [x] **Step 2: Run `npm test -- --test-name-pattern='application.*reserved'`.** Confirm the reserved application role test fails.
- [x] **Step 3: Use one reserved-role helper.** Apply it to both database users and return an application-user error for the application role.
- [x] **Step 4: Run the focused Azure tests.** Confirm the administrator and application role tests pass.

### Task 4: Verification and report

**Files:**

- Modify: `.superpowers/sdd/2026-08-12-extension-hardening/task-9-report.md`

- [x] **Step 1: Run `npm test`.** Record the pass and fail totals.
- [x] **Step 2: Run `npm run package`.** Record the package file count and size.
- [x] **Step 3: Run `npm run check:package`.** Record the result.
- [x] **Step 4: Update the final report.** Use short ASD-STE100 sentences. State the three fixes, TDD evidence, command results, and that no Git commit exists.

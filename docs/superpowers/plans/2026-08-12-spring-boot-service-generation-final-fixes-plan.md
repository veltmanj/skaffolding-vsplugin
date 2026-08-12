# Spring Boot Service Generation Final Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all eight final-review findings, prove the packaged extension loads, and preserve the supported Spring Boot 2.x and 3.x generation paths.

**Architecture:** Keep answer collection and build rendering in `springBootNewService.ts`, Java source rendering in the two Spring template modules, and package validation in dedicated scripts. Add narrow guards at each public rendering boundary so inconsistent caller-provided answers cannot leak database output when persistence is `None`. Use existing generated service markers for rerun detection instead of adding a new manifest format.

**Tech Stack:** TypeScript, CommonJS, Node.js test runner, VSCE/VSIX ZIP archives, Spring Boot 2.x/3.x, Maven, Gradle, Jackson, MockMvc, WebTestClient.

## Global Constraints

- The VSIX must contain every runtime module reachable from `out/extension.js`.
- Spring Boot major versions 2 and 3 are supported; other major versions are rejected.
- Java versions below 17 are rejected; Spring Boot 2 with Java above 21 is rejected.
- Persistence `None` must not ask for or render database and migration choices.
- TDD tooling is Cucumber only.
- Oracle UUID columns use `VARCHAR2(36)` and every Oracle-capable adapter stores UUID values as strings.
- Existing generated service folders stop before any file is created, overwritten, or skipped.
- Use one final scoped commit after all verification passes.

---

### Task 1: Package closure and runtime smoke

**Files:**

- Modify: `.vscodeignore`
- Modify: `scripts/check-vsix.cjs`
- Create: `scripts/smoke-vsix-runtime.cjs`
- Modify: `package.json`
- Test: `test/packageManifest.test.cjs`

**Interfaces:**

- `npm run check:package` rejects a VSIX missing either Spring template module.
- `npm run smoke:package` extracts the VSIX, loads its declared main module with a complete local VS Code API stub, calls `activate`, and verifies all contributed commands register.

- [x] **Step 1: Add failing package tests.** Require `out/scenarios/springBootServiceTemplates.js` and `out/scenarios/springBootTestTemplates.js` in valid fixtures, prove each omission fails the checker, and execute the runtime smoke against a controlled fixture.
- [x] **Step 2: Run `npm test -- --test-name-pattern='VSIX|packaged extension'`.** Confirm failures name the missing template paths and missing smoke command.
- [x] **Step 3: Add both modules to the VSIX allowlist and checker.** Add the runtime smoke script and its package command.
- [x] **Step 4: Re-run the focused package tests.** Confirm the controlled valid package loads and missing dependencies fail before release.

### Task 2: Jackson-visible REST output

**Files:**

- Modify: `src/scenarios/springBootServiceTemplates.ts`
- Modify: `src/scenarios/springBootTestTemplates.ts`
- Test: `test/springBootTemplates.test.cjs`

**Interfaces:**

- Generated aggregates retain `id()` and `name()` for existing application code and add JavaBean `getId()` and `getName()` accessors for Jackson.
- TDD output adds `<Aggregate>ControllerTest.java`; non-reactive output uses `@WebMvcTest`/`MockMvc`, and reactive output uses `@WebFluxTest`/`WebTestClient`.

- [x] **Step 1: Add failing renderer tests.** Assert generated aggregates expose bean getters and both web-test modes assert literal JSON paths `$.id` and `$.name`.
- [x] **Step 2: Run the focused serialization tests.** Confirm failure because getters and controller tests are absent.
- [x] **Step 3: Add bean getters and generated web slice tests.** Stub only the application service and exercise the real generated controller/Jackson stack.
- [x] **Step 4: Run the generated Maven project.** Confirm the generated web test compiles and passes with the existing Cucumber smoke.

### Task 3: Generated-service rerun preflight

**Files:**

- Modify: `src/scenarios/springBootNewService.ts`
- Test: `test/generatorWriteSafety.test.cjs`
- Test: `test/springBootTemplates.test.cjs`

**Interfaces:**

- Before directory creation, the scenario resolves the target and checks a non-empty existing directory for service markers: `pom.xml`, `build.gradle.kts`, `settings.gradle.kts`, `src/main/resources/application.yml`, or `ARCHITECTURE_NOTES.md`.
- A match reports a clear `showErrorMessage` and returns without writes.
- A pre-existing empty target directory generates normally.

- [x] **Step 1: Add a failing rerun regression.** Generate once, rerun with changed persistence answers, and assert every first-run file remains byte-for-byte unchanged and no second-run-only files appear.
- [x] **Step 2: Add a failing empty-folder regression.** Pre-create an empty target and assert normal output completes.
- [x] **Step 3: Run the focused safety tests.** Confirm rerun currently enters overwrite flow while empty-folder generation passes.
- [x] **Step 4: Add the read-only preflight.** Check the resolved target before creating directories and return on an existing service marker.
- [x] **Step 5: Re-run focused safety tests.** Confirm reruns produce no writes and empty targets remain supported.

### Task 4: Coherent prompt and rendering choices

**Files:**

- Modify: `src/scenarios/springBootNewService.ts`
- Modify: `README.md`
- Test: `test/springBootTemplates.test.cjs`
- Test: `test/generatorWriteSafety.test.cjs`

**Interfaces:**

- `validateSpringBootVersion(value)` accepts semantic versions with major 2 or 3 only.
- `validateJavaVersion(value, springBootVersion?)` enforces Java 17 or newer and caps Boot 2 at Java 21.
- The Java prompt defaults to `21` for Boot 2 and `25` for the current Boot 3 default, and validates against the already-selected Boot version.
- Persistence `None` skips database and migration QuickPicks, stores harmless internal defaults (`H2`/`None`), and all renderers independently suppress persistence dependencies, YAML, and migration output.
- The TDD tool prompt is `showQuickPick(['Cucumber'])`.
- SQL Server reactive URLs use `r2dbc:mssql://`.

- [x] **Step 1: Add failing table-driven renderer tests.** Cover Maven and Gradle, reactive and non-reactive `None`, adversarial Flyway/Liquibase answers, and the SQL Server URL literal.
- [x] **Step 2: Add failing validation and wizard tests.** Cover Boot `1.5.22`/`4.0.0`, Boot 2 with Java 22/25, Java 21 default behavior, skipped database/migration prompts, and Cucumber-only selection.
- [x] **Step 3: Run the focused tests and confirm each missing guard fails.**
- [x] **Step 4: Implement conditional prompts, validation, and renderer guards.** Keep Boot 2.7.18 and Boot 3.5.4 behavior intact.
- [x] **Step 5: Re-run all Spring generator and write-safety tests.** Confirm both build tools and stack modes remain green.

### Task 5: Oracle UUID storage coherence

**Files:**

- Modify: `src/scenarios/springBootServiceTemplates.ts`
- Test: `test/springBootTemplates.test.cjs`

**Interfaces:**

- Oracle Flyway and Liquibase output use `VARCHAR2(36)` for UUID identifiers.
- Oracle JPA/QueryDSL entities use `String` identifiers and convert at the domain boundary.
- Oracle JDBC, R2DBC, and jOOQ adapters bind `UUID.toString()` and parse `UUID.fromString(...)` on reads.
- Other databases retain native UUID mappings.

- [x] **Step 1: Add failing Oracle migration and adapter tests.** Cover every Oracle-capable persistence option and assert literal string conversion at write/read boundaries.
- [x] **Step 2: Run the focused Oracle tests.** Confirm the current `RAW(16)`/native UUID mismatch.
- [x] **Step 3: Add Oracle-specific identifier rendering helpers.** Apply them to migration and adapter templates without changing PostgreSQL, H2, or SQL Server output.
- [x] **Step 4: Re-run persistence tests.** Confirm all adapter and migration cases pass.

### Task 6: Verification, report, and commit

**Files:**

- Create: `.superpowers/sdd/2026-08-12-spring-boot-service-generation-plan/final-fixes-report.md`

- [x] **Step 1: Run focused tests and `npm test`.** Record totals and generated Maven smoke evidence.
- [x] **Step 2: Run `npm run package` and `npm run check:package`.** Record VSIX file count/size and checker output.
- [x] **Step 3: Run `npm run smoke:package`.** Record extension load, activation, and registered-command evidence from the packaged archive.
- [x] **Step 4: Review the final diff and run a package-content spot check.** Confirm no unrelated files or generated build artifacts are staged.
- [x] **Step 5: Write the detailed final report.** Include each finding, root cause, fix, tests, command results, and residual concerns.
- [x] **Step 6: Commit all scoped changes.** Use commit message `fix: close spring boot generator review findings` and verify the worktree is clean.

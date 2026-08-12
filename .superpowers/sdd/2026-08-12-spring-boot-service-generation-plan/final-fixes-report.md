# Spring Boot Service Generation Final Fixes Report

Date: 2026-08-12

Worktree: `/Users/jeroenveltman/skaffolding-vsplugin/.worktrees/spring-boot-service-generation`

Branch: `codex/spring-boot-service-generation`

Starting commit: `55a8dc6d5a848e4577d6a0489ae5b40ee6f52750`

## Status

All eight Critical/Important final-review findings are implemented. Focused regression tests, generated-project Maven smokes, the full Node test suite, VSIX content validation, and packaged extension activation have passed during implementation. The final pre-commit verification gate is recorded in the Verification section after its last rerun.

## Findings and fixes

### 1. Missing Spring template modules in the VSIX

Root cause:

- `.vscodeignore` allowed `springBootNewService.js` but omitted its two runtime imports.
- `scripts/check-vsix.cjs` required the extension entry point but did not check those transitive modules.
- The old package check therefore passed a VSIX that failed immediately with `Cannot find module './springBootServiceTemplates'`.

Fix:

- Added `out/scenarios/springBootServiceTemplates.js` and `out/scenarios/springBootTestTemplates.js` to the VSIX allowlist.
- Made both files mandatory in `check-vsix.cjs`.
- Added `npm run smoke:package`. The new script extracts the VSIX, loads the manifest entry point, invokes `activate`, and checks every contributed command registration with a local VS Code API stub.
- Added package tests that remove each required module independently and verify rejection.

Evidence:

- The pre-fix real VSIX contained 20 files, passed `check:package`, and failed to load with the missing-module error.
- The fixed real VSIX contains both modules and activates all five commands.

### 2. REST responses were not Jackson-visible

Root cause:

- Generated aggregates exposed `id()` and `name()` only. Those methods are not JavaBean getters, so Jackson's default property discovery could treat the response as an empty bean.

Fix:

- Kept the domain-facing `id()` and `name()` methods.
- Added `getId()` and `getName()` for Jackson serialization.
- Added generated `<Aggregate>ControllerTest.java` output.
- Non-reactive services use `@WebMvcTest` and `MockMvc`.
- Reactive services use `@WebFluxTest` and `WebTestClient`.
- Both tests assert the concrete `$.id` and `$.name` JSON response fields.

Evidence:

- A generated non-reactive Maven project executes the MockMvc/Jackson test together with the Cucumber and unit tests.
- A separate generated reactive Maven project executes the WebTestClient/Jackson test.

### 3. Unsafe reruns could leave stale generated files

Root cause:

- A rerun processed files independently. Changing persistence could overwrite common files, create a new adapter and migration, and leave the old adapter in place.

Fix:

- Added a read-only preflight before directory creation and file writes.
- A non-empty target that contains `pom.xml`, `build.gradle.kts`, `settings.gradle.kts`, `src/main/resources/application.yml`, or `ARCHITECTURE_NOTES.md` is treated as an existing Spring Boot service.
- The scenario shows a clear error and writes nothing.
- Existing empty target directories still generate normally.

Evidence:

- The regression test generates JPA output, attempts a JDBC/Flyway rerun, and compares every first-run file byte-for-byte.
- It also verifies that the JDBC adapter is not created.
- A separate test pre-creates an empty folder and verifies successful Gradle generation.

### 4. Wrong reactive SQL Server URL

Root cause:

- SQL Server R2DBC YAML used the JDBC-oriented `sqlserver` scheme.

Fix:

- Changed the generated URL to `r2dbc:mssql://localhost:1433/appdb`.
- Added a regression assertion that also rejects `r2dbc:sqlserver:`.

### 5. Persistence `None` still exposed database behavior

Root cause:

- The wizard always asked for database and migration choices.
- Build and YAML renderers trusted `migrationTool` even when `persistenceLayer` was `None`.

Fix:

- The wizard skips both QuickPicks when persistence is `None` and stores internal `H2`/`None` defaults only to keep the answer type stable.
- Maven, Gradle, YAML, architecture notes, and migration rendering independently guard on persistence.
- Architecture notes show database and migration as `Not selected`.

Evidence:

- Table-driven tests use adversarial Oracle plus Flyway/Liquibase answers for Maven and Gradle in reactive and non-reactive modes.
- All four combinations emit no database driver, persistence starter, migration dependency, database YAML, or migration file.

### 6. Boot and Java compatibility was under-validated

Root cause:

- The Boot validator accepted every numeric semantic version, including unsupported major versions.
- Java validation had no relationship to the selected Boot version.
- Java 25 was the prompt default even after selecting Boot 2.

Fix:

- Accepted Boot major versions are 2 and 3.
- Unsupported 1.x and 4.x versions are rejected with a specific message.
- Java remains limited to whole-number versions 17 or newer.
- Boot 2 rejects Java versions above 21.
- The Java prompt defaults to 21 for Boot 2 and 25 for the current Boot 3 default.
- Existing Boot 2.7.18 `javax` generation and Boot 3.5.4 Jakarta generation remain covered.

### 7. TDD accepted arbitrary labels but always generated Cucumber

Root cause:

- The TDD tool used a free-form input box while the renderer had only Cucumber behavior.

Fix:

- Replaced free-form input with a QuickPick whose only value is `Cucumber`.
- Narrowed the TypeScript answer type to the same value.
- Added a wizard-level test that verifies the offered choices and generated architecture notes.

### 8. Oracle UUID migration and adapter mappings disagreed

Root cause:

- Oracle migrations declared `RAW(16)` while adapters bound or read Java UUID values without an explicit RAW conversion.

Fix:

- Oracle Flyway and Liquibase output now use `VARCHAR2(36)`.
- Oracle JPA and QueryDSL entities store identifiers as `String` and convert at the domain boundary.
- Oracle JDBC, R2DBC, and jOOQ adapters bind `UUID.toString()` and read with `UUID.fromString(...)`.
- PostgreSQL, H2, and SQL Server keep their native UUID mappings.

Evidence:

- Tests cover both Oracle migration formats and every Oracle-capable adapter: Hibernate/JPA, plain JDBC, jOOQ, QueryDSL/JPA, and Spring Data R2DBC.

## Test-driven development evidence

Each behavior change started with a focused failing test:

- Package tests failed because `smoke:package` did not exist and the checker accepted each missing template module.
- Serialization tests failed because getters and controller web tests were absent.
- Rerun tests showed changed POM/YAML/notes plus stale JPA and new JDBC adapters.
- Wizard/configuration tests failed on the free-form TDD input, unconditional database prompts, unsupported version acceptance, SQL Server scheme, and migration leakage for `None`.
- Oracle tests showed `RAW(16)` and native `UUID` adapter output.

The minimal implementation for each finding was followed by its focused green run before the next finding was changed.

## Verification

Baseline:

- `npm install`: up to date; 0 vulnerabilities.
- `npm test` at `55a8dc6`: 151 tests passed, 0 failed.

Implementation checkpoints:

- Package contract tests: 11 passed, 0 failed.
- MVC and WebFlux renderer serialization tests: 4 passed, 0 failed.
- Generated non-reactive Maven/Cucumber/MockMvc smoke: passed; the intentional Cucumber assertion failure still returned a non-zero Maven exit and a failed Surefire/Cucumber report.
- Generated reactive Maven/WebTestClient serialization smoke: 1 passed, 0 failed.
- Rerun safety tests: 3 passed, 0 failed.
- Prompt/version/None/SQL Server tests: 6 passed, 0 failed.
- Oracle migration and adapter tests: 3 passed, 0 failed.

Final pre-commit gate:

- `npm test`: 161 tests passed, 0 failed, 0 skipped. This includes both generated Maven web serialization smokes and the intentional Cucumber failure-propagation check.
- `npm run package`: passed. VSCE produced `skaffolding-vsplugin.vsix` with 22 files at 46.58 KB. The listing contains both Spring template modules.
- `npm run check:package`: passed with `VSIX package check passed: skaffolding-vsplugin.vsix`.
- `npm run smoke:package`: passed with `Packaged extension runtime smoke passed: skaffolding-vsplugin.vsix (5 commands registered)`.
- `git diff --check`: passed with no whitespace errors before staging.

## Files changed

- Packaging: `.vscodeignore`, `package.json`, `scripts/check-vsix.cjs`, `scripts/smoke-vsix-runtime.cjs`.
- Generator behavior: `src/scenarios/springBootNewService.ts`.
- Java output: `src/scenarios/springBootServiceTemplates.ts`, `src/scenarios/springBootTestTemplates.ts`.
- Regression coverage: `test/packageManifest.test.cjs`, `test/generatorWriteSafety.test.cjs`, `test/springBootTemplates.test.cjs`.
- Documentation: `README.md` and the final-fixes implementation plan.

## Residual concerns

- Boot support intentionally validates the requested major-version boundary and Boot 2 Java cap. It does not encode a separate Java maximum for every Boot 3 minor release.
- Oracle output is tested at the generated source and migration contract. No live Oracle or Oracle R2DBC server was available for an end-to-end database test.
- The packaged runtime smoke loads and activates the real extracted extension with a local VS Code API stub. It does not launch the full VS Code Extension Host UI.
- `@MockBean` supports the accepted Boot 2/3 range but is deprecated in recent Boot 3 releases. Boot 4 is rejected, so removal in Boot 4 does not affect the supported output.

No other known Critical or Important issue remains after the final diff review.

# Spring Boot Service Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Spring Boot scenario so it generates version-aware, reactive/non-reactive Clean Architecture services with runnable Cucumber, unit-test, REST, and persistence examples.

**Architecture:** Keep prompt collection and safe file writing in `springBootNewService.ts`, but move rendering decisions into focused template modules. A normalized `SpringServiceAnswers` object will carry the selected Boot version, aggregate name, execution model, and persistence mode to build renderers and generated-file renderers. Reactive mode will expose only R2DBC-compatible persistence choices and use reactive ports, adapters, controllers, and tests.

**Tech Stack:** TypeScript, VS Code extension API, Maven XML, Gradle Kotlin DSL, Spring Boot, JUnit 5, Cucumber, JPA/QueryDSL, JDBC, jOOQ, R2DBC, Node `node:test` renderer tests.

## Global Constraints

- Spring Boot version is a free-form semantic version such as `2.7.18` or `3.5.4`.
- Aggregate/domain object name defaults from the service name and remains editable; it must be a valid Java type name.
- Non-Reactive persistence supports Hibernate/JPA, Plain JDBC, jOOQ, and QueryDSL JPA.
- Reactive persistence supports Spring Data R2DBC and jOOQ with R2DBC; blocking options are not offered in Reactive mode.
- Spring Boot 2.x JPA output uses `javax.persistence.*`; Spring Boot 3.x output uses `jakarta.persistence.*`.
- Generated domain code remains independent of Spring and persistence APIs.
- Maven and Gradle output must include dependencies and test/build configuration required by the selected options.
- TDD/Cucumber output includes dependencies, JUnit Platform wiring, a feature, step definitions, a runner, and a conventional unit test.
- All generated files continue to use the existing workspace-safe, explicit-overwrite writer.

---

### Task 1: Add validated version, aggregate, and reactive persistence choices

**Files:**
- Modify: `src/scenarios/springBootNewService.ts` prompt types, `askQuestions`, and validation helpers
- Test: `test/springBootTemplates.test.cjs`

**Interfaces:**
- Produces `validateSpringBootVersion(value: string): string | undefined`.
- Produces `validateAggregateName(value: string): string | undefined`.
- Extends `SpringServiceAnswers` with `springBootVersion`, `aggregateName`, and the selected persistence type `Spring Data R2DBC`.
- Produces `persistenceOptions(stackMode: StackMode): PersistenceLayer[]`, returning blocking options for `Non-Reactive` and only `Spring Data R2DBC`/`jOOQ` for `Reactive`.

- [ ] **Step 1: Write failing validation and option tests**

Add tests for accepted versions `2.7.18` and `3.5.4`, rejected values `3.5`, `v3.5.4`, and `3.5.4.RELEASE`; accepted aggregate names `Order` and `OrderItem`; rejected names beginning with a digit or containing a hyphen; and reactive options excluding Hibernate, JDBC, and QueryDSL.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- --test-name-pattern="version|aggregate|reactive persistence"`

Expected: FAIL because the validators and reactive option helper do not yet exist.

- [ ] **Step 3: Implement the prompt and validation changes**

Prompt order should place Spring Boot version near the stack selection and aggregate name after the service name. Use the current `SPRING_BOOT_VERSION` as the version default. Replace the unconditional persistence Quick Pick with `persistenceOptions(stackMode)`. Keep the existing default `Cucumber` behavior when TDD is enabled.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `npm test -- --test-name-pattern="version|aggregate|reactive persistence"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scenarios/springBootNewService.ts test/springBootTemplates.test.cjs
git commit -m "feat: add spring boot and aggregate prompts"
```

### Task 2: Make Maven and Gradle dependency rendering version- and mode-aware

**Files:**
- Modify: `src/scenarios/springBootNewService.ts` dependency renderers and build renderers
- Test: `test/springBootTemplates.test.cjs`

**Interfaces:**
- `renderPomXml(a: SpringServiceAnswers): string` and `renderGradle(a: SpringServiceAnswers): string` use `a.springBootVersion`.
- Produces `persistenceNamespace(version: string): 'javax' | 'jakarta'`.
- Produces mode-specific dependency blocks for `Spring Data R2DBC` and reactive jOOQ.

- [ ] **Step 1: Write failing renderer tests**

Assert a Maven POM and Gradle file use an input `2.7.18` rather than the global default. Assert non-reactive dependencies for each existing persistence option, reactive WebFlux plus R2DBC dependencies for `Spring Data R2DBC`, and reactive jOOQ/R2DBC dependencies for reactive jOOQ. Assert QueryDSL/JPA output selects `javax` coordinates/import mode for Boot 2.x and Jakarta coordinates for Boot 3.x.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --test-name-pattern="renders|dependencies|version"`

Expected: FAIL because the renderers currently use the hardcoded version and do not support reactive persistence.

- [ ] **Step 3: Implement minimal renderer changes**

Replace `SPRING_BOOT_VERSION` interpolation with `a.springBootVersion`. Add Spring Data R2DBC starter and database R2DBC driver coordinates. Add the reactive jOOQ/R2DBC dependencies and keep annotation processing only for QueryDSL JPA. Make JPA API/QueryDSL coordinates and imports derive from `persistenceNamespace(a.springBootVersion)`.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `npm test -- --test-name-pattern="renders|dependencies|version"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scenarios/springBootNewService.ts test/springBootTemplates.test.cjs
git commit -m "feat: render reactive and version-aware build files"
```

### Task 3: Add Clean Architecture and persistence file renderers

**Files:**
- Create: `src/scenarios/springBootServiceTemplates.ts`
- Modify: `src/scenarios/springBootNewService.ts` generated-file assembly
- Test: `test/springBootTemplates.test.cjs`

**Interfaces:**
- Create `renderGeneratedServiceFiles(a: SpringServiceAnswers, appPackage: string): Array<{ path: string; content: string }>`.
- Create renderers for domain aggregate, repository port, application service, REST controller, and one adapter selected by persistence.
- Create `persistencePackage(a): string` and `javaPersistenceImport(a): string` helpers.

- [ ] **Step 1: Write failing generated-file tests**

For an `Order` non-reactive service, assert generated paths and content for domain `Order`, `OrderRepository`, `OrderService`, `OrderController`, and one adapter for each Hibernate/JDBC/jOOQ/QueryDSL option. Assert the domain files contain no Spring/JPA imports. For Reactive, assert `Mono`/`Flux` signatures and R2DBC adapters. Assert Boot 2 JPA output uses `javax.persistence` and Boot 3 uses `jakarta.persistence`.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --test-name-pattern="domain|repository|controller|adapter|generated files"`

Expected: FAIL because the current generator emits only the application class, YAML, and notes.

- [ ] **Step 3: Implement focused template module**

Use package paths beneath `src/main/java/<basePackage>/domain`, `application`, `infrastructure`, and `web`. Generate a small aggregate with an identifier and name/value, an application operation, a repository port, and a REST create/get flow. Use `JdbcTemplate`, `DSLContext`, JPA/QueryDSL, or R2DBC APIs only inside infrastructure adapters. Use a Spring Data R2DBC repository or `DatabaseClient` for the reactive adapter.

- [ ] **Step 4: Add templates to the safe generated-file list**

Call `renderGeneratedServiceFiles` from `createSpringBootServiceScenario` and retain the existing output paths and overwrite accounting. Ensure every new parent directory is created through the existing safe writer flow.

- [ ] **Step 5: Run focused tests and verify they pass**

Run: `npm test -- --test-name-pattern="domain|repository|controller|adapter|generated files"`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scenarios/springBootServiceTemplates.ts src/scenarios/springBootNewService.ts test/springBootTemplates.test.cjs
git commit -m "feat: generate clean architecture persistence examples"
```

### Task 4: Add Cucumber and conventional unit-test generation

**Files:**
- Create: `src/scenarios/springBootTestTemplates.ts`
- Modify: `src/scenarios/springBootNewService.ts` generated-file assembly
- Test: `test/springBootTemplates.test.cjs`

**Interfaces:**
- Create `renderGeneratedTestFiles(a: SpringServiceAnswers, appPackage: string): Array<{ path: string; content: string }>`.
- Produce Cucumber feature, step definition, runner, and conventional unit-test files.
- Produce Maven/Gradle Cucumber dependencies and JUnit Platform configuration through the build renderers.

- [ ] **Step 1: Write failing TDD renderer tests**

For TDD-enabled Cucumber, assert the build files contain Cucumber Java, Cucumber JUnit Platform engine, and required JUnit Platform configuration. Assert generated paths include one `.feature`, step definitions, a suite/runner, and a unit test. Assert the feature text and step definitions use the selected aggregate name. Add reactive assertions for `Mono`/`Flux`-appropriate test setup.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --test-name-pattern="Cucumber|unit test|feature|step"`

Expected: FAIL because TDD currently changes only architecture notes.

- [ ] **Step 3: Implement test templates and build wiring**

Generate the feature under `src/test/resources/features`, Java steps and runner under the test package, and a conventional service unit test under the matching test package. Add Cucumber version properties/dependencies and JUnit Platform suite configuration for Maven and Gradle. Keep generated tests aligned with the selected stack mode.

- [ ] **Step 4: Add TDD files to the safe generated-file list**

Append `renderGeneratedTestFiles` output only when `a.useTdd` is true. Preserve the existing behavior when TDD is disabled.

- [ ] **Step 5: Run focused tests and verify they pass**

Run: `npm test -- --test-name-pattern="Cucumber|unit test|feature|step"`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scenarios/springBootTestTemplates.ts src/scenarios/springBootNewService.ts test/springBootTemplates.test.cjs
git commit -m "feat: generate cucumber and unit test examples"
```

### Task 5: Update documentation and run the full verification suite

**Files:**
- Modify: `README.md` Spring Boot scenario and limitations sections
- Modify: `test/springBootTemplates.test.cjs` any final regression cases

**Interfaces:**
- Documentation describes editable Boot versions, aggregate names, reactive persistence filtering, generated architecture, and TDD output.

- [ ] **Step 1: Add regression tests for notes and disabled branches**

Assert architecture notes include the selected Boot version and aggregate name. Assert TDD-disabled output contains no Cucumber files or dependencies. Assert Reactive mode cannot be rendered with a blocking persistence option through the prompt option helper.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Update README behavior documentation**

Replace the current statement that QueryDSL is the only generated persistence configuration with the actual generated architecture, TDD, version, and reactive capabilities. Keep the release limitations accurate.

- [ ] **Step 4: Build and inspect the VSIX**

Run: `npm run package`.

Expected: the extension compiles and produces `skaffolding-vsplugin.vsix`.

- [ ] **Step 5: Check package contents**

Run: `npm run check:package`.

Expected: PASS with the compiled extension and schema present and development-only files excluded.

- [ ] **Step 6: Commit documentation and final tests**

```bash
git add README.md test/springBootTemplates.test.cjs
git commit -m "docs: document generated spring boot examples"
```


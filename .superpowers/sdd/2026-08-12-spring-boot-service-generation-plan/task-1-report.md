# Task 1 Report: Add validated version, aggregate, and reactive persistence choices

## Files changed

- `src/scenarios/springBootNewService.ts`
  - Added Spring Boot version and aggregate name answers and prompts.
  - Added validation for three-part numeric Spring Boot versions and Java-style aggregate names.
  - Added `Spring Data R2DBC` to persistence types.
  - Added `persistenceOptions(stackMode)` with reactive and non-reactive choices.
  - Used the selected Spring Boot version in Maven and Gradle output, retaining the existing constant as the default/fallback.
  - Recorded the selected version and aggregate in architecture notes.
- `test/springBootTemplates.test.cjs`
  - Added focused tests for accepted/rejected versions, accepted/rejected aggregate names, and reactive persistence options.
- `.superpowers/sdd/2026-08-12-spring-boot-service-generation-plan/task-1-report.md`
  - Added this implementation report.

## Decisions

- Spring Boot versions must match `digits.digits.digits`, which accepts `2.7.18` and `3.5.4` while rejecting prefixes, missing components, and suffixes.
- Aggregate names must start with an uppercase letter and contain only ASCII letters and digits.
- Reactive persistence offers `None`, `Spring Data R2DBC`, and `jOOQ`; non-reactive persistence retains the existing blocking choices.
- The existing `Cucumber` default remains unchanged when TDD is enabled.
- Existing write-safety tests were not modified because Task 1 scope names only the scenario source and Spring Boot template test file.

## Tests run

### Red phase

Command:

```text
npm test -- --test-name-pattern="version|aggregate|reactive persistence"
```

Result: failed as expected before implementation. The five new tests failed because `validateSpringBootVersion`, `validateAggregateName`, and `persistenceOptions` were not yet exported.

### Focused verification

```text
npm run compile
```

Result: exit 0.

```text
node --test --test-name-pattern='version|aggregate|reactive persistence' test/springBootTemplates.test.cjs
```

Result: exit 0; 8 passed, 0 failed.

```text
git diff --check
```

Result: exit 0.

### Full suite

```text
npm test
```

Result: exit 1; 3 existing Spring Boot write-safety tests fail because their mocked prompt sequences do not include the new version and aggregate prompts. The failures are:

- `Spring Boot service creation stops when an overwrite picker is dismissed`
- `Spring Boot service creation reports a mixed write sequence`
- `Spring Boot service creation stops later writes after an earlier file is created`

The focused Task 1 tests and TypeScript compilation pass.

## Concerns

The three pre-existing integration tests in `test/generatorWriteSafety.test.cjs` need their mocked input/Quick Pick sequences updated for the two new prompts before the full suite can pass. Updating that file is outside the Task 1 file list.

## Fix Round 1

### Findings addressed

- Aggregate name now defaults dynamically from the selected service name: `order-service` becomes `Order`, and `billing-api` becomes `BillingApi`.
- Reactive `Spring Data R2DBC` now renders the R2DBC starter and database-specific R2DBC runtime driver.
- Reactive `jOOQ` retains the jOOQ starter and also renders the R2DBC starter and R2DBC runtime driver. Non-reactive choices continue using blocking starters and JDBC drivers.
- Spring Boot generator write-safety fixtures now provide the added version and aggregate prompt inputs.

### Covering tests and commands

```text
npm run compile
```

Result: exit 0.

```text
node --test --test-name-pattern='aggregate prompt|R2DBC|reactive jOOQ' test/springBootTemplates.test.cjs
```

Result: exit 0; 3 passed, 0 failed.

```text
node --test --test-name-pattern='Spring Boot service creation' test/generatorWriteSafety.test.cjs
```

Result: exit 0; 3 passed, 0 failed.

```text
npm test
```

Result: exit 0; 125 passed, 0 failed.

### Fix implementation commit

`7670e799d74e4e34a34e49ec3706c3d29a675b22`

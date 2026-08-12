# Task 4 Report: Cucumber and Conventional Unit-Test Generation

## Status and implementation commit

Task 4 is complete. The implementation commit is `548e602` (`feat: generate cucumber and unit test examples`).

## Files changed

- `src/scenarios/springBootTestTemplates.ts`
  - Added the public `renderGeneratedTestFiles(a, appPackage)` renderer.
  - Generates a Cucumber feature, step definitions, JUnit Platform Cucumber suite, and an aggregate service unit test.
  - Renders blocking or reactive repository fakes and test setup matching the selected stack mode.
- `src/scenarios/springBootNewService.ts`
  - Adds Cucumber Java, Cucumber JUnit Platform engine, and JUnit Platform suite dependencies only when TDD is enabled.
  - Adds a Maven `cucumber.version` property and an equivalent Gradle `cucumberVersion` value.
  - Appends generated test files only for `useTdd`, through the existing safe writer loop.
- `test/springBootTemplates.test.cjs`
  - Adds TDD renderer coverage for Maven/Gradle wiring, aggregate-specific Cucumber artifacts, and reactive `Mono`/`Flux` contracts.

## Decisions

- Cucumber uses the JUnit Platform suite runner (`@Suite`, `@IncludeEngines("cucumber")`, classpath feature selection, and root-package glue) so Maven and Gradle share a conventional runner model.
- Step definitions and service unit tests use small in-test repository implementations rather than persistence adapters or mocks. This keeps the examples executable for every selected persistence layer while exercising the generated service contract.
- Reactive variants use `Mono`/`Flux` repository methods and resolve the created value at the assertion boundary; non-reactive variants use the blocking domain repository contract.
- TDD-disabled generation retains the existing file list and build output because both the extra dependencies and rendered test files are conditional on `useTdd`.

## TDD and verification output

1. Baseline: `npm test`
   - TypeScript compilation passed.
   - 145 passed, 0 failed.
2. RED: `npm test -- --test-name-pattern="Cucumber|unit test|feature|step"`
   - TypeScript compilation passed.
   - 145 passed, 3 failed.
   - The build assertion failed because the Cucumber property/dependencies were absent; the two file assertions failed because `renderGeneratedTestFiles` did not exist.
3. GREEN: same focused command after implementation.
   - TypeScript compilation passed.
   - 148 passed, 0 failed.
4. Full verification: `npm test`
   - TypeScript compilation passed.
   - 148 passed, 0 failed.
5. Whitespace checks: `git diff --check` and `git diff --cached --check`
   - No whitespace errors.
6. Generated Maven projects: `mvn -q test`
   - Spring Boot 3.5.4 non-reactive: passed.
   - Spring Boot 3.5.4 reactive: passed.
   - Spring Boot 2.7.18 non-reactive: passed.
   - Each project used TDD-enabled generated sources and ran both the generated Cucumber suite and service unit test.

## Concerns

- Gradle wiring is renderer-tested but was not executed with a local Gradle build; Maven execution covers the generated Cucumber/JUnit source and dependency model across reactive, non-reactive, Boot 2, and Boot 3 variants.
- Generated tests deliberately verify service behavior with local repository fakes. They do not exercise the selected persistence adapter or a live database; those remain integration-test concerns.

---

## Fix round 2: Maven Surefire reports zero Cucumber scenarios

### Status and implementation commit

Fix round 2 is implemented in `bfefb02` (`fix: report generated cucumber scenarios in Maven`).

### Root cause

The generated feature, glue, and JUnit Platform suite were valid. Spring Boot
3.5.4 manages Maven Surefire 3.5.3, which has a regression for nested Cucumber
JUnit Platform tests: scenarios can execute while the report says `Tests run:
0`; a failed scenario can consequently leave the Maven build successful. This
matches [apache/maven-surefire#834](https://github.com/apache/maven-surefire/issues/834)
and [SUREFIRE-2299](https://issues.apache.org/jira/browse/SUREFIRE-2299).

Aligning Cucumber 7.20.1 with its JUnit 5.11.2 / Platform 1.11.2 baseline did
not change discovery. Overriding only Surefire from 3.5.3 to 3.5.4 changed the
same generated project from `CucumberTest: Tests run: 0` to `Tests run: 1` and
restored failure propagation. Cucumber's maintained JUnit Platform guidance
also [documents Surefire 3.5.4](https://github.com/cucumber/cucumber-jvm/blob/main/cucumber-junit-platform-engine/README.md#maven-and-gradle-workarounds)
for this runner/reporting path.

### Fix

- TDD-enabled Maven POMs now explicitly use `maven-surefire-plugin` 3.5.4 and
  `cucumber.junit-platform.naming-strategy=long`.
- The override is conditional on `useTdd`; non-TDD Maven output has no
  Surefire override.
- Gradle rendering and the shared JUnit Platform Cucumber runner are unchanged.
- The regression test generates a real Maven project in a temporary directory,
  runs `mvn test`, requires the Surefire XML to report one scenario, and
  requires Cucumber JSON to contain one scenario with exactly three passed
  steps. It therefore fails on zero discovery/reporting rather than checking
  source strings.

### Commands and observed output

1. Starting state:

   ```text
   git rev-parse HEAD
   548e6022257908791828e9446db20bed8fb5fba3

   git status --short
   # no output
   ```

2. Baseline extension tests:

   ```text
   npm test
   tests 148
   pass 148
   fail 0
   ```

3. Reproduction from actual renderer output:

   ```text
   mvn -f /var/folders/ll/cm4lx9v106d5lzztr9d_xvxr0000gn/T/skaffolding-task4-repro.N95OvG/pom.xml test

   --- surefire:3.5.3:test (default-test) @ order-service ---
   Running com.example.orders.OrderServiceTest
   Tests run: 1, Failures: 0, Errors: 0, Skipped: 0
   Running com.example.orders.CucumberTest
   Tests run: 0, Failures: 0, Errors: 0, Skipped: 0
   Results: Tests run: 1, Failures: 0, Errors: 0, Skipped: 0
   BUILD SUCCESS
   ```

   With a temporary failing step and Cucumber JSON enabled, Surefire 3.5.3
   still returned success while the JSON recorded the failure:

   ```text
   mvn -f /var/folders/ll/cm4lx9v106d5lzztr9d_xvxr0000gn/T/skaffolding-task4-repro.N95OvG/pom.xml -Dcucumber.plugin=json:target/cucumber.json clean test
   BUILD SUCCESS
   cucumber.json statuses: passed, passed, passed, failed
   exit 0
   ```

4. Rejected JUnit-version hypothesis:

   ```text
   mvn -f /var/folders/ll/cm4lx9v106d5lzztr9d_xvxr0000gn/T/skaffolding-task4-repro.N95OvG/pom.xml -Djunit-jupiter.version=5.11.2 clean test

   --- surefire:3.5.3:test (default-test) @ order-service ---
   Running com.example.orders.CucumberTest
   Tests run: 0, Failures: 0, Errors: 0, Skipped: 0
   Results: Tests run: 1, Failures: 0, Errors: 0, Skipped: 0
   BUILD SUCCESS
   ```

5. Minimal Surefire-version hypothesis:

   ```text
   mvn -f /var/folders/ll/cm4lx9v106d5lzztr9d_xvxr0000gn/T/skaffolding-task4-repro.N95OvG/pom.xml -Dmaven-surefire-plugin.version=3.5.4 clean test

   --- surefire:3.5.4:test (default-test) @ order-service ---
   Running com.example.orders.CucumberTest
   Tests run: 1, Failures: 0, Errors: 0, Skipped: 0
   Results: Tests run: 2, Failures: 0, Errors: 0, Skipped: 0
   BUILD SUCCESS
   ```

6. TDD red, before production changes:

   ```text
   npm test -- --test-name-pattern="Maven executes the generated Cucumber"
   tests 149
   pass 148
   fail 1

   AssertionError [ERR_ASSERTION]: input did not match
   /<testsuite[^>]*\btests="1"/
   CucumberTest report contained tests="0"
   ```

7. TDD green, after the conditional Surefire override:

   ```text
   npm test -- --test-name-pattern="Maven executes the generated Cucumber"
   tests 149
   pass 149
   fail 0
   ```

8. Generated Maven matrix. The projects were generated with
   `renderPomXml`, `renderGeneratedServiceFiles`, and
   `renderGeneratedTestFiles`; each variant ran:

   ```text
   mvn -q -f "$TASK4_VARIANT_ROOT/$TASK4_VARIANT/pom.xml" clean test -Dcucumber.plugin=json:target/cucumber.json

   boot3-blocking: BUILD SUCCESS; surefire scenarios=1; cucumber scenarios=1; steps=3; statuses=passed
   boot3-reactive: BUILD SUCCESS; surefire scenarios=1; cucumber scenarios=1; steps=3; statuses=passed
   boot2-blocking: BUILD SUCCESS; surefire scenarios=1; cucumber scenarios=1; steps=3; statuses=passed
   boot2-reactive: BUILD SUCCESS; surefire scenarios=1; cucumber scenarios=1; steps=3; statuses=passed
   ```

9. Failure propagation check. A temporary generated step was changed to throw
   `AssertionError("failure propagation smoke test")`; no repository source was
   changed for this check:

   ```text
   mvn -q -f "$TASK4_VARIANT_ROOT/boot3-blocking/pom.xml" clean test
   maven_exit=1
   Tests run: 1, Failures: 1, Errors: 0, Skipped: 0 -- in com.example.orders.CucumberTest
   Tests run: 2, Failures: 1, Errors: 0, Skipped: 0
   ```

10. Generated Gradle preservation check with Gradle 9.6.1. Gradle names the
    Cucumber XML report after the feature rather than `CucumberTest`:

    ```text
    gradle --no-daemon -q -p "$TASK4_GRADLE_ROOT/$TASK4_GRADLE_VARIANT" clean test

    boot3-blocking: BUILD SUCCESS; Gradle Cucumber scenarios=1; failures=0
    boot3-reactive: BUILD SUCCESS; Gradle Cucumber scenarios=1; failures=0
    ```

11. Focused and full extension verification:

    ```text
    npm test -- --test-name-pattern="Cucumber|unit test|feature|step"
    tests 149
    pass 149
    fail 0

    npm test
    tests 149
    pass 149
    fail 0
    duration_ms 3096.283666

    git diff --check
    # no output; exit 0

    git diff --cached --check
    # no output; exit 0
    ```

### Review findings and concerns

- No reviewer subagent surface was available. Direct requirement and diff
  review found no critical or important issues; the production change is
  Maven-only, conditional on TDD, and all four Maven execution variants passed.
- Surefire 3.5.4 is intentionally pinned for generated TDD Maven projects. The
  pin should be revisited when the generator upgrades Cucumber/JUnit or adds
  explicit support for future Spring Boot major versions.
- The execution-level Node test skips only when the `mvn` executable is absent.
  When Maven is present it requires a compatible JDK and Maven dependencies
  from the local cache or Maven Central; it added about three seconds locally.
- Boot 3 Gradle blocking/reactive projects were executed. Boot 2 Gradle was not
  run against the locally installed Gradle 9.6.1; Boot 2 blocking/reactive are
  covered by the Maven matrix, and the Gradle renderer output was not changed.
- Cucumber remains at 7.20.1; upgrading it was not needed to fix this regression
  and is outside this fix round.

---

## Fix round 3: prove Maven propagates a generated scenario failure

### Status and implementation commit

Fix round 3 is implemented in `853c259` (`test: verify Maven propagates
Cucumber failures`). No production generator or template source changed.

### Regression-test change

- The execution-level Maven smoke test still generates a complete TDD-enabled
  project and verifies successful discovery through one Surefire scenario and
  one Cucumber scenario with three passed steps.
- Before that successful run, the test replaces the generated `Then` assertion
  with `AssertionError("Intentional Cucumber smoke-test failure")`, runs
  `mvn -q clean test`, and requires a non-zero process exit.
- The failing run must also produce a Surefire report with one test and one
  failure, containing the intentional marker, plus Cucumber JSON with exactly
  one three-step scenario whose statuses are `passed`, `passed`, `failed`.
  This distinguishes scenario failure propagation from an unrelated Maven
  startup, compilation, or dependency failure.
- All generated files live under a unique `fs.mkdtempSync` directory. A
  `t.after` hook recursively removes it, and a `finally` block restores the
  generated step fixture before the passing discovery run.
- The test skips only for Maven `ENOENT`. An installed but unusable Maven, a
  timeout, zero scenario discovery, or an unexpected successful failing run
  fails the test.

### Commands and observed output

1. Starting state:

   ```text
   git rev-parse HEAD
   e1caa7d69c891604f792f9d92e99fbfa9f35638c

   git status --short
   # no output
   ```

2. Focused execution smoke on the final test:

   ```text
   npm run compile && node --test --test-name-pattern="Maven executes and reports generated Cucumber" test/springBootTemplates.test.cjs

   ✔ Maven executes and reports generated Cucumber success and failure (5509.915042ms)
   ℹ intentional failing Maven exit: 1
   ℹ tests 1
   ℹ pass 1
   ℹ fail 0
   ℹ skipped 0
   ℹ duration_ms 5557.281958
   # exit 0
   ```

3. Discovery/failure-propagation mutation check. The production Surefire pin
   was temporarily changed from 3.5.4 back to affected version 3.5.3, then the
   same focused command was run. Maven incorrectly returned zero for the
   deliberately failing scenario, and the new assertion caught it:

   ```text
   ✖ Maven executes and reports generated Cucumber success and failure
   AssertionError [ERR_ASSERTION]: Maven must fail when a generated Cucumber step fails
   actual: 0
   expected: 0
   operator: 'notStrictEqual'
   tests 1
   pass 0
   fail 1
   # exit 1
   ```

   The 3.5.4 value was restored immediately. A subsequent focused run passed,
   and `git diff -- src/scenarios/springBootNewService.ts` produced no output.

4. Full extension suite:

   ```text
   npm test

   ✔ Cucumber Maven and Gradle builds include the JUnit Platform engine and suite configuration
   ✔ reactive Cucumber steps and unit test use Mono and Flux repository contracts
   ✔ Maven executes and reports generated Cucumber success and failure (5177.139041ms)
   ℹ intentional failing Maven exit: 1
   ℹ tests 149
   ℹ pass 149
   ℹ fail 0
   ℹ skipped 0
   ℹ duration_ms 5334.332583
   # exit 0
   ```

5. Production-renderer preservation and whitespace checks before the report
   edit:

   ```text
   git diff --name-only
   test/springBootTemplates.test.cjs

   git diff -- src/scenarios/springBootNewService.ts src/scenarios/springBootTestTemplates.ts
   # no output

   git diff --check
   # no output; exit 0
   ```

   Therefore TDD-off generation and Gradle rendering are unchanged in this
   round. Their existing renderer tests, including Gradle JUnit Platform wiring
   and reactive/non-reactive template contracts, passed in the 149-test suite.

### Review findings and concerns

- Direct requirements and diff review found no critical or important issue.
  No reviewer subagent surface was available in this workspace.
- With Maven installed, the default npm suite now performs two generated Maven
  builds (`clean test` for the deliberate failure, then `clean test` after
  restoration). Locally the complete smoke took about 5.2 seconds. It still
  depends on a compatible JDK and on dependencies being cached or reachable.
- Gradle projects were not re-executed in this round because neither production
  renderer nor template changed; Gradle wiring and reactive/non-reactive
  behavior remain covered by unchanged renderer tests and the round-2
  execution evidence above.

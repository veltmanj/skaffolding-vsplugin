# Task 3 Report: Clean Architecture and Persistence File Renderers

## Status

Completed Task 3 only. The implementation commit is `51b48c3498ed4bd144f6509bcf4a987ee8b8a4cb` (`feat: generate clean architecture persistence examples`).

## Files changed

- `src/scenarios/springBootServiceTemplates.ts`
  - Added `renderGeneratedServiceFiles(a, appPackage)` and the generated-file contract.
  - Added domain aggregate, repository port, application service, and REST controller renderers.
  - Added persistence adapters for Hibernate/JPA, Plain JDBC, blocking jOOQ, QueryDSL JPA, Spring Data R2DBC, and reactive jOOQ.
  - Added `persistencePackage(a)` and `javaPersistenceImport(a)`.
  - Added reactive/non-reactive signatures through the repository, application, controller, and adapter layers.
  - Added database-aware SQL dialect selection for reactive jOOQ.
- `src/scenarios/springBootNewService.ts`
  - Exported `SpringServiceAnswers` for the focused template module contract.
  - Re-exported the Task 3 public renderer helpers.
  - Appended rendered service files to the existing generated-file list.
  - Preserved the existing per-file safe parent-directory creation, explicit overwrite choice, cancellation behavior, and created/overwritten/skipped accounting.
- `test/springBootTemplates.test.cjs`
  - Added generated path and content assertions for domain, repository, application, controller, all blocking adapters, R2DBC, and reactive jOOQ.
  - Added persistence-isolation assertions for domain files.
  - Added reactive `Mono`/`Flux` contract assertions.
  - Added explicit R2DBC `ConnectionFactory` to `DSLContext` wiring assertions.
  - Added Boot 2 `javax.persistence` and Boot 3 `jakarta.persistence` adapter assertions.
- `test/generatorWriteSafety.test.cjs`
  - Updated the existing mixed-write accounting expectation for the four additional architecture files generated when persistence is `None`.

## Decisions

- Domain aggregates remain plain Java objects with `UUID id` and validated `String name`. Domain files import neither Spring nor JPA. The reactive repository port imports Reactor types because the approved design requires one reactive contract through all layers.
- Infrastructure is selected exactly once by persistence mode:
  - `jpa`: package-local JPA entity plus Spring Data `JpaRepository` delegate.
  - `jdbc`: `JdbcTemplate` SQL adapter.
  - `jooq`: blocking `DSLContext` adapter or reactive publisher adapter according to stack mode.
  - `querydsl`: JPA entity, generated Q type usage, `JPAQueryFactory`, and `EntityManager`.
  - `r2dbc`: `DatabaseClient` adapter.
  - `None`: no infrastructure adapter is emitted.
- JPA and QueryDSL imports derive from the selected Spring Boot version: Boot 2.x uses `javax.persistence`; Boot 3.x uses `jakarta.persistence`.
- Reactive jOOQ does not rely on JDBC jOOQ auto-configuration. Its generated configuration creates `DefaultConfiguration`, sets the R2DBC `ConnectionFactory`, sets the database-specific `SQLDialect`, and returns `DSL.using(configuration)` as a `DSLContext` bean. Queries are adapted with Reactor `Mono.from`/`Flux.from`.
- Generated service files are appended after the original build, application, YAML, and notes files. This preserves original output paths and keeps every write in the existing safe writer loop.
- The generated examples use the simple plural table convention `<lowerCamelAggregate>s`; schema/migration file generation is outside Task 3.

## TDD and verification output

1. Baseline: `npm test`
   - TypeScript compilation passed.
   - 131 passed, 0 failed.
2. RED: `npm test -- --test-name-pattern="domain|repository|controller|adapter|generated files"`
   - TypeScript compilation passed.
   - 131 passed, 5 failed.
   - All five new tests failed with `renderGeneratedServiceFiles is not a function`, confirming the missing Task 3 behavior.
3. Initial GREEN attempt: same focused command.
   - All five new renderer tests passed.
   - One existing safe-writer test failed because the correct created-file count increased from 2 to 6.
4. Focused GREEN after updating the accounting assertion: same focused command.
   - TypeScript compilation passed.
   - 136 passed, 0 failed.
5. Generated Java compile matrix: rendered temporary Maven projects and ran `mvn -q -DskipTests compile` for each.
   - Passed: Boot 2 JPA.
   - Passed: Boot 2 QueryDSL JPA.
   - Passed: Boot 3 JPA.
   - Passed: Boot 3 QueryDSL JPA.
   - Passed: Boot 3 Plain JDBC.
   - Passed: Boot 3 blocking jOOQ.
   - Passed: Boot 3 Spring Data R2DBC.
   - Passed: Boot 3 reactive jOOQ.
6. Full verification: `npm test`
   - TypeScript compilation passed.
   - 136 passed, 0 failed.
7. `git diff --check` and `git diff --cached --check`
   - No whitespace errors.

The repository's `npm test` script places the test-name option after the test glob, so the requested focused command executes all tests while applying the name pattern in Node's argument position used by the existing plan. The recorded pass/fail totals reflect the actual command output.

## Concerns and follow-up boundaries

- Task 3 emits compile-shaped persistence examples but does not emit database migration/schema files. Persistence adapters expect a table named from the aggregate using the simple plural convention and columns `id` and `name`; migration generation remains a later concern.
- Selecting persistence `None` intentionally emits the architecture layers without an infrastructure implementation. The Java output compiles, but an application that starts the Spring context must supply an `OrderRepository`-style bean before the application service can be constructed.
- The Maven compile matrix verifies generated Java and annotation processing for representative Boot 2/3 combinations. It does not run live database integration tests or an equivalent Gradle compile matrix.

---

# Task 3 Review Fix Round 1

## Status and commit

All four review findings are fixed in implementation commit `fa2218a` (`fix: complete generated persistence wiring`).

## Files changed

- `src/scenarios/springBootServiceTemplates.ts`
  - Generates blocking and reactive in-memory repository adapters for persistence `None`, registered with `@Repository` while keeping the domain package framework-free.
  - Rejects reactive jOOQ with Oracle or SQL Server and only renders OSS-supported PostgreSQL/H2 dialects.
  - Uses portable jOOQ update-then-insert examples and unquoted dynamic identifiers so the generated H2 examples execute against the generated schema.
  - Generates database-specific Flyway SQL or a Liquibase master changelog for the selected aggregate; persistence `None` emits no schema.
- `src/scenarios/springBootNewService.ts`
  - Restricts the interactive reactive-jOOQ database choices to PostgreSQL and H2.
  - Pins reactive jOOQ to `3.17.35` for Spring Boot 2 while retaining Boot-managed jOOQ on Spring Boot 3.
  - Adds `spring-jdbc` and the JDBC driver when reactive services use Flyway/Liquibase, allowing migration auto-configuration alongside R2DBC.
  - Adds Spring Boot 3 Flyway database modules for PostgreSQL, SQL Server, and Oracle; H2 and Spring Boot 2 continue using `flyway-core` alone.
- `test/springBootTemplates.test.cjs`
  - Covers blocking/reactive in-memory wiring, jOOQ save semantics, unsupported reactive-jOOQ databases, database-specific Flyway/Liquibase schemas, absence of schema for persistence `None`, the Boot 2 jOOQ pin, reactive migration JDBC support, and Flyway database modules.
- `test/generatorWriteSafety.test.cjs`
  - Updates safe-writer accounting for the additional in-memory adapter.

## Decisions

- Persistence `None` means no external persistence technology, not a missing repository implementation. A concurrent in-memory infrastructure adapter now satisfies the repository port and makes the generated Spring context runnable without leaking Spring or persistence APIs into the domain.
- Reactive jOOQ remains explicitly configured from the R2DBC `ConnectionFactory`. Spring Boot 2.7.18 manages jOOQ 3.14.x, which predates that R2DBC configuration API, so only that branch receives an explicit OSS jOOQ `3.17.35` version.
- The OSS jOOQ artifact does not expose commercial Oracle/SQL Server dialect constants. Those choices are removed from the reactive-jOOQ prompt and programmatic rendering rejects invalid combinations rather than silently emitting uncompilable Java.
- Migrations use the existing aggregate/table convention and database-native UUID/string types: UUID/VARCHAR for PostgreSQL and H2, UNIQUEIDENTIFIER/VARCHAR for SQL Server, and RAW(16)/VARCHAR2 for Oracle.
- Flyway 10+ separates several database implementations from `flyway-core`; Spring Boot 3 output includes the selected module. Spring Boot 2 output does not add these newer modular artifacts.

## Reproduction and TDD evidence

Initial generated-project review checks reproduced every finding:

- Boot 2.7.18 reactive jOOQ compilation failed because managed jOOQ 3.14.16 has no `DefaultConfiguration.set(ConnectionFactory)` overload.
- Boot 3 reactive jOOQ compilation failed for Oracle and SQL Server because the OSS artifact has no `SQLDialect.ORACLE` or `SQLDialect.SQLSERVER` constants.
- A Boot 3 persistence-`None` context test failed because no repository bean satisfied the application service constructor.
- Flyway rendering returned no files under `src/main/resources/db`.

The added tests were run before implementation and produced 6 failures across the new review cases (137 passed, 6 failed). The persistence-`None` no-schema assertion already passed.

Focused final command:

`npm run compile && node --test --test-name-pattern="in-memory|reactive jOOQ|reactive-capable|database-specific|database schema|Flyway|Liquibase|selected database module|generated key metadata|update then insert" test/springBootTemplates.test.cjs test/generatorWriteSafety.test.cjs`

Output: TypeScript compilation passed; 15 passed, 0 failed.

## Generated Maven verification

Generated projects were rendered to temporary directories and compiled/tested with Maven:

- Boot 3 non-reactive persistence `None`: context/REST wiring passed.
- Boot 3 reactive persistence `None`: context/REST wiring passed.
- Boot 3 Plain JDBC + H2 + Flyway: generated project passed.
- Boot 3 JPA + H2 + Liquibase: generated project passed.
- Boot 3 reactive jOOQ + H2 + Flyway: generated project passed.
- Boot 2.7.18 reactive jOOQ + H2 + Flyway: generated project passed with jOOQ 3.17.35 and reactive migration JDBC support.
- Boot 2.7.18 reactive jOOQ + H2 + Liquibase: generated project passed.
- Boot 3.5.4 Flyway Maven output for PostgreSQL, SQL Server, and Oracle: `mvn -q -DskipTests compile` passed for all three database-module variants.

## Full verification output

`npm test`

- TypeScript compilation passed.
- 145 passed, 0 failed, 0 skipped.

`git diff --check` and `git diff --cached --check`

- No whitespace errors.

## Concerns

- Generated database checks use H2 for executable persistence tests; PostgreSQL, Oracle, and SQL Server migrations are compile/dependency-checked but were not run against live servers.
- The in-memory adapter is intentionally process-local and non-durable. It provides coherent runnable wiring for the explicit `None` selection without changing the domain contract.

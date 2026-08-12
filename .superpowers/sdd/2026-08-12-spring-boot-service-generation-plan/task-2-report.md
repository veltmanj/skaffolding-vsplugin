# Task 2 Report: Version- and Mode-Aware Build Rendering

## Status

Completed Task 2 only. The implementation commit is `f3bbe164856ccb0ad649f3e5592c288c0abd204a` (`feat: render reactive and version-aware build files`).

## Files changed

- `src/scenarios/springBootNewService.ts`
  - Maven and Gradle now render the required selected `springBootVersion` directly.
  - Added `persistenceNamespace(version)`, selecting `javax` for Boot 2.x and `jakarta` otherwise.
  - QueryDSL/JPA coordinates now select the matching JPA namespace:
    - Boot 2.x: default `querydsl-jpa`, `querydsl-apt` `jpa` classifier, and `javax.persistence-api:2.2`.
    - Boot 3.x: Jakarta classifier and `jakarta.persistence-api:3.1.0`.
  - Reactive Spring Data R2DBC keeps the WebFlux, R2DBC starter, and R2DBC driver path.
  - Reactive jOOQ now uses direct `org.jooq:jooq` with Spring Data R2DBC and the R2DBC driver; it deliberately excludes `spring-boot-starter-jooq`.
  - Non-reactive jOOQ continues to use `spring-boot-starter-jooq`.
- `test/springBootTemplates.test.cjs`
  - Added input-version, Boot 2 QueryDSL/JPA namespace, all non-reactive persistence mode, and reactive jOOQ adapter-prerequisite assertions.
  - Completed answer fixtures with the required Task 1 `springBootVersion` and `aggregateName` fields.

## Decisions

- `persistenceNamespace` treats versions beginning with `2.` as `javax`; Boot 3+ uses `jakarta`, matching the plan's explicit Boot 2/Boot 3 compatibility requirement.
- QueryDSL's legacy JPA artifact uses its normal (unclassified) API coordinate and the `jpa` APT classifier. Jakarta uses the QueryDSL `jakarta` classifier. This follows QueryDSL's published classifier convention.
- Direct jOOQ is used for reactive jOOQ to avoid a JDBC-oriented Spring Boot jOOQ starter in an R2DBC application. Spring Boot dependency management supplies the jOOQ version.

## TDD and verification commands

1. `npm test -- --test-name-pattern="renders|dependencies|version"`
   - Initial red: 130 passed, 1 failed.
   - Failure: Boot 2 generated QueryDSL output still used the `jakarta` classifier and `jakarta.persistence-api`.
2. `npm test -- --test-name-pattern="renders|dependencies|version"`
   - Green after namespace implementation: 131 passed, 0 failed.
3. `npm test -- --test-name-pattern="renders|dependencies|version"`
   - Second red after adding the Task 3 reactive jOOQ boundary contract: 130 passed, 1 failed.
   - Failure: reactive jOOQ still rendered `spring-boot-starter-jooq`, not direct `org.jooq:jooq`.
4. `npm test -- --test-name-pattern="renders|dependencies|version"`
   - Green after reactive jOOQ dependency update: 131 passed, 0 failed.
5. `npm test`
   - Full relevant suite: 131 passed, 0 failed; TypeScript compilation passed.
6. `git diff --check`
   - No whitespace errors.

Note: this repository's `npm test` script places the test-name option after the glob, so each focused invocation still executed all 131 tests; the requested command was run exactly.

## Task 3 contract and concerns

- Reactive jOOQ generated projects now have the two prerequisites that Task 3 must consume: an R2DBC `ConnectionFactory` from `spring-boot-starter-data-r2dbc` and `org.jooq.DSLContext` types from direct jOOQ.
- Task 3 must explicitly construct/configure `DSLContext` from the `ConnectionFactory` and selected SQL dialect. It must not assume Spring Boot's JDBC jOOQ auto-configuration is present.
- The renderer tests verify generated coordinates. They do not run Maven or Gradle dependency-resolution smoke builds for every generated combination; that is a useful follow-up if build-tool execution becomes part of the test strategy.

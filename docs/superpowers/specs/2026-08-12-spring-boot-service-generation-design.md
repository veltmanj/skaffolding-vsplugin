# Spring Boot Service Generation Design

## Goal

Make the Spring Boot service scenario generate a useful, runnable example for
the user's selected Spring Boot version, architecture, test style, execution
model, and persistence technology.

## User inputs

The scenario will ask for:

- Spring Boot version, as a free-form semantic version such as `2.7.18` or
  `3.5.4`.
- Aggregate/domain object name, defaulted from the service name and editable by
  the user. The value must be a valid Java type name.
- Existing stack, build, Java, TDD, persistence, database, and migration
  choices.

The Spring Boot version is rendered consistently in Maven, Gradle, and the
architecture notes. Version-aware generation selects `javax.persistence.*`
for Spring Boot 2.x and `jakarta.persistence.*` for Spring Boot 3.x.

## Reactive compatibility

The generator must produce one consistent execution model from the selected
stack mode through the controller, application service, repository port,
adapter, and tests.

Non-Reactive mode supports:

- Hibernate/JPA
- Plain JDBC
- jOOQ
- QueryDSL JPA

Reactive mode supports:

- Spring Data R2DBC
- jOOQ with R2DBC

Blocking persistence options are not offered for Reactive mode. Reactive
output uses WebFlux, reactive return types, reactive repository interfaces,
R2DBC drivers, and matching tests.

## Generated architecture

The generated service contains a small aggregate-derived example, with the
editable aggregate name used consistently in:

- the domain aggregate
- an application use case/service
- a repository output port
- the selected persistence adapter
- a REST controller
- unit and integration-style examples

Domain code remains independent of Spring and persistence APIs. The REST
starter is present in both Maven and Gradle output and matches the selected
reactive mode.

Persistence adapters demonstrate how to implement the same repository port:

- JPA entity and repository adapter for Hibernate/JPA
- `JdbcTemplate` adapter for Plain JDBC
- `DSLContext` adapter for jOOQ
- QueryDSL entity, generated query usage, and adapter for QueryDSL JPA
- R2DBC repository/adapter for Spring Data R2DBC
- reactive jOOQ adapter using R2DBC

## TDD output

When TDD is enabled, the generator creates:

- build dependencies and JUnit Platform configuration for Cucumber
- one example feature file
- matching step definitions
- a Cucumber test runner
- a conventional unit test

Generated tests follow the selected reactive/non-reactive execution model.

## Build output

Maven and Gradle generation will include all dependencies, plugins,
annotation-processing configuration, and test configuration required by the
selected options. Older Spring Boot versions must receive compatible
Persistence API coordinates and imports.

## Verification

Automated tests will verify:

- free-form version validation and propagation
- editable aggregate-name validation and propagation
- Maven and Gradle dependencies for each supported persistence mode
- reactive option filtering and reactive dependencies
- version-aware `javax`/`jakarta` output
- controller, domain, port, adapter, feature, step, runner, and unit-test
  file generation
- existing renderer and safety behavior remains intact


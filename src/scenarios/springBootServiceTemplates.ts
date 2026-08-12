import type { SpringServiceAnswers } from './springBootNewService';

export interface GeneratedServiceFile {
  path: string;
  content: string;
}

export function renderGeneratedServiceFiles(
  a: SpringServiceAnswers,
  appPackage: string
): GeneratedServiceFile[] {
  if (a.stackMode === 'Reactive' && a.persistenceLayer === 'jOOQ'
    && a.database !== 'PostgreSQL' && a.database !== 'H2') {
    throw new Error('Reactive jOOQ supports only PostgreSQL and H2 with the generated OSS dependency.');
  }
  const packagePath = appPackage.replaceAll('.', '/');
  const files: GeneratedServiceFile[] = [
    javaFile(packagePath, 'domain', a.aggregateName, renderDomainAggregate(a, appPackage)),
    javaFile(packagePath, 'domain', `${a.aggregateName}Repository`, renderRepositoryPort(a, appPackage)),
    javaFile(packagePath, 'application', `${a.aggregateName}Service`, renderApplicationService(a, appPackage)),
    javaFile(packagePath, 'web', `${a.aggregateName}Controller`, renderRestController(a, appPackage))
  ];
  const adapter = renderPersistenceAdapter(a, appPackage);
  if (adapter) {
    files.push(adapter);
  }
  const migration = renderMigrationFile(a);
  if (migration) {
    files.push(migration);
  }
  return files;
}

export function persistencePackage(a: SpringServiceAnswers): string {
  switch (a.persistenceLayer) {
    case 'Hibernate (JPA)':
      return 'jpa';
    case 'Plain JDBC':
      return 'jdbc';
    case 'Spring Data R2DBC':
      return 'r2dbc';
    case 'jOOQ':
      return 'jooq';
    case 'QueryDSL (JPA)':
      return 'querydsl';
    case 'None':
      return 'memory';
  }
}

export function javaPersistenceImport(a: SpringServiceAnswers): string {
  return a.springBootVersion.startsWith('2.') ? 'javax.persistence' : 'jakarta.persistence';
}

function javaFile(
  packagePath: string,
  layer: string,
  className: string,
  content: string
): GeneratedServiceFile {
  return {
    path: `src/main/java/${packagePath}/${layer}/${className}.java`,
    content
  };
}

function renderDomainAggregate(a: SpringServiceAnswers, appPackage: string): string {
  const aggregate = a.aggregateName;
  return `package ${appPackage}.domain;

import java.util.Objects;
import java.util.UUID;

public final class ${aggregate} {

    private final UUID id;
    private final String name;

    public ${aggregate}(UUID id, String name) {
        this.id = Objects.requireNonNull(id, "id must not be null");
        this.name = requireName(name);
    }

    public UUID id() {
        return id;
    }

    public String name() {
        return name;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    private static String requireName(String name) {
        String value = Objects.requireNonNull(name, "name must not be null").trim();
        if (value.isEmpty()) {
            throw new IllegalArgumentException("name must not be blank");
        }
        return value;
    }
}
`;
}

function renderRepositoryPort(a: SpringServiceAnswers, appPackage: string): string {
  const aggregate = a.aggregateName;
  if (a.stackMode === 'Reactive') {
    return `package ${appPackage}.domain;

import java.util.UUID;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

public interface ${aggregate}Repository {

    Mono<${aggregate}> save(${aggregate} ${variableName(aggregate)});

    Mono<${aggregate}> findById(UUID id);

    Flux<${aggregate}> findAll();
}
`;
  }
  return `package ${appPackage}.domain;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ${aggregate}Repository {

    ${aggregate} save(${aggregate} ${variableName(aggregate)});

    Optional<${aggregate}> findById(UUID id);

    List<${aggregate}> findAll();
}
`;
}

function renderApplicationService(a: SpringServiceAnswers, appPackage: string): string {
  const aggregate = a.aggregateName;
  const repository = `${aggregate}Repository`;
  const repositoryVariable = `${variableName(aggregate)}Repository`;
  if (a.stackMode === 'Reactive') {
    return `package ${appPackage}.application;

import ${appPackage}.domain.${aggregate};
import ${appPackage}.domain.${repository};
import java.util.UUID;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
public class ${aggregate}Service {

    private final ${repository} ${repositoryVariable};

    public ${aggregate}Service(${repository} ${repositoryVariable}) {
        this.${repositoryVariable} = ${repositoryVariable};
    }

    public Mono<${aggregate}> create(String name) {
        return ${repositoryVariable}.save(new ${aggregate}(UUID.randomUUID(), name));
    }

    public Mono<${aggregate}> get(UUID id) {
        return ${repositoryVariable}.findById(id);
    }

    public Flux<${aggregate}> findAll() {
        return ${repositoryVariable}.findAll();
    }
}
`;
  }
  return `package ${appPackage}.application;

import ${appPackage}.domain.${aggregate};
import ${appPackage}.domain.${repository};
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ${aggregate}Service {

    private final ${repository} ${repositoryVariable};

    public ${aggregate}Service(${repository} ${repositoryVariable}) {
        this.${repositoryVariable} = ${repositoryVariable};
    }

    public ${aggregate} create(String name) {
        return ${repositoryVariable}.save(new ${aggregate}(UUID.randomUUID(), name));
    }

    public Optional<${aggregate}> get(UUID id) {
        return ${repositoryVariable}.findById(id);
    }

    public List<${aggregate}> findAll() {
        return ${repositoryVariable}.findAll();
    }
}
`;
}

function renderRestController(a: SpringServiceAnswers, appPackage: string): string {
  const aggregate = a.aggregateName;
  const service = `${aggregate}Service`;
  const serviceVariable = `${variableName(aggregate)}Service`;
  const route = `/${variableName(aggregate)}s`;
  if (a.stackMode === 'Reactive') {
    return `package ${appPackage}.web;

import ${appPackage}.application.${service};
import ${appPackage}.domain.${aggregate};
import java.net.URI;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("${route}")
public class ${aggregate}Controller {

    private final ${service} ${serviceVariable};

    public ${aggregate}Controller(${service} ${serviceVariable}) {
        this.${serviceVariable} = ${serviceVariable};
    }

    @PostMapping
    public Mono<ResponseEntity<${aggregate}>> create(@RequestBody Create${aggregate}Request request) {
        return ${serviceVariable}.create(request.name())
            .map(created -> ResponseEntity
                .created(URI.create("${route}/" + created.id()))
                .body(created));
    }

    @GetMapping("/{id}")
    public Mono<ResponseEntity<${aggregate}>> get(@PathVariable UUID id) {
        return ${serviceVariable}.get(id)
            .map(ResponseEntity::ok)
            .defaultIfEmpty(ResponseEntity.notFound().build());
    }

    @GetMapping
    public Flux<${aggregate}> findAll() {
        return ${serviceVariable}.findAll();
    }

    public record Create${aggregate}Request(String name) {
    }
}
`;
  }
  return `package ${appPackage}.web;

import ${appPackage}.application.${service};
import ${appPackage}.domain.${aggregate};
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("${route}")
public class ${aggregate}Controller {

    private final ${service} ${serviceVariable};

    public ${aggregate}Controller(${service} ${serviceVariable}) {
        this.${serviceVariable} = ${serviceVariable};
    }

    @PostMapping
    public ResponseEntity<${aggregate}> create(@RequestBody Create${aggregate}Request request) {
        ${aggregate} created = ${serviceVariable}.create(request.name());
        return ResponseEntity.created(URI.create("${route}/" + created.id())).body(created);
    }

    @GetMapping("/{id}")
    public ResponseEntity<${aggregate}> get(@PathVariable UUID id) {
        return ResponseEntity.of(${serviceVariable}.get(id));
    }

    @GetMapping
    public List<${aggregate}> findAll() {
        return ${serviceVariable}.findAll();
    }

    public record Create${aggregate}Request(String name) {
    }
}
`;
}

function renderPersistenceAdapter(
  a: SpringServiceAnswers,
  appPackage: string
): GeneratedServiceFile | undefined {
  const packagePath = appPackage.replaceAll('.', '/');
  switch (a.persistenceLayer) {
    case 'Hibernate (JPA)':
      return javaFile(packagePath, 'infrastructure/jpa', `Jpa${a.aggregateName}RepositoryAdapter`, renderJpaAdapter(a, appPackage));
    case 'Plain JDBC':
      return javaFile(packagePath, 'infrastructure/jdbc', `Jdbc${a.aggregateName}RepositoryAdapter`, renderJdbcAdapter(a, appPackage));
    case 'Spring Data R2DBC':
      return javaFile(packagePath, 'infrastructure/r2dbc', `R2dbc${a.aggregateName}RepositoryAdapter`, renderR2dbcAdapter(a, appPackage));
    case 'jOOQ':
      return javaFile(packagePath, 'infrastructure/jooq', `Jooq${a.aggregateName}RepositoryAdapter`, renderJooqAdapter(a, appPackage));
    case 'QueryDSL (JPA)':
      return javaFile(packagePath, 'infrastructure/querydsl', `QueryDsl${a.aggregateName}RepositoryAdapter`, renderQueryDslAdapter(a, appPackage));
    case 'None':
      return javaFile(packagePath, 'infrastructure/memory', `InMemory${a.aggregateName}RepositoryAdapter`, renderInMemoryAdapter(a, appPackage));
  }
}

function renderInMemoryAdapter(a: SpringServiceAnswers, appPackage: string): string {
  const aggregate = a.aggregateName;
  const variable = variableName(aggregate);
  if (a.stackMode === 'Reactive') {
    return `package ${appPackage}.infrastructure.memory;

import ${appPackage}.domain.${aggregate};
import ${appPackage}.domain.${aggregate}Repository;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Repository
public class InMemory${aggregate}RepositoryAdapter implements ${aggregate}Repository {

    private final ConcurrentMap<UUID, ${aggregate}> entries = new ConcurrentHashMap<>();

    @Override
    public Mono<${aggregate}> save(${aggregate} ${variable}) {
        entries.put(${variable}.id(), ${variable});
        return Mono.just(${variable});
    }

    @Override
    public Mono<${aggregate}> findById(UUID id) {
        return Mono.justOrEmpty(entries.get(id));
    }

    @Override
    public Flux<${aggregate}> findAll() {
        return Flux.fromIterable(entries.values());
    }
}
`;
  }
  return `package ${appPackage}.infrastructure.memory;

import ${appPackage}.domain.${aggregate};
import ${appPackage}.domain.${aggregate}Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.stereotype.Repository;

@Repository
public class InMemory${aggregate}RepositoryAdapter implements ${aggregate}Repository {

    private final ConcurrentMap<UUID, ${aggregate}> entries = new ConcurrentHashMap<>();

    @Override
    public ${aggregate} save(${aggregate} ${variable}) {
        entries.put(${variable}.id(), ${variable});
        return ${variable};
    }

    @Override
    public Optional<${aggregate}> findById(UUID id) {
        return Optional.ofNullable(entries.get(id));
    }

    @Override
    public List<${aggregate}> findAll() {
        return List.copyOf(entries.values());
    }
}
`;
}

function renderJpaAdapter(a: SpringServiceAnswers, appPackage: string): string {
  const aggregate = a.aggregateName;
  const entity = `${aggregate}Entity`;
  const variable = variableName(aggregate);
  const persistence = javaPersistenceImport(a);
  const storedIdType = uuidStorageJavaType(a);
  const repositoryLookupId = uuidToStorage(a, 'id');
  const entityId = uuidToStorage(a, `${variable}.id()`);
  const domainId = storageToUuid(a, 'id');
  return `package ${appPackage}.infrastructure.jpa;

import ${appPackage}.domain.${aggregate};
import ${appPackage}.domain.${aggregate}Repository;
import ${persistence}.Entity;
import ${persistence}.Id;
import ${persistence}.Table;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public class Jpa${aggregate}RepositoryAdapter implements ${aggregate}Repository {

    private final SpringData${aggregate}Repository repository;

    public Jpa${aggregate}RepositoryAdapter(SpringData${aggregate}Repository repository) {
        this.repository = repository;
    }

    @Override
    public ${aggregate} save(${aggregate} ${variable}) {
        return repository.save(new ${entity}(${variable})).toDomain();
    }

    @Override
    public Optional<${aggregate}> findById(UUID id) {
        return repository.findById(${repositoryLookupId}).map(${entity}::toDomain);
    }

    @Override
    public List<${aggregate}> findAll() {
        return repository.findAll().stream().map(${entity}::toDomain).toList();
    }
}

interface SpringData${aggregate}Repository extends JpaRepository<${entity}, ${storedIdType}> {
}

@Entity
@Table(name = "${tableName(aggregate)}")
class ${entity} {

    @Id
    private ${storedIdType} id;
    private String name;

    protected ${entity}() {
    }

    ${entity}(${aggregate} ${variable}) {
        this.id = ${entityId};
        this.name = ${variable}.name();
    }

    ${aggregate} toDomain() {
        return new ${aggregate}(${domainId}, name);
    }
}
`;
}

function renderJdbcAdapter(a: SpringServiceAnswers, appPackage: string): string {
  const aggregate = a.aggregateName;
  const variable = variableName(aggregate);
  const table = tableName(aggregate);
  const aggregateId = uuidToStorage(a, `${variable}.id()`);
  const lookupId = uuidToStorage(a, 'id');
  const rowId = a.database === 'Oracle'
    ? 'UUID.fromString(row.getString("id"))'
    : 'row.getObject("id", UUID.class)';
  return `package ${appPackage}.infrastructure.jdbc;

import ${appPackage}.domain.${aggregate};
import ${appPackage}.domain.${aggregate}Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class Jdbc${aggregate}RepositoryAdapter implements ${aggregate}Repository {

    private final JdbcTemplate jdbc;

    public Jdbc${aggregate}RepositoryAdapter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public ${aggregate} save(${aggregate} ${variable}) {
        int updated = jdbc.update(
            "UPDATE ${table} SET name = ? WHERE id = ?",
            ${variable}.name(),
            ${aggregateId}
        );
        if (updated == 0) {
            jdbc.update(
                "INSERT INTO ${table} (id, name) VALUES (?, ?)",
                ${aggregateId},
                ${variable}.name()
            );
        }
        return ${variable};
    }

    @Override
    public Optional<${aggregate}> findById(UUID id) {
        return jdbc.query(
            "SELECT id, name FROM ${table} WHERE id = ?",
            (row, rowNumber) -> new ${aggregate}(
                ${rowId},
                row.getString("name")
            ),
            ${lookupId}
        ).stream().findFirst();
    }

    @Override
    public List<${aggregate}> findAll() {
        return jdbc.query(
            "SELECT id, name FROM ${table}",
            (row, rowNumber) -> new ${aggregate}(
                ${rowId},
                row.getString("name")
            )
        );
    }
}
`;
}

function renderR2dbcAdapter(a: SpringServiceAnswers, appPackage: string): string {
  const aggregate = a.aggregateName;
  const variable = variableName(aggregate);
  const table = tableName(aggregate);
  const aggregateId = uuidToStorage(a, `${variable}.id()`);
  const lookupId = uuidToStorage(a, 'id');
  const rowId = a.database === 'Oracle'
    ? 'UUID.fromString(row.get("id", String.class))'
    : 'row.get("id", UUID.class)';
  return `package ${appPackage}.infrastructure.r2dbc;

import ${appPackage}.domain.${aggregate};
import ${appPackage}.domain.${aggregate}Repository;
import java.util.UUID;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Repository
public class R2dbc${aggregate}RepositoryAdapter implements ${aggregate}Repository {

    private final DatabaseClient database;

    public R2dbc${aggregate}RepositoryAdapter(DatabaseClient database) {
        this.database = database;
    }

    @Override
    public Mono<${aggregate}> save(${aggregate} ${variable}) {
        return database.sql("UPDATE ${table} SET name = :name WHERE id = :id")
            .bind("name", ${variable}.name())
            .bind("id", ${aggregateId})
            .fetch()
            .rowsUpdated()
            .flatMap(updated -> updated == 0 ? insert(${variable}) : Mono.just(${variable}));
    }

    private Mono<${aggregate}> insert(${aggregate} ${variable}) {
        return database.sql("INSERT INTO ${table} (id, name) VALUES (:id, :name)")
            .bind("id", ${aggregateId})
            .bind("name", ${variable}.name())
            .fetch()
            .rowsUpdated()
            .thenReturn(${variable});
    }

    @Override
    public Mono<${aggregate}> findById(UUID id) {
        return database.sql("SELECT id, name FROM ${table} WHERE id = :id")
            .bind("id", ${lookupId})
            .map((row, metadata) -> new ${aggregate}(
                ${rowId},
                row.get("name", String.class)
            ))
            .one();
    }

    @Override
    public Flux<${aggregate}> findAll() {
        return database.sql("SELECT id, name FROM ${table}")
            .map((row, metadata) -> new ${aggregate}(
                ${rowId},
                row.get("name", String.class)
            ))
            .all();
    }
}
`;
}

function renderJooqAdapter(a: SpringServiceAnswers, appPackage: string): string {
  return a.stackMode === 'Reactive'
    ? renderReactiveJooqAdapter(a, appPackage)
    : renderBlockingJooqAdapter(a, appPackage);
}

function renderBlockingJooqAdapter(a: SpringServiceAnswers, appPackage: string): string {
  const aggregate = a.aggregateName;
  const variable = variableName(aggregate);
  const table = tableName(aggregate);
  const storedIdType = uuidStorageJavaType(a);
  const aggregateId = uuidToStorage(a, `${variable}.id()`);
  const lookupId = uuidToStorage(a, 'id');
  const recordId = storageToUuid(a, 'record.get(ID)');
  return `package ${appPackage}.infrastructure.jooq;

import ${appPackage}.domain.${aggregate};
import ${appPackage}.domain.${aggregate}Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.Field;
import org.jooq.Record;
import org.jooq.Table;
import org.springframework.stereotype.Repository;

import static org.jooq.impl.DSL.field;
import static org.jooq.impl.DSL.table;

@Repository
public class Jooq${aggregate}RepositoryAdapter implements ${aggregate}Repository {

    private static final Table<Record> ${table.toUpperCase()} = table("${table}");
    private static final Field<${storedIdType}> ID = field("id", ${storedIdType}.class);
    private static final Field<String> NAME = field("name", String.class);

    private final DSLContext dsl;

    public Jooq${aggregate}RepositoryAdapter(DSLContext dsl) {
        this.dsl = dsl;
    }

    @Override
    public ${aggregate} save(${aggregate} ${variable}) {
        int updated = dsl.update(${table.toUpperCase()})
            .set(NAME, ${variable}.name())
            .where(ID.eq(${aggregateId}))
            .execute();
        if (updated == 0) {
            dsl.insertInto(${table.toUpperCase()})
                .set(ID, ${aggregateId})
                .set(NAME, ${variable}.name())
                .execute();
        }
        return ${variable};
    }

    @Override
    public Optional<${aggregate}> findById(UUID id) {
        return dsl.select(ID, NAME)
            .from(${table.toUpperCase()})
            .where(ID.eq(${lookupId}))
            .fetchOptional(record -> new ${aggregate}(${recordId}, record.get(NAME)));
    }

    @Override
    public List<${aggregate}> findAll() {
        return dsl.select(ID, NAME)
            .from(${table.toUpperCase()})
            .fetch(record -> new ${aggregate}(${recordId}, record.get(NAME)));
    }
}
`;
}

function renderReactiveJooqAdapter(a: SpringServiceAnswers, appPackage: string): string {
  const aggregate = a.aggregateName;
  const variable = variableName(aggregate);
  const table = tableName(aggregate);
  const tableConstant = table.toUpperCase();
  return `package ${appPackage}.infrastructure.jooq;

import ${appPackage}.domain.${aggregate};
import ${appPackage}.domain.${aggregate}Repository;
import io.r2dbc.spi.ConnectionFactory;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.Field;
import org.jooq.Record;
import org.jooq.SQLDialect;
import org.jooq.Table;
import org.jooq.impl.DSL;
import org.jooq.impl.DefaultConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import static org.jooq.impl.DSL.field;
import static org.jooq.impl.DSL.table;

@Repository
public class Jooq${aggregate}RepositoryAdapter implements ${aggregate}Repository {

    private static final Table<Record> ${tableConstant} = table("${table}");
    private static final Field<UUID> ID = field("id", UUID.class);
    private static final Field<String> NAME = field("name", String.class);

    private final DSLContext dsl;

    public Jooq${aggregate}RepositoryAdapter(DSLContext dsl) {
        this.dsl = dsl;
    }

    @Override
    public Mono<${aggregate}> save(${aggregate} ${variable}) {
        return Mono.from(dsl.update(${tableConstant})
            .set(NAME, ${variable}.name())
            .where(ID.eq(${variable}.id())))
            .flatMap(updated -> updated == 0
                ? Mono.from(dsl.insertInto(${tableConstant})
                    .set(ID, ${variable}.id())
                    .set(NAME, ${variable}.name()))
                    .thenReturn(${variable})
                : Mono.just(${variable}));
    }

    @Override
    public Mono<${aggregate}> findById(UUID id) {
        return Mono.from(dsl.select(ID, NAME)
            .from(${tableConstant})
            .where(ID.eq(id)))
            .map(record -> new ${aggregate}(record.get(ID), record.get(NAME)));
    }

    @Override
    public Flux<${aggregate}> findAll() {
        return Flux.from(dsl.select(ID, NAME).from(${tableConstant}))
            .map(record -> new ${aggregate}(record.get(ID), record.get(NAME)));
    }
}

@Configuration
class ReactiveJooqConfiguration {

    @Bean
    DSLContext dslContext(ConnectionFactory connectionFactory) {
        DefaultConfiguration configuration = new DefaultConfiguration();
        configuration.set(connectionFactory);
        configuration.set(SQLDialect.${sqlDialect(a)});
        return DSL.using(configuration);
    }
}
`;
}

function renderQueryDslAdapter(a: SpringServiceAnswers, appPackage: string): string {
  const aggregate = a.aggregateName;
  const entity = `${aggregate}Entity`;
  const variable = variableName(aggregate);
  const persistence = javaPersistenceImport(a);
  const storedIdType = uuidStorageJavaType(a);
  const lookupId = uuidToStorage(a, 'id');
  const entityId = uuidToStorage(a, `${variable}.id()`);
  const domainId = storageToUuid(a, 'id');
  return `package ${appPackage}.infrastructure.querydsl;

import ${appPackage}.domain.${aggregate};
import ${appPackage}.domain.${aggregate}Repository;
import com.querydsl.jpa.impl.JPAQueryFactory;
import ${persistence}.Entity;
import ${persistence}.EntityManager;
import ${persistence}.Id;
import ${persistence}.Table;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Transactional
public class QueryDsl${aggregate}RepositoryAdapter implements ${aggregate}Repository {

    private static final Q${entity} ${variable.toUpperCase()} = Q${entity}.${variable}Entity;

    private final EntityManager entityManager;
    private final JPAQueryFactory queries;

    public QueryDsl${aggregate}RepositoryAdapter(EntityManager entityManager) {
        this.entityManager = entityManager;
        this.queries = new JPAQueryFactory(entityManager);
    }

    @Override
    public ${aggregate} save(${aggregate} ${variable}) {
        return entityManager.merge(new ${entity}(${variable})).toDomain();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<${aggregate}> findById(UUID id) {
        ${entity} entity = queries.selectFrom(${variable.toUpperCase()})
            .where(${variable.toUpperCase()}.id.eq(${lookupId}))
            .fetchOne();
        return Optional.ofNullable(entity).map(${entity}::toDomain);
    }

    @Override
    @Transactional(readOnly = true)
    public List<${aggregate}> findAll() {
        return queries.selectFrom(${variable.toUpperCase()})
            .fetch()
            .stream()
            .map(${entity}::toDomain)
            .toList();
    }
}

@Entity
@Table(name = "${tableName(aggregate)}")
class ${entity} {

    @Id
    ${storedIdType} id;
    String name;

    protected ${entity}() {
    }

    ${entity}(${aggregate} ${variable}) {
        this.id = ${entityId};
        this.name = ${variable}.name();
    }

    ${aggregate} toDomain() {
        return new ${aggregate}(${domainId}, name);
    }
}
`;
}

function renderMigrationFile(a: SpringServiceAnswers): GeneratedServiceFile | undefined {
  if (a.persistenceLayer === 'None' || a.migrationTool === 'None') {
    return undefined;
  }
  const table = tableName(a.aggregateName);
  const types = databaseColumnTypes(a);
  if (a.migrationTool === 'Flyway') {
    return {
      path: `src/main/resources/db/migration/V1__create_${table}.sql`,
      content: `CREATE TABLE ${table} (
    id ${types.id} PRIMARY KEY,
    name ${types.name} NOT NULL
);
`
    };
  }
  return {
    path: 'src/main/resources/db/changelog/db.changelog-master.yaml',
    content: `databaseChangeLog:
  - changeSet:
      id: 1-create-${table}
      author: skaffolding
      changes:
        - createTable:
            tableName: ${table}
            columns:
              - column:
                  name: id
                  type: ${types.id}
                  constraints:
                    primaryKey: true
                    nullable: false
              - column:
                  name: name
                  type: ${types.name}
                  constraints:
                    nullable: false
`
  };
}

function databaseColumnTypes(a: SpringServiceAnswers): { id: string; name: string } {
  switch (a.database) {
    case 'PostgreSQL':
    case 'H2':
      return { id: 'UUID', name: 'VARCHAR(255)' };
    case 'MSSQL Server':
      return { id: 'UNIQUEIDENTIFIER', name: 'VARCHAR(255)' };
    case 'Oracle':
      return { id: 'VARCHAR2(36)', name: 'VARCHAR2(255 CHAR)' };
  }
}

function uuidStorageJavaType(a: SpringServiceAnswers): 'String' | 'UUID' {
  return a.database === 'Oracle' ? 'String' : 'UUID';
}

function uuidToStorage(a: SpringServiceAnswers, expression: string): string {
  return a.database === 'Oracle' ? `${expression}.toString()` : expression;
}

function storageToUuid(a: SpringServiceAnswers, expression: string): string {
  return a.database === 'Oracle' ? `UUID.fromString(${expression})` : expression;
}

function variableName(typeName: string): string {
  return typeName.charAt(0).toLowerCase() + typeName.slice(1);
}

function tableName(typeName: string): string {
  return `${variableName(typeName)}s`;
}

function sqlDialect(a: SpringServiceAnswers): string {
  switch (a.database) {
    case 'PostgreSQL':
      return 'POSTGRES';
    case 'H2':
      return 'H2';
    default:
      throw new Error('Reactive jOOQ supports only PostgreSQL and H2 with the generated OSS dependency.');
  }
}

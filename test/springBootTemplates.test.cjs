const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');

const originalLoad = Module._load;
Module._load = function loadVscodeMock(request, parent, isMain) {
  if (request === 'vscode') {
    return {};
  }

  return originalLoad.call(this, request, parent, isMain);
};

const {
  SPRING_BOOT_VERSION,
  databaseOptions,
  defaultAggregateName,
  javaPersistenceImport,
  persistencePackage,
  persistenceOptions,
  renderApplicationYaml,
  renderGeneratedServiceFiles,
  renderGeneratedTestFiles,
  renderGradle,
  renderPomXml,
  validateAggregateName,
  validateBasePackage,
  validateJavaVersion,
  validateSpringBootVersion,
  validateServiceFolder,
  validateServiceName
} = require('../out/scenarios/springBootNewService.js');
Module._load = originalLoad;

function serviceAnswers(overrides = {}) {
  return {
    stackMode: 'Non-Reactive',
    serviceName: 'order-service',
    folderName: 'services/order-service',
    basePackage: 'com.example.orders',
    buildTool: 'Maven',
    springBootVersion: '3.5.4',
    javaVersion: '21',
    useTdd: false,
    tddTool: 'Cucumber',
    aggregateName: 'Order',
    persistenceLayer: 'Hibernate (JPA)',
    database: 'PostgreSQL',
    migrationTool: 'None',
    ...overrides
  };
}

function generatedFile(files, expectedPath) {
  const file = files.find((candidate) => candidate.path === expectedPath);
  assert.ok(file, `Expected generated file ${expectedPath}`);
  return file.content;
}

function queryDslAnswers(buildTool) {
  return serviceAnswers({
    buildTool,
    persistenceLayer: 'QueryDSL (JPA)',
  });
}

test('Cucumber Maven and Gradle builds include the JUnit Platform engine and suite configuration', () => {
  const mavenAnswers = serviceAnswers({ useTdd: true, buildTool: 'Maven' });
  const gradleAnswers = serviceAnswers({ useTdd: true, buildTool: 'Gradle' });
  const pom = renderPomXml(mavenAnswers);
  const gradle = renderGradle(gradleAnswers);

  assert.match(pom, /<cucumber\.version>[^<]+<\/cucumber\.version>/);
  assert.match(pom, /<groupId>io\.cucumber<\/groupId>\s*<artifactId>cucumber-java<\/artifactId>\s*<version>\$\{cucumber\.version\}<\/version>\s*<scope>test<\/scope>/);
  assert.match(pom, /<groupId>io\.cucumber<\/groupId>\s*<artifactId>cucumber-junit-platform-engine<\/artifactId>\s*<version>\$\{cucumber\.version\}<\/version>\s*<scope>test<\/scope>/);
  assert.match(pom, /<groupId>org\.junit\.platform<\/groupId>\s*<artifactId>junit-platform-suite<\/artifactId>\s*<scope>test<\/scope>/);
  assert.match(gradle, /testImplementation\("io\.cucumber:cucumber-java:[^"]+"\)/);
  assert.match(gradle, /testImplementation\("io\.cucumber:cucumber-junit-platform-engine:[^"]+"\)/);
  assert.match(gradle, /testImplementation\("org\.junit\.platform:junit-platform-suite"\)/);
  assert.match(gradle, /tasks\.withType<Test>\s*\{\s*useJUnitPlatform\(\)/);
});

test('Cucumber feature, step, runner, and unit test files use the selected aggregate', () => {
  const files = renderGeneratedTestFiles(
    serviceAnswers({ useTdd: true, aggregateName: 'Invoice' }),
    'com.example.orders'
  );
  const feature = generatedFile(files, 'src/test/resources/features/invoice.feature');
  const steps = generatedFile(files, 'src/test/java/com/example/orders/InvoiceStepDefinitions.java');
  const runner = generatedFile(files, 'src/test/java/com/example/orders/CucumberTest.java');
  const unitTest = generatedFile(files, 'src/test/java/com/example/orders/InvoiceServiceTest.java');

  assert.match(feature, /Feature: Manage Invoice/);
  assert.match(feature, /Given a new Invoice named "Example Invoice"/);
  assert.match(steps, /class InvoiceStepDefinitions/);
  assert.match(steps, /new InvoiceService\(new TestInvoiceRepository\(\)\)/);
  assert.match(steps, /@Given\("a new Invoice named \{string\}"\)/);
  assert.match(runner, /@Suite/);
  assert.match(runner, /@IncludeEngines\("cucumber"\)/);
  assert.match(runner, /@SelectClasspathResource\("features"\)/);
  assert.match(unitTest, /class InvoiceServiceTest/);
  assert.match(unitTest, /creates_an_invoice_with_the_requested_name/);
});

test('reactive Cucumber steps and unit test use Mono and Flux repository contracts', () => {
  const files = renderGeneratedTestFiles(
    serviceAnswers({ useTdd: true, stackMode: 'Reactive' }),
    'com.example.orders'
  );
  const steps = generatedFile(files, 'src/test/java/com/example/orders/OrderStepDefinitions.java');
  const unitTest = generatedFile(files, 'src/test/java/com/example/orders/OrderServiceTest.java');

  assert.match(steps, /import reactor\.core\.publisher\.Flux;/);
  assert.match(steps, /import reactor\.core\.publisher\.Mono;/);
  assert.match(steps, /Mono<Order> created/);
  assert.match(steps, /created\.block\(\)/);
  assert.match(steps, /Mono<Order> save\(Order order\)/);
  assert.match(steps, /Flux<Order> findAll\(\)/);
  assert.match(unitTest, /Mono<Order> created = service\.create\("Example Order"\)/);
  assert.match(unitTest, /created\.block\(\)/);
});

test('Maven executes the generated Cucumber scenario and reports all steps', { timeout: 120_000 }, (t) => {
  const mavenVersion = spawnSync('mvn', ['--version'], { encoding: 'utf8' });
  if (mavenVersion.error?.code === 'ENOENT') {
    t.skip('Maven is not installed');
    return;
  }
  assert.equal(
    mavenVersion.status,
    0,
    `Unable to run Maven:\n${mavenVersion.stdout}${mavenVersion.stderr}`
  );

  const projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffolding-maven-cucumber-'));
  t.after(() => fs.rmSync(projectDirectory, { recursive: true, force: true }));
  const answers = serviceAnswers({
    useTdd: true,
    buildTool: 'Maven',
    javaVersion: '17',
    persistenceLayer: 'None',
    database: 'H2'
  });
  const files = [
    { path: 'pom.xml', content: renderPomXml(answers) },
    ...renderGeneratedServiceFiles(answers, 'com.example.orders'),
    ...renderGeneratedTestFiles(answers, 'com.example.orders')
  ];

  for (const file of files) {
    const destination = path.join(projectDirectory, file.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, file.content);
  }

  const mavenTest = spawnSync(
    'mvn',
    ['-q', 'test', '-Dcucumber.plugin=json:target/cucumber.json'],
    { cwd: projectDirectory, encoding: 'utf8', timeout: 120_000 }
  );
  assert.equal(
    mavenTest.status,
    0,
    `Generated Maven project failed:\n${mavenTest.stdout}${mavenTest.stderr}`
  );

  const surefireReport = fs.readFileSync(
    path.join(
      projectDirectory,
      'target/surefire-reports/TEST-com.example.orders.CucumberTest.xml'
    ),
    'utf8'
  );
  const surefireScenarioCount = surefireReport.match(
    /<testsuite[^>]*\btests="(\d+)"/
  )?.[1];
  assert.equal(surefireScenarioCount, '1');

  const cucumberReport = JSON.parse(
    fs.readFileSync(path.join(projectDirectory, 'target/cucumber.json'), 'utf8')
  );
  const scenarios = cucumberReport.flatMap((feature) => feature.elements ?? []);
  assert.equal(scenarios.length, 1);
  assert.equal(scenarios[0].steps.length, 3);
  assert.deepEqual(
    scenarios[0].steps.map((step) => step.result.status),
    ['passed', 'passed', 'passed']
  );
});

test('generated files contain a persistence-free domain and repository port', () => {
  const files = renderGeneratedServiceFiles(serviceAnswers(), 'com.example.orders');
  const aggregate = generatedFile(files, 'src/main/java/com/example/orders/domain/Order.java');
  const repository = generatedFile(files, 'src/main/java/com/example/orders/domain/OrderRepository.java');
  const service = generatedFile(files, 'src/main/java/com/example/orders/application/OrderService.java');
  const controller = generatedFile(files, 'src/main/java/com/example/orders/web/OrderController.java');

  assert.match(aggregate, /package com\.example\.orders\.domain;/);
  assert.match(aggregate, /public final class Order/);
  assert.match(aggregate, /private final UUID id;/);
  assert.match(aggregate, /private final String name;/);
  assert.match(repository, /interface OrderRepository/);
  assert.match(repository, /Optional<Order> findById\(UUID id\)/);
  assert.doesNotMatch(`${aggregate}\n${repository}`, /org\.springframework|javax\.persistence|jakarta\.persistence/);
  assert.match(service, /class OrderService/);
  assert.match(service, /Order create\(String name\)/);
  assert.match(controller, /class OrderController/);
  assert.match(controller, /@PostMapping/);
  assert.match(controller, /@GetMapping\("\/\{id\}"\)/);
});

test('generated files select one non-reactive persistence adapter', () => {
  const cases = [
    ['Hibernate (JPA)', 'jpa', 'JpaOrderRepositoryAdapter.java', /JpaRepository/],
    ['Plain JDBC', 'jdbc', 'JdbcOrderRepositoryAdapter.java', /JdbcTemplate/],
    ['jOOQ', 'jooq', 'JooqOrderRepositoryAdapter.java', /DSLContext/],
    ['QueryDSL (JPA)', 'querydsl', 'QueryDslOrderRepositoryAdapter.java', /JPAQueryFactory/]
  ];

  for (const [persistenceLayer, packageName, fileName, api] of cases) {
    const answers = serviceAnswers({ persistenceLayer });
    const files = renderGeneratedServiceFiles(answers, 'com.example.orders');
    const adapterPath = `src/main/java/com/example/orders/infrastructure/${packageName}/${fileName}`;
    const adapters = files.filter((file) => file.path.includes('/infrastructure/'));

    assert.equal(persistencePackage(answers), packageName);
    assert.equal(adapters.length, 1);
    assert.equal(adapters[0].path, adapterPath);
    assert.match(adapters[0].content, api);
    assert.match(adapters[0].content, /implements OrderRepository/);
  }
});

test('persistence None generates an in-memory repository bean', () => {
  const answers = serviceAnswers({ persistenceLayer: 'None' });
  const files = renderGeneratedServiceFiles(answers, 'com.example.orders');
  const adapter = generatedFile(
    files,
    'src/main/java/com/example/orders/infrastructure/memory/InMemoryOrderRepositoryAdapter.java'
  );

  assert.equal(persistencePackage(answers), 'memory');
  assert.match(adapter, /@Repository/);
  assert.match(adapter, /implements OrderRepository/);
  assert.match(adapter, /ConcurrentHashMap/);
  assert.match(adapter, /Optional<Order> findById\(UUID id\)/);
  assert.doesNotMatch(adapter, /JdbcTemplate|DSLContext|persistence\./);
});

test('reactive persistence None generates a reactive in-memory repository bean', () => {
  const answers = serviceAnswers({ stackMode: 'Reactive', persistenceLayer: 'None' });
  const files = renderGeneratedServiceFiles(answers, 'com.example.orders');
  const adapter = generatedFile(
    files,
    'src/main/java/com/example/orders/infrastructure/memory/InMemoryOrderRepositoryAdapter.java'
  );

  assert.match(adapter, /Mono<Order> save\(Order order\)/);
  assert.match(adapter, /Mono<Order> findById\(UUID id\)/);
  assert.match(adapter, /Flux<Order> findAll\(\)/);
  assert.match(adapter, /@Repository/);
});

test('reactive generated files use Mono Flux and a DatabaseClient R2DBC adapter', () => {
  const answers = serviceAnswers({
    stackMode: 'Reactive',
    persistenceLayer: 'Spring Data R2DBC'
  });
  const files = renderGeneratedServiceFiles(answers, 'com.example.orders');
  const repository = generatedFile(files, 'src/main/java/com/example/orders/domain/OrderRepository.java');
  const service = generatedFile(files, 'src/main/java/com/example/orders/application/OrderService.java');
  const controller = generatedFile(files, 'src/main/java/com/example/orders/web/OrderController.java');
  const adapter = generatedFile(files, 'src/main/java/com/example/orders/infrastructure/r2dbc/R2dbcOrderRepositoryAdapter.java');

  assert.match(repository, /Mono<Order> save\(Order order\)/);
  assert.match(repository, /Mono<Order> findById\(UUID id\)/);
  assert.match(repository, /Flux<Order> findAll\(\)/);
  assert.match(service, /Mono<Order> create\(String name\)/);
  assert.match(controller, /Mono<ResponseEntity<Order>>/);
  assert.match(controller, /Flux<Order>/);
  assert.match(adapter, /DatabaseClient/);
  assert.match(adapter, /implements OrderRepository/);
  assert.doesNotMatch(adapter, /JdbcTemplate|EntityManager/);
});

test('reactive jOOQ adapter configures DSLContext from the R2DBC ConnectionFactory', () => {
  const answers = serviceAnswers({
    stackMode: 'Reactive',
    persistenceLayer: 'jOOQ'
  });
  const files = renderGeneratedServiceFiles(answers, 'com.example.orders');
  const adapter = generatedFile(files, 'src/main/java/com/example/orders/infrastructure/jooq/JooqOrderRepositoryAdapter.java');

  assert.match(adapter, /io\.r2dbc\.spi\.ConnectionFactory/);
  assert.match(adapter, /DSLContext dslContext\(ConnectionFactory connectionFactory\)/);
  assert.match(adapter, /configuration\.set\(connectionFactory\)/);
  assert.match(adapter, /configuration\.set\(SQLDialect\.POSTGRES\)/);
  assert.match(adapter, /Flux\.from\(/);
  assert.match(adapter, /Mono\.from\(/);
  assert.doesNotMatch(adapter, /DataSource|java\.sql\.Connection|spring-boot-starter-jooq/);
});

test('jOOQ adapters update then insert without relying on generated key metadata', () => {
  const blocking = generatedFile(
    renderGeneratedServiceFiles(serviceAnswers({ persistenceLayer: 'jOOQ' }), 'com.example.orders'),
    'src/main/java/com/example/orders/infrastructure/jooq/JooqOrderRepositoryAdapter.java'
  );
  const reactive = generatedFile(
    renderGeneratedServiceFiles(
      serviceAnswers({ stackMode: 'Reactive', persistenceLayer: 'jOOQ' }),
      'com.example.orders'
    ),
    'src/main/java/com/example/orders/infrastructure/jooq/JooqOrderRepositoryAdapter.java'
  );

  assert.match(blocking, /dsl\.update\(ORDERS\)/);
  assert.match(blocking, /if \(updated == 0\)/);
  assert.match(reactive, /Mono\.from\(dsl\.update\(ORDERS\)/);
  assert.match(reactive, /flatMap\(updated -> updated == 0/);
  assert.match(blocking, /table\("orders"\)/);
  assert.match(blocking, /field\("id", UUID\.class\)/);
  assert.doesNotMatch(`${blocking}\n${reactive}`, /onDuplicateKeyUpdate/);
  assert.doesNotMatch(`${blocking}\n${reactive}`, /table\(name\(|field\(name\(/);
});

test('reactive jOOQ rejects databases unsupported by the OSS dialect', () => {
  assert.deepEqual(databaseOptions('Reactive', 'jOOQ'), ['PostgreSQL', 'H2']);
  assert.deepEqual(databaseOptions('Non-Reactive', 'jOOQ'), [
    'PostgreSQL',
    'H2',
    'MSSQL Server',
    'Oracle'
  ]);

  for (const database of ['MSSQL Server', 'Oracle']) {
    assert.throws(
      () => renderGeneratedServiceFiles(
        serviceAnswers({ stackMode: 'Reactive', persistenceLayer: 'jOOQ', database }),
        'com.example.orders'
      ),
      /Reactive jOOQ supports only PostgreSQL and H2/
    );
  }
});

test('Flyway generation creates a database-specific aggregate schema', () => {
  const databaseTypes = [
    ['PostgreSQL', 'UUID'],
    ['H2', 'UUID'],
    ['MSSQL Server', 'UNIQUEIDENTIFIER'],
    ['Oracle', 'RAW(16)']
  ];

  for (const [database, idType] of databaseTypes) {
    const files = renderGeneratedServiceFiles(
      serviceAnswers({ persistenceLayer: 'Plain JDBC', migrationTool: 'Flyway', database }),
      'com.example.orders'
    );
    const migration = generatedFile(files, 'src/main/resources/db/migration/V1__create_orders.sql');

    assert.match(migration, /CREATE TABLE orders/);
    assert.match(migration, new RegExp(`id ${idType.replace(/[()]/g, '\\$&')} PRIMARY KEY`));
    assert.match(migration, /name (?:VARCHAR|VARCHAR2)\(255(?: CHAR)?\) NOT NULL/);
  }
});

test('Spring Boot 3 Flyway builds include the selected database module', () => {
  const modules = [
    ['PostgreSQL', 'flyway-database-postgresql'],
    ['MSSQL Server', 'flyway-sqlserver'],
    ['Oracle', 'flyway-database-oracle']
  ];

  for (const [database, artifact] of modules) {
    const answers = serviceAnswers({ persistenceLayer: 'Plain JDBC', migrationTool: 'Flyway', database });
    assert.match(renderPomXml(answers), new RegExp(`<artifactId>${artifact}</artifactId>`));
    assert.match(renderGradle({ ...answers, buildTool: 'Gradle' }), new RegExp(`org\\.flywaydb:${artifact}`));
  }

  const h2 = serviceAnswers({ persistenceLayer: 'Plain JDBC', migrationTool: 'Flyway', database: 'H2' });
  const boot2 = serviceAnswers({
    stackMode: 'Reactive',
    springBootVersion: '2.7.18',
    persistenceLayer: 'jOOQ',
    migrationTool: 'Flyway',
    database: 'PostgreSQL'
  });
  assert.doesNotMatch(renderPomXml(h2), /flyway-database-|flyway-sqlserver/);
  assert.doesNotMatch(renderPomXml(boot2), /flyway-database-|flyway-sqlserver/);
});

test('Liquibase generation creates a database-specific aggregate changelog', () => {
  const databaseTypes = [
    ['PostgreSQL', 'UUID'],
    ['H2', 'UUID'],
    ['MSSQL Server', 'UNIQUEIDENTIFIER'],
    ['Oracle', 'RAW(16)']
  ];

  for (const [database, idType] of databaseTypes) {
    const files = renderGeneratedServiceFiles(
      serviceAnswers({ persistenceLayer: 'Hibernate (JPA)', migrationTool: 'Liquibase', database }),
      'com.example.orders'
    );
    const changelog = generatedFile(
      files,
      'src/main/resources/db/changelog/db.changelog-master.yaml'
    );

    assert.match(changelog, /tableName: orders/);
    assert.match(changelog, new RegExp(`type: ${idType.replace(/[()]/g, '\\$&')}`));
    assert.match(changelog, /primaryKey: true/);
    assert.match(changelog, /name: name\n\s+type: (?:VARCHAR|VARCHAR2)\(255(?: CHAR)?\)/);
  }
});

test('persistence None does not generate a database schema', () => {
  for (const migrationTool of ['Flyway', 'Liquibase']) {
    const files = renderGeneratedServiceFiles(
      serviceAnswers({ persistenceLayer: 'None', migrationTool }),
      'com.example.orders'
    );

    assert.equal(files.filter((file) => file.path.includes('/db/')).length, 0);
  }
});

test('JPA adapters use version-aware javax and jakarta persistence imports', () => {
  const boot2 = serviceAnswers({ springBootVersion: '2.7.18' });
  const boot3 = serviceAnswers({ springBootVersion: '3.5.4' });
  const boot2Adapter = generatedFile(
    renderGeneratedServiceFiles(boot2, 'com.example.orders'),
    'src/main/java/com/example/orders/infrastructure/jpa/JpaOrderRepositoryAdapter.java'
  );
  const boot3Adapter = generatedFile(
    renderGeneratedServiceFiles(boot3, 'com.example.orders'),
    'src/main/java/com/example/orders/infrastructure/jpa/JpaOrderRepositoryAdapter.java'
  );

  assert.equal(javaPersistenceImport(boot2), 'javax.persistence');
  assert.equal(javaPersistenceImport(boot3), 'jakarta.persistence');
  assert.match(boot2Adapter, /import javax\.persistence\.Entity;/);
  assert.doesNotMatch(boot2Adapter, /jakarta\.persistence/);
  assert.match(boot3Adapter, /import jakarta\.persistence\.Entity;/);
  assert.doesNotMatch(boot3Adapter, /javax\.persistence/);
});

test('renders the QueryDSL Jakarta API and processor in Maven output', () => {
  const pom = renderPomXml(queryDslAnswers('Maven'));

  assert.match(pom, /<groupId>com\.querydsl<\/groupId>\s*<artifactId>querydsl-jpa<\/artifactId>\s*<version>5\.1\.0<\/version>\s*<classifier>jakarta<\/classifier>/);
  assert.match(pom, /<artifactId>maven-compiler-plugin<\/artifactId>[\s\S]*<annotationProcessorPaths>[\s\S]*<groupId>com\.querydsl<\/groupId>\s*<artifactId>querydsl-apt<\/artifactId>\s*<version>5\.1\.0<\/version>\s*<classifier>jakarta<\/classifier>[\s\S]*<\/annotationProcessorPaths>/);
});

test('renders the QueryDSL Jakarta API and processor in Gradle output', () => {
  const gradle = renderGradle(queryDslAnswers('Gradle'));

  assert.match(gradle, /implementation\("com\.querydsl:querydsl-jpa:5\.1\.0:jakarta"\)/);
  assert.match(gradle, /annotationProcessor\("com\.querydsl:querydsl-apt:5\.1\.0:jakarta"\)/);
});

test('adds the Jakarta Persistence API to QueryDSL processor paths', () => {
  const pom = renderPomXml(queryDslAnswers('Maven'));
  const gradle = renderGradle(queryDslAnswers('Gradle'));

  assert.match(pom, /<annotationProcessorPaths>[\s\S]*<groupId>jakarta\.persistence<\/groupId>\s*<artifactId>jakarta\.persistence-api<\/artifactId>\s*<version>3\.1\.0<\/version>[\s\S]*<\/annotationProcessorPaths>/);
  assert.match(gradle, /annotationProcessor\("jakarta\.persistence:jakarta\.persistence-api:3\.1\.0"\)/);
});

test('renders javax QueryDSL and Persistence API coordinates for Spring Boot 2.x', () => {
  const answers = { ...queryDslAnswers('Maven'), springBootVersion: '2.7.18' };
  const pom = renderPomXml(answers);
  const gradle = renderGradle({ ...answers, buildTool: 'Gradle' });

  assert.match(pom, /<groupId>com\.querydsl<\/groupId>\s*<artifactId>querydsl-jpa<\/artifactId>\s*<version>5\.1\.0<\/version>\s*<\/dependency>/);
  assert.match(pom, /<artifactId>maven-compiler-plugin<\/artifactId>[\s\S]*<groupId>com\.querydsl<\/groupId>\s*<artifactId>querydsl-apt<\/artifactId>\s*<version>5\.1\.0<\/version>\s*<classifier>jpa<\/classifier>[\s\S]*<groupId>javax\.persistence<\/groupId>\s*<artifactId>javax\.persistence-api<\/artifactId>\s*<version>2\.2<\/version>/);
  assert.match(gradle, /implementation\("com\.querydsl:querydsl-jpa:5\.1\.0"\)/);
  assert.match(gradle, /annotationProcessor\("com\.querydsl:querydsl-apt:5\.1\.0:jpa"\)/);
  assert.match(gradle, /annotationProcessor\("javax\.persistence:javax\.persistence-api:2\.2"\)/);
  assert.doesNotMatch(pom, /jakarta\.persistence/);
  assert.doesNotMatch(gradle, /jakarta/);
});

test('renders the selected Spring Boot version in Maven and Gradle output', () => {
  const answers = { ...queryDslAnswers('Maven'), springBootVersion: '2.7.18' };
  const pom = renderPomXml(answers);
  const gradle = renderGradle({ ...answers, buildTool: 'Gradle' });

  assert.equal(SPRING_BOOT_VERSION, '3.5.4');
  assert.match(pom, /<version>2\.7\.18<\/version>/);
  assert.match(gradle, /id\("org\.springframework\.boot"\) version "2\.7\.18"/);
  assert.doesNotMatch(pom, /<version>3\.5\.4<\/version>/);
  assert.doesNotMatch(gradle, /version "3\.5\.4"/);
});

test('accepts supported Java versions', () => {
  assert.equal(validateJavaVersion('17'), undefined);
  assert.equal(validateJavaVersion('21'), undefined);
  assert.equal(validateJavaVersion('25'), undefined);
});

test('rejects an unsupported Java version', () => {
  assert.match(validateJavaVersion('16'), /at least 17/);
  assert.match(validateJavaVersion('21.0'), /whole number/);
  assert.match(validateJavaVersion('twenty-one'), /whole number/);
});

test('accepts a safe service folder', () => {
  assert.equal(validateServiceFolder('services/order-service'), undefined);
});

test('rejects an unsafe service folder', () => {
  assert.match(validateServiceFolder('../order-service'), /relative path/);
  assert.match(validateServiceFolder('/tmp/order-service'), /relative path/);
  assert.match(validateServiceFolder('services/../order-service'), /parent-directory/);
});

test('accepts a Java package name', () => {
  assert.equal(validateBasePackage('com.example.orders'), undefined);
});

test('rejects an invalid Java package name', () => {
  assert.match(validateBasePackage('com.example.123orders'), /Java package name/);
  assert.match(validateBasePackage('com.example.orders-service'), /Java package name/);
});

test('accepts a Maven-safe service name', () => {
  assert.equal(validateServiceName('order-service'), undefined);
});

test('rejects an invalid service name', () => {
  assert.match(validateServiceName('../order-service'), /lowercase letters/);
  assert.match(validateServiceName('Order Service'), /lowercase letters/);
});

test('accepts supported Spring Boot versions', () => {
  assert.equal(validateSpringBootVersion('2.7.18'), undefined);
  assert.equal(validateSpringBootVersion('3.5.4'), undefined);
});

test('rejects invalid Spring Boot versions', () => {
  assert.match(validateSpringBootVersion('3.5'), /semantic version/);
  assert.match(validateSpringBootVersion('v3.5.4'), /semantic version/);
  assert.match(validateSpringBootVersion('3.5.4.RELEASE'), /semantic version/);
});

test('accepts valid aggregate names', () => {
  assert.equal(validateAggregateName('Order'), undefined);
  assert.equal(validateAggregateName('OrderItem'), undefined);
});

test('derives the aggregate prompt default from the selected service name', () => {
  assert.equal(defaultAggregateName('order-service'), 'Order');
  assert.equal(defaultAggregateName('billing-api'), 'BillingApi');
});

test('rejects invalid aggregate names', () => {
  assert.match(validateAggregateName('1Order'), /Java class name/);
  assert.match(validateAggregateName('Order-Item'), /Java class name/);
});

test('returns reactive persistence options without blocking technologies', () => {
  assert.deepEqual(persistenceOptions('Reactive'), ['None', 'Spring Data R2DBC', 'jOOQ']);
  assert.deepEqual(persistenceOptions('Non-Reactive'), [
    'None',
    'Hibernate (JPA)',
    'Plain JDBC',
    'jOOQ',
    'QueryDSL (JPA)'
]);
});

test('renders R2DBC starter and PostgreSQL driver for reactive Spring Data R2DBC', () => {
  const answers = {
    ...queryDslAnswers('Maven'),
    stackMode: 'Reactive',
    persistenceLayer: 'Spring Data R2DBC'
  };
  const pom = renderPomXml(answers);
  const gradle = renderGradle({ ...answers, buildTool: 'Gradle' });

  assert.match(pom, /<artifactId>spring-boot-starter-webflux<\/artifactId>/);
  assert.match(pom, /<artifactId>spring-boot-starter-data-r2dbc<\/artifactId>/);
  assert.match(pom, /<groupId>org.postgresql<\/groupId>\s*<artifactId>r2dbc-postgresql<\/artifactId>/);
  assert.match(gradle, /implementation\("org\.springframework\.boot:spring-boot-starter-data-r2dbc"\)/);
  assert.match(gradle, /runtimeOnly\("org\.postgresql:r2dbc-postgresql"\)/);
  assert.doesNotMatch(pom, /spring-boot-starter-jdbc/);
  assert.doesNotMatch(gradle, /postgresql:postgresql/);
});

test('adds the ConnectionFactory and DSLContext dependencies for reactive jOOQ', () => {
  const answers = {
    ...queryDslAnswers('Maven'),
    stackMode: 'Reactive',
    persistenceLayer: 'jOOQ'
  };
  const pom = renderPomXml(answers);
  const gradle = renderGradle({ ...answers, buildTool: 'Gradle' });

  assert.match(pom, /<artifactId>spring-boot-starter-webflux<\/artifactId>/);
  assert.match(pom, /<groupId>org\.jooq<\/groupId>\s*<artifactId>jooq<\/artifactId>/);
  assert.match(pom, /<artifactId>spring-boot-starter-data-r2dbc<\/artifactId>/);
  assert.match(pom, /<artifactId>r2dbc-postgresql<\/artifactId>/);
  assert.match(gradle, /implementation\("org\.jooq:jooq"\)/);
  assert.match(gradle, /implementation\("org\.springframework\.boot:spring-boot-starter-data-r2dbc"\)/);
  assert.match(gradle, /runtimeOnly\("org\.postgresql:r2dbc-postgresql"\)/);
  assert.doesNotMatch(pom, /spring-boot-starter-jooq/);
  assert.doesNotMatch(gradle, /spring-boot-starter-jooq/);
});

test('pins a reactive-capable jOOQ version for Spring Boot 2', () => {
  const answers = serviceAnswers({
    stackMode: 'Reactive',
    springBootVersion: '2.7.18',
    persistenceLayer: 'jOOQ'
  });
  const pom = renderPomXml(answers);
  const gradle = renderGradle({ ...answers, buildTool: 'Gradle' });

  assert.match(pom, /<groupId>org\.jooq<\/groupId>\s*<artifactId>jooq<\/artifactId>\s*<version>3\.17\.35<\/version>/);
  assert.match(gradle, /implementation\("org\.jooq:jooq:3\.17\.35"\)/);
});

test('renders the selected non-reactive persistence dependencies without reactive dependencies', () => {
  const cases = [
    ['Hibernate (JPA)', /spring-boot-starter-data-jpa/, /spring-boot-starter-jdbc/],
    ['Plain JDBC', /spring-boot-starter-jdbc/, /spring-boot-starter-data-jpa/],
    ['jOOQ', /spring-boot-starter-jooq/, /spring-boot-starter-data-r2dbc/],
    ['QueryDSL (JPA)', /querydsl-jpa/, /spring-boot-starter-data-r2dbc/]
  ];

  for (const [persistenceLayer, expected, excluded] of cases) {
    const pom = renderPomXml({ ...queryDslAnswers('Maven'), persistenceLayer });
    const gradle = renderGradle({ ...queryDslAnswers('Gradle'), persistenceLayer });

    assert.match(pom, expected);
    assert.match(gradle, expected);
    assert.doesNotMatch(pom, excluded);
    assert.doesNotMatch(gradle, excluded);
    if (persistenceLayer !== 'QueryDSL (JPA)') {
      assert.doesNotMatch(pom, /annotationProcessorPaths/);
      assert.doesNotMatch(gradle, /annotationProcessor\(/);
    }
  }
});

test('renders reactive application configuration with an R2DBC URL', () => {
  const yaml = renderApplicationYaml({
    ...queryDslAnswers('Maven'),
    stackMode: 'Reactive',
    persistenceLayer: 'Spring Data R2DBC'
  });

  assert.match(yaml, /r2dbc:\n    url: r2dbc:postgresql:\/\/localhost:5432\/appdb/);
  assert.doesNotMatch(yaml, /datasource:/);
  assert.doesNotMatch(yaml, /jdbc:/);
});

test('adds the JDBC migration driver and migration URL for reactive Flyway', () => {
  const answers = {
    ...queryDslAnswers('Maven'),
    stackMode: 'Reactive',
    persistenceLayer: 'Spring Data R2DBC',
    migrationTool: 'Flyway'
  };
  const pom = renderPomXml(answers);
  const yaml = renderApplicationYaml(answers);

  assert.match(pom, /<artifactId>r2dbc-postgresql<\/artifactId>/);
  assert.match(pom, /<artifactId>postgresql<\/artifactId>[\s\S]*<scope>runtime<\/scope>/);
  assert.match(pom, /<groupId>org\.springframework<\/groupId>\s*<artifactId>spring-jdbc<\/artifactId>/);
  assert.match(yaml, /flyway:\n    enabled: true\n    url: jdbc:postgresql:\/\/localhost:5432\/appdb/);
});

test('adds the JDBC migration driver and migration URL for reactive Liquibase', () => {
  const answers = {
    ...queryDslAnswers('Gradle'),
    stackMode: 'Reactive',
    persistenceLayer: 'jOOQ',
    migrationTool: 'Liquibase'
  };
  const gradle = renderGradle(answers);
  const yaml = renderApplicationYaml(answers);

  assert.match(gradle, /runtimeOnly\("org\.postgresql:postgresql"\)/);
  assert.match(yaml, /liquibase:\n    enabled: true\n    url: jdbc:postgresql:\/\/localhost:5432\/appdb/);
});

test('declares reactive jOOQ ConnectionFactory wiring contract', () => {
  const answers = {
    ...queryDslAnswers('Maven'),
    stackMode: 'Reactive',
    persistenceLayer: 'jOOQ'
  };
  const yaml = renderApplicationYaml(answers);
  const gradle = renderGradle({ ...answers, buildTool: 'Gradle' });

  assert.match(yaml, /jooq:\n    sql-dialect: POSTGRES/);
  assert.match(gradle, /spring-boot-starter-data-r2dbc/);
});

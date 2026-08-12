const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function loadVscodeMock(request, parent, isMain) {
  if (request === 'vscode') {
    return {};
  }

  return originalLoad.call(this, request, parent, isMain);
};

const {
  SPRING_BOOT_VERSION,
  defaultAggregateName,
  persistenceOptions,
  renderApplicationYaml,
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

function queryDslAnswers(buildTool) {
  return {
    stackMode: 'Non-Reactive',
    serviceName: 'order-service',
    folderName: 'services/order-service',
    basePackage: 'com.example.orders',
    buildTool,
    springBootVersion: '3.5.4',
    javaVersion: '21',
    useTdd: false,
    tddTool: 'Cucumber',
    aggregateName: 'Order',
    persistenceLayer: 'QueryDSL (JPA)',
    database: 'PostgreSQL',
    migrationTool: 'None'
  };
}

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

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
  renderGradle,
  renderPomXml,
  validateBasePackage,
  validateJavaVersion,
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
    javaVersion: '21',
    useTdd: false,
    tddTool: 'Cucumber',
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

test('renders one Spring Boot version in Maven and Gradle output', () => {
  const pom = renderPomXml(queryDslAnswers('Maven'));
  const gradle = renderGradle(queryDslAnswers('Gradle'));

  assert.equal(SPRING_BOOT_VERSION, '3.5.4');
  assert.match(pom, new RegExp(`<version>${SPRING_BOOT_VERSION}<\\/version>`));
  assert.match(gradle, new RegExp(`id\\("org\\.springframework\\.boot"\\) version "${SPRING_BOOT_VERSION}"`));
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

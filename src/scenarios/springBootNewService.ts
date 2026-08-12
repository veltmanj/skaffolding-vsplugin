import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { createWorkspaceDirectory, resolveWorkspacePath } from './fileSafety';
import { chooseFileWriteDecision, writeWorkspaceFileWithExplicitOverwrite } from './fileWriter';
import { renderGeneratedServiceFiles } from './springBootServiceTemplates';
import { renderGeneratedTestFiles } from './springBootTestTemplates';
import { Scenario } from './types';

export { javaPersistenceImport, persistencePackage, renderGeneratedServiceFiles } from './springBootServiceTemplates';
export { renderGeneratedTestFiles } from './springBootTestTemplates';

export type StackMode = 'Reactive' | 'Non-Reactive';
type BuildTool = 'Maven' | 'Gradle';
export type PersistenceLayer = 'None' | 'Hibernate (JPA)' | 'Plain JDBC' | 'Spring Data R2DBC' | 'jOOQ' | 'QueryDSL (JPA)';
export type Database = 'PostgreSQL' | 'H2' | 'MSSQL Server' | 'Oracle';
type MigrationTool = 'None' | 'Flyway' | 'Liquibase';
type TddTool = 'Cucumber';

export const SPRING_BOOT_VERSION = '3.5.4';
const QUERYDSL_VERSION = '5.1.0';
const REACTIVE_JOOQ_BOOT_2_VERSION = '3.17.35';
const JAKARTA_PERSISTENCE_API_VERSION = '3.1.0';
const JAVAX_PERSISTENCE_API_VERSION = '2.2';
const CUCUMBER_VERSION = '7.20.1';
const MAVEN_SUREFIRE_VERSION = '3.5.4';
const SPRING_BOOT_SERVICE_MARKERS = [
  'pom.xml',
  'build.gradle.kts',
  'settings.gradle.kts',
  path.join('src', 'main', 'resources', 'application.yml'),
  'ARCHITECTURE_NOTES.md'
];

export interface SpringServiceAnswers {
  stackMode: StackMode;
  springBootVersion: string;
  serviceName: string;
  aggregateName: string;
  folderName: string;
  basePackage: string;
  buildTool: BuildTool;
  javaVersion: string;
  useTdd: boolean;
  tddTool: TddTool;
  persistenceLayer: PersistenceLayer;
  database: Database;
  migrationTool: MigrationTool;
}

export const createSpringBootServiceScenario: Scenario = {
  id: 'spring.boot.create-service',
  label: 'Spring Boot: Create Service (Clean Architecture)',
  description: 'Create a new Spring Boot service with guided setup options.',
  run: async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showErrorMessage('Open a workspace folder first.');
      return;
    }

    const answers = await askQuestions();
    if (!answers) {
      return;
    }

    const existingMarker = await findExistingSpringBootServiceMarker(
      folder.uri.fsPath,
      answers.folderName
    );
    if (existingMarker) {
      vscode.window.showErrorMessage(
        `Folder ${answers.folderName} already contains a Spring Boot service (${existingMarker}). Choose an empty service folder.`
      );
      return;
    }

    const appPackage = normalizePackage(answers.basePackage);
    const className = toPascalCase(answers.serviceName) + 'Application';
    const packagePath = appPackage.replaceAll('.', '/');
    const directories = [
      answers.folderName,
      path.join(answers.folderName, 'src/main/java', packagePath),
      path.join(answers.folderName, 'src/main/resources'),
      path.join(answers.folderName, 'src/test/java', packagePath)
    ];

    for (const directory of directories) {
      const outputPath = resolveWorkspacePath(folder.uri.fsPath, directory);
      await createWorkspaceDirectory(folder.uri.fsPath, outputPath);
    }

    const generatedFiles: Array<{ path: string; content: string }> = [
      {
        path: answers.buildTool === 'Maven' ? 'pom.xml' : 'build.gradle.kts',
        content: answers.buildTool === 'Maven' ? renderPomXml(answers) : renderGradle(answers)
      },
      ...(answers.buildTool === 'Gradle'
        ? [{ path: 'settings.gradle.kts', content: `rootProject.name = "${answers.serviceName}"\n` }]
        : []),
      {
        path: path.join('src/main/java', packagePath, `${className}.java`),
        content: renderMainClass(appPackage, className)
      },
      { path: 'src/main/resources/application.yml', content: renderApplicationYaml(answers) },
      { path: 'ARCHITECTURE_NOTES.md', content: renderArchitectureNotes(answers, appPackage) },
      ...renderGeneratedServiceFiles(answers, appPackage),
      ...(answers.useTdd ? renderGeneratedTestFiles(answers, appPackage) : [])
    ];

    let createdCount = 0;
    let overwrittenCount = 0;
    let skippedCount = 0;
    for (const file of generatedFiles) {
      const outputPath = resolveWorkspacePath(folder.uri.fsPath, path.join(answers.folderName, file.path));
      const outputUri = vscode.Uri.file(outputPath);
      await createWorkspaceDirectory(folder.uri.fsPath, path.dirname(outputPath));
      const result = await writeWorkspaceFileWithExplicitOverwrite(
        folder.uri.fsPath,
        outputUri,
        file.content,
        () => chooseFileWriteDecision(path.join(answers.folderName, file.path))
      );

      if (result === 'cancelled') {
        vscode.window.showInformationMessage(
          `Spring Boot service cancelled. Files created: ${createdCount}. Files overwritten: ${overwrittenCount}. Files skipped: ${skippedCount}.`
        );
        return;
      }
      if (result === 'skipped') {
        skippedCount += 1;
        continue;
      }
      if (result === 'created') {
        createdCount += 1;
      } else {
        overwrittenCount += 1;
      }
    }

    vscode.window.showInformationMessage(
      `Spring Boot service complete in ${answers.folderName}. Files created: ${createdCount}. Files overwritten: ${overwrittenCount}. Files skipped: ${skippedCount}.`
    );
  }
};

async function findExistingSpringBootServiceMarker(
  workspaceRoot: string,
  folderName: string
): Promise<string | undefined> {
  const serviceRoot = resolveWorkspacePath(workspaceRoot, folderName);
  try {
    const entries = await fs.readdir(serviceRoot);
    if (entries.length === 0) {
      return undefined;
    }
  } catch (error) {
    if (isMissingPathError(error)) {
      return undefined;
    }
    throw error;
  }

  for (const marker of SPRING_BOOT_SERVICE_MARKERS) {
    try {
      await fs.lstat(path.join(serviceRoot, marker));
      return marker;
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error;
      }
    }
  }
  return undefined;
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function askQuestions(): Promise<SpringServiceAnswers | undefined> {
  const stackMode = await pick<StackMode>('Reactive or Non-Reactive?', ['Reactive', 'Non-Reactive']);
  if (!stackMode) {
    return undefined;
  }

  const springBootVersion = await input('Spring Boot version', SPRING_BOOT_VERSION, validateSpringBootVersion);
  if (!springBootVersion) {
    return undefined;
  }

  const serviceName = await input('Service name', 'order-service', validateServiceName);
  if (!serviceName) {
    return undefined;
  }

  const aggregateName = await input('Aggregate name', defaultAggregateName(serviceName), validateAggregateName);
  if (!aggregateName) {
    return undefined;
  }

  const folderName = await input('Folder name', serviceName, validateServiceFolder);
  if (!folderName) {
    return undefined;
  }

  const basePackage = await input('Base package name', 'com.example.orderservice', validateBasePackage);
  if (!basePackage) {
    return undefined;
  }

  const buildTool = await pick<BuildTool>('Build tool', ['Maven', 'Gradle']);
  if (!buildTool) {
    return undefined;
  }

  const javaVersion = await input(
    'Java version',
    defaultJavaVersion(springBootVersion),
    (value) => validateJavaVersion(value, springBootVersion)
  );
  if (!javaVersion) {
    return undefined;
  }

  const useTddPick = await pick<'Yes' | 'No'>('Use test-driven development?', ['Yes', 'No']);
  if (!useTddPick) {
    return undefined;
  }

  const useTdd = useTddPick === 'Yes';
  let tddTool: TddTool = 'Cucumber';
  if (useTdd) {
    const selectedTool = await pick<TddTool>('TDD tool', ['Cucumber']);
    if (!selectedTool) {
      return undefined;
    }
    tddTool = selectedTool;
  }

  const persistenceLayer = await pick<PersistenceLayer>('Persistence layer', persistenceOptions(stackMode));
  if (!persistenceLayer) {
    return undefined;
  }

  let database: Database = 'H2';
  let migrationTool: MigrationTool = 'None';
  if (persistenceLayer !== 'None') {
    const selectedDatabase = await pick<Database>('Database', databaseOptions(stackMode, persistenceLayer));
    if (!selectedDatabase) {
      return undefined;
    }
    database = selectedDatabase;

    const selectedMigrationTool = await pick<MigrationTool>('Schema migration tool', ['None', 'Flyway', 'Liquibase']);
    if (!selectedMigrationTool) {
      return undefined;
    }
    migrationTool = selectedMigrationTool;
  }

  return {
    stackMode,
    springBootVersion,
    serviceName,
    aggregateName,
    folderName,
    basePackage,
    buildTool,
    javaVersion,
    useTdd,
    tddTool,
    persistenceLayer,
    database,
    migrationTool
  };
}

export function persistenceOptions(stackMode: StackMode): PersistenceLayer[] {
  if (stackMode === 'Reactive') {
    return ['None', 'Spring Data R2DBC', 'jOOQ'];
  }
  return ['None', 'Hibernate (JPA)', 'Plain JDBC', 'jOOQ', 'QueryDSL (JPA)'];
}

export function databaseOptions(stackMode: StackMode, persistenceLayer: PersistenceLayer): Database[] {
  if (stackMode === 'Reactive' && persistenceLayer === 'jOOQ') {
    return ['PostgreSQL', 'H2'];
  }
  return ['PostgreSQL', 'H2', 'MSSQL Server', 'Oracle'];
}

export function defaultAggregateName(serviceName: string): string {
  return toPascalCase(serviceName.replace(/-service$/, ''));
}

async function pick<T extends string>(title: string, options: T[]): Promise<T | undefined> {
  const selected = await vscode.window.showQuickPick(options, { placeHolder: title });
  return selected as T | undefined;
}

async function input(
  prompt: string,
  value: string,
  validateInput: (text: string) => string | undefined = validateRequiredValue
): Promise<string | undefined> {
  const entered = await vscode.window.showInputBox({
    prompt,
    value,
    ignoreFocusOut: true,
    validateInput: (text) => validateInput(text.trim())
  });
  return entered?.trim();
}

export function renderPomXml(a: SpringServiceAnswers): string {
  const deps = buildDependencyBlocks(a);
  const queryDslCompilerPlugin = renderQueryDslMavenCompilerPlugin(a);
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>${a.springBootVersion}</version>
    <relativePath/>
  </parent>
  <groupId>${normalizePackage(a.basePackage)}</groupId>
  <artifactId>${a.serviceName}</artifactId>
  <version>0.0.1-SNAPSHOT</version>
  <name>${a.serviceName}</name>
  <description>Generated by Skaffolding VS Plugin</description>

  <properties>
    <java.version>${a.javaVersion}</java.version>
${a.useTdd ? `    <cucumber.version>${CUCUMBER_VERSION}</cucumber.version>
` : ''}  </properties>

  <dependencies>
${deps}
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
${renderMavenTestDependencies(a)}
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
${renderMavenTestPlugin(a)}
${queryDslCompilerPlugin}
    </plugins>
  </build>
</project>
`;
}

export function renderGradle(a: SpringServiceAnswers): string {
  const deps = buildGradleDependencies(a);
  return `plugins {
    java
    id("org.springframework.boot") version "${a.springBootVersion}"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "${normalizePackage(a.basePackage)}"
version = "0.0.1-SNAPSHOT"
${a.useTdd ? `
val cucumberVersion = "${CUCUMBER_VERSION}"
` : ''}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(${safeInt(a.javaVersion, 25)})
    }
}

repositories {
    mavenCentral()
}

dependencies {
${deps}
  testImplementation("org.springframework.boot:spring-boot-starter-test")
${renderGradleTestDependencies(a)}
}

tasks.withType<Test> {
    useJUnitPlatform()
}
`;
}

function renderMainClass(pkg: string, className: string): string {
  return `package ${pkg};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ${className} {

    public static void main(String[] args) {
        SpringApplication.run(${className}.class, args);
    }
}
`;
}

export function renderApplicationYaml(a: SpringServiceAnswers): string {
  const reactivePersistence = a.stackMode === 'Reactive' && a.persistenceLayer !== 'None';
  const db = a.persistenceLayer === 'None' ? '' : reactivePersistence ? r2dbcYamlBlock(a.database) : dbYamlBlock(a.database);
  const jooq = reactivePersistence && a.persistenceLayer === 'jOOQ' ? jooqYamlBlock(a.database) : '';
  const migration = a.persistenceLayer === 'None'
    ? ''
    : migrationYamlBlock(a.migrationTool, a.database, a.stackMode === 'Reactive');
  return `spring:
  application:
    name: ${a.serviceName}
${db}${jooq}${migration}`;
}

function renderArchitectureNotes(a: SpringServiceAnswers, pkg: string): string {
  const hasPersistence = a.persistenceLayer !== 'None';
  return `# Service Setup Notes

## Selected Options
- Stack mode: ${a.stackMode}
- Spring Boot version: ${a.springBootVersion}
- Service name: ${a.serviceName}
- Aggregate name: ${a.aggregateName}
- Base package: ${pkg}
- Build tool: ${a.buildTool}
- Java version: ${a.javaVersion}
- TDD enabled: ${a.useTdd ? 'Yes' : 'No'}
- TDD tool: ${a.useTdd ? a.tddTool : 'Not selected'}
- Persistence layer: ${a.persistenceLayer}
- Database: ${hasPersistence ? a.database : 'Not selected'}
- Migration tool: ${hasPersistence ? a.migrationTool : 'Not selected'}

## Next Step
- Add domain, application, and infrastructure modules.
- Add CI pipeline and test profile.
`;
}

function buildDependencyBlocks(a: SpringServiceAnswers): string {
  const hasPersistence = a.persistenceLayer !== 'None';
  const lines: string[] = [
    dependencyXml(a.stackMode === 'Reactive' ? 'spring-boot-starter-webflux' : 'spring-boot-starter-web'),
    dependencyXml('spring-boot-starter-validation')
  ];

  if (a.persistenceLayer === 'Hibernate (JPA)' || a.persistenceLayer === 'QueryDSL (JPA)') {
    lines.push(dependencyXml('spring-boot-starter-data-jpa'));
  }
  if (a.persistenceLayer === 'QueryDSL (JPA)') {
    lines.push(queryDslDependencyXml(a));
  }
  if (a.persistenceLayer === 'Plain JDBC') {
    lines.push(dependencyXml('spring-boot-starter-jdbc'));
  }
  if (a.persistenceLayer === 'jOOQ') {
    if (a.stackMode === 'Reactive') {
      lines.push(dependencyXml('jooq', 'org.jooq', reactiveJooqVersion(a)));
      lines.push(dependencyXml('spring-boot-starter-data-r2dbc'));
    } else {
      lines.push(dependencyXml('spring-boot-starter-jooq'));
    }
  }
  if (a.persistenceLayer === 'Spring Data R2DBC') {
    lines.push(dependencyXml('spring-boot-starter-data-r2dbc'));
  }
  const reactivePersistence = a.stackMode === 'Reactive' && a.persistenceLayer !== 'None';
  if (a.persistenceLayer !== 'None') {
    lines.push(driverDependencyXml(a.database, reactivePersistence));
  }
  if (hasPersistence && a.stackMode === 'Reactive' && a.migrationTool !== 'None') {
    lines.push(dependencyXml('spring-jdbc', 'org.springframework'));
    lines.push(driverDependencyXml(a.database, false));
  }
  if (hasPersistence && a.migrationTool === 'Flyway') {
    lines.push(dependencyXml('flyway-core', 'org.flywaydb'));
    const databaseModule = flywayDatabaseModule(a);
    if (databaseModule) {
      lines.push(dependencyXml(databaseModule, 'org.flywaydb'));
    }
  }
  if (hasPersistence && a.migrationTool === 'Liquibase') {
    lines.push(dependencyXml('liquibase-core', 'org.liquibase'));
  }

  return lines.join('\n');
}

function renderMavenTestDependencies(a: SpringServiceAnswers): string {
  if (!a.useTdd) {
    return '';
  }
  return `    <dependency>
      <groupId>io.cucumber</groupId>
      <artifactId>cucumber-java</artifactId>
      <version>\${cucumber.version}</version>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>io.cucumber</groupId>
      <artifactId>cucumber-junit-platform-engine</artifactId>
      <version>\${cucumber.version}</version>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.junit.platform</groupId>
      <artifactId>junit-platform-suite</artifactId>
      <scope>test</scope>
    </dependency>`;
}

function renderGradleTestDependencies(a: SpringServiceAnswers): string {
  if (!a.useTdd) {
    return '';
  }
  return `  testImplementation("io.cucumber:cucumber-java:$cucumberVersion")
  testImplementation("io.cucumber:cucumber-junit-platform-engine:$cucumberVersion")
  testImplementation("org.junit.platform:junit-platform-suite")`;
}

function renderMavenTestPlugin(a: SpringServiceAnswers): string {
  if (!a.useTdd) {
    return '';
  }
  return `      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>${MAVEN_SUREFIRE_VERSION}</version>
        <configuration>
          <properties>
            <configurationParameters>
              cucumber.junit-platform.naming-strategy=long
            </configurationParameters>
          </properties>
        </configuration>
      </plugin>`;
}

function buildGradleDependencies(a: SpringServiceAnswers): string {
  const hasPersistence = a.persistenceLayer !== 'None';
  const lines: string[] = [
    gradleDependency(a.stackMode === 'Reactive' ? 'org.springframework.boot:spring-boot-starter-webflux' : 'org.springframework.boot:spring-boot-starter-web'),
    gradleDependency('org.springframework.boot:spring-boot-starter-validation')
  ];

  if (a.persistenceLayer === 'Hibernate (JPA)' || a.persistenceLayer === 'QueryDSL (JPA)') {
    lines.push(gradleDependency('org.springframework.boot:spring-boot-starter-data-jpa'));
  }
  if (a.persistenceLayer === 'QueryDSL (JPA)') {
    const namespace = persistenceNamespace(a.springBootVersion);
    const queryDslJpa = namespace === 'jakarta'
      ? `com.querydsl:querydsl-jpa:${QUERYDSL_VERSION}:jakarta`
      : `com.querydsl:querydsl-jpa:${QUERYDSL_VERSION}`;
    const queryDslAptClassifier = namespace === 'jakarta' ? 'jakarta' : 'jpa';
    const persistenceApi = persistenceApiCoordinate(namespace);
    lines.push(gradleDependency(queryDslJpa));
    lines.push(gradleDependency(`com.querydsl:querydsl-apt:${QUERYDSL_VERSION}:${queryDslAptClassifier}`, 'annotationProcessor'));
    lines.push(gradleDependency(`${persistenceApi.groupId}:${persistenceApi.artifactId}:${persistenceApi.version}`, 'annotationProcessor'));
  }
  if (a.persistenceLayer === 'Plain JDBC') {
    lines.push(gradleDependency('org.springframework.boot:spring-boot-starter-jdbc'));
  }
  if (a.persistenceLayer === 'jOOQ') {
    if (a.stackMode === 'Reactive') {
      const version = reactiveJooqVersion(a);
      lines.push(gradleDependency(`org.jooq:jooq${version ? `:${version}` : ''}`));
      lines.push(gradleDependency('org.springframework.boot:spring-boot-starter-data-r2dbc'));
    } else {
      lines.push(gradleDependency('org.springframework.boot:spring-boot-starter-jooq'));
    }
  }
  if (a.persistenceLayer === 'Spring Data R2DBC') {
    lines.push(gradleDependency('org.springframework.boot:spring-boot-starter-data-r2dbc'));
  }
  const reactivePersistence = a.stackMode === 'Reactive' && a.persistenceLayer !== 'None';
  if (a.persistenceLayer !== 'None') {
    lines.push(gradleDependency(driverCoordinate(a.database, reactivePersistence), 'runtimeOnly'));
  }
  if (hasPersistence && a.stackMode === 'Reactive' && a.migrationTool !== 'None') {
    lines.push(gradleDependency('org.springframework:spring-jdbc'));
    lines.push(gradleDependency(driverCoordinate(a.database, false), 'runtimeOnly'));
  }
  if (hasPersistence && a.migrationTool === 'Flyway') {
    lines.push(gradleDependency('org.flywaydb:flyway-core'));
    const databaseModule = flywayDatabaseModule(a);
    if (databaseModule) {
      lines.push(gradleDependency(`org.flywaydb:${databaseModule}`));
    }
  }
  if (hasPersistence && a.migrationTool === 'Liquibase') {
    lines.push(gradleDependency('org.liquibase:liquibase-core'));
  }

  return lines.join('\n');
}

function dependencyXml(artifactId: string, groupId = 'org.springframework.boot', version?: string): string {
  const renderedVersion = version ? `\n      <version>${version}</version>` : '';
  return `    <dependency>\n      <groupId>${groupId}</groupId>\n      <artifactId>${artifactId}</artifactId>${renderedVersion}\n    </dependency>`;
}

function reactiveJooqVersion(a: SpringServiceAnswers): string | undefined {
  return a.springBootVersion.startsWith('2.') ? REACTIVE_JOOQ_BOOT_2_VERSION : undefined;
}

function flywayDatabaseModule(a: SpringServiceAnswers): string | undefined {
  if (a.migrationTool !== 'Flyway' || a.springBootVersion.startsWith('2.')) {
    return undefined;
  }

  switch (a.database) {
    case 'PostgreSQL':
      return 'flyway-database-postgresql';
    case 'MSSQL Server':
      return 'flyway-sqlserver';
    case 'Oracle':
      return 'flyway-database-oracle';
    case 'H2':
      return undefined;
  }
}

export function persistenceNamespace(version: string): 'javax' | 'jakarta' {
  return version.startsWith('2.') ? 'javax' : 'jakarta';
}

function queryDslDependencyXml(a: SpringServiceAnswers): string {
  const classifier = persistenceNamespace(a.springBootVersion) === 'jakarta' ? '\n      <classifier>jakarta</classifier>' : '';
  return `    <dependency>\n      <groupId>com.querydsl</groupId>\n      <artifactId>querydsl-jpa</artifactId>\n      <version>${QUERYDSL_VERSION}</version>${classifier}\n    </dependency>`;
}

function renderQueryDslMavenCompilerPlugin(a: SpringServiceAnswers): string {
  if (a.persistenceLayer !== 'QueryDSL (JPA)') {
    return '';
  }

  const namespace = persistenceNamespace(a.springBootVersion);
  const queryDslAptClassifier = namespace === 'jakarta' ? 'jakarta' : 'jpa';
  const persistenceApi = persistenceApiCoordinate(namespace);
  return `      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <configuration>
          <annotationProcessorPaths>
            <path>
              <groupId>com.querydsl</groupId>
              <artifactId>querydsl-apt</artifactId>
              <version>${QUERYDSL_VERSION}</version>
              <classifier>${queryDslAptClassifier}</classifier>
            </path>
            <path>
              <groupId>${persistenceApi.groupId}</groupId>
              <artifactId>${persistenceApi.artifactId}</artifactId>
              <version>${persistenceApi.version}</version>
            </path>
          </annotationProcessorPaths>
        </configuration>
      </plugin>`;
}

function persistenceApiCoordinate(namespace: 'javax' | 'jakarta'): { groupId: string; artifactId: string; version: string } {
  return namespace === 'jakarta'
    ? { groupId: 'jakarta.persistence', artifactId: 'jakarta.persistence-api', version: JAKARTA_PERSISTENCE_API_VERSION }
    : { groupId: 'javax.persistence', artifactId: 'javax.persistence-api', version: JAVAX_PERSISTENCE_API_VERSION };
}

function driverDependencyXml(database: Database, reactive: boolean): string {
  if (reactive) {
    const selected = r2dbcDriverDependency(database);
    return `    <dependency>\n      <groupId>${selected.groupId}</groupId>\n      <artifactId>${selected.artifactId}</artifactId>\n      <scope>runtime</scope>\n    </dependency>`;
  }
  const mapping: Record<Database, { groupId: string; artifactId: string }> = {
    PostgreSQL: { groupId: 'org.postgresql', artifactId: 'postgresql' },
    H2: { groupId: 'com.h2database', artifactId: 'h2' },
    'MSSQL Server': { groupId: 'com.microsoft.sqlserver', artifactId: 'mssql-jdbc' },
    Oracle: { groupId: 'com.oracle.database.jdbc', artifactId: 'ojdbc11' }
  };
  const selected = mapping[database];
  return `    <dependency>\n      <groupId>${selected.groupId}</groupId>\n      <artifactId>${selected.artifactId}</artifactId>\n      <scope>runtime</scope>\n    </dependency>`;
}

function gradleDependency(coordinate: string, configuration = 'implementation'): string {
  return `    ${configuration}("${coordinate}")`;
}

function driverCoordinate(database: Database, reactive: boolean): string {
  if (reactive) {
    const selected = r2dbcDriverDependency(database);
    return `${selected.groupId}:${selected.artifactId}`;
  }
  const mapping: Record<Database, string> = {
    PostgreSQL: 'org.postgresql:postgresql',
    H2: 'com.h2database:h2',
    'MSSQL Server': 'com.microsoft.sqlserver:mssql-jdbc',
    Oracle: 'com.oracle.database.jdbc:ojdbc11'
  };
  return mapping[database];
}

function r2dbcDriverDependency(database: Database): { groupId: string; artifactId: string } {
  const mapping: Record<Database, { groupId: string; artifactId: string }> = {
    PostgreSQL: { groupId: 'org.postgresql', artifactId: 'r2dbc-postgresql' },
    H2: { groupId: 'io.r2dbc', artifactId: 'r2dbc-h2' },
    'MSSQL Server': { groupId: 'io.r2dbc', artifactId: 'r2dbc-mssql' },
    Oracle: { groupId: 'com.oracle.database.r2dbc', artifactId: 'oracle-r2dbc' }
  };
  return mapping[database];
}

function dbYamlBlock(database: Database): string {
  const mapping: Record<Database, string> = {
    PostgreSQL: `  datasource:\n    url: jdbc:postgresql://localhost:5432/appdb\n    username: app\n    password: app\n`,
    H2: `  datasource:\n    url: jdbc:h2:mem:appdb;DB_CLOSE_DELAY=-1\n    driver-class-name: org.h2.Driver\n    username: sa\n    password: ""\n`,
    'MSSQL Server': `  datasource:\n    url: jdbc:sqlserver://localhost:1433;databaseName=appdb;encrypt=true;trustServerCertificate=true\n    username: sa\n    password: yourStrong(!)Password\n`,
    Oracle: `  datasource:\n    url: jdbc:oracle:thin:@localhost:1521/FREEPDB1\n    username: app\n    password: app\n`
  };
  return mapping[database];
}

function r2dbcYamlBlock(database: Database): string {
  const mapping: Record<Database, string> = {
    PostgreSQL: `  r2dbc:\n    url: r2dbc:postgresql://localhost:5432/appdb\n    username: app\n    password: app\n`,
    H2: `  r2dbc:\n    url: r2dbc:h2:mem:///appdb\n    username: sa\n    password: ""\n`,
    'MSSQL Server': `  r2dbc:\n    url: r2dbc:mssql://localhost:1433/appdb\n    username: sa\n    password: yourStrong(!)Password\n`,
    Oracle: `  r2dbc:\n    url: r2dbc:oracle://localhost:1521/FREEPDB1\n    username: app\n    password: app\n`
  };
  return mapping[database];
}

function jooqYamlBlock(database: Database): string {
  const dialect: Record<Database, string> = {
    PostgreSQL: 'POSTGRES',
    H2: 'H2',
    'MSSQL Server': 'SQLSERVER',
    Oracle: 'ORACLE'
  };
  return `  jooq:\n    sql-dialect: ${dialect[database]}\n`;
}

function migrationYamlBlock(tool: MigrationTool, database: Database, reactive: boolean): string {
  const jdbc = reactive ? jdbcMigrationYamlBlock(database) : '';
  if (tool === 'Flyway') {
    return `  flyway:\n    enabled: true\n${jdbc}`;
  }
  if (tool === 'Liquibase') {
    return `  liquibase:\n    enabled: true\n${jdbc}`;
  }
  return '';
}

function jdbcMigrationYamlBlock(database: Database): string {
  const mapping: Record<Database, { url: string; user: string; password: string }> = {
    PostgreSQL: { url: 'jdbc:postgresql://localhost:5432/appdb', user: 'app', password: 'app' },
    H2: { url: 'jdbc:h2:mem:appdb;DB_CLOSE_DELAY=-1', user: 'sa', password: '' },
    'MSSQL Server': { url: 'jdbc:sqlserver://localhost:1433;databaseName=appdb;encrypt=true;trustServerCertificate=true', user: 'sa', password: 'yourStrong(!)Password' },
    Oracle: { url: 'jdbc:oracle:thin:@localhost:1521/FREEPDB1', user: 'app', password: 'app' }
  };
  const selected = mapping[database];
  return `    url: ${selected.url}\n    user: ${selected.user}\n    password: ${selected.password}\n`;
}

function normalizePackage(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '') || 'com.example.app';
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('') || 'Generated';
}

function safeInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validateRequiredValue(value: string): string | undefined {
  return value.length === 0 ? 'This value is required.' : undefined;
}

export function validateJavaVersion(
  value: string,
  springBootVersion = SPRING_BOOT_VERSION
): string | undefined {
  if (!/^\d+$/.test(value)) {
    return 'Java version must be a whole number.';
  }
  const javaVersion = Number.parseInt(value, 10);
  if (javaVersion < 17) {
    return 'Java version must be at least 17.';
  }
  if (springBootVersion.startsWith('2.') && javaVersion > 21) {
    return 'Spring Boot 2 supports Java versions up to Java 21.';
  }
  return undefined;
}

export function validateSpringBootVersion(value: string): string | undefined {
  if (!/^\d+\.\d+\.\d+$/.test(value)) {
    return 'Spring Boot version must be a semantic version with three numeric parts.';
  }
  const majorVersion = Number.parseInt(value.split('.')[0], 10);
  if (majorVersion !== 2 && majorVersion !== 3) {
    return 'Spring Boot major version must be 2 or 3.';
  }
  return undefined;
}

function defaultJavaVersion(springBootVersion: string): string {
  return springBootVersion.startsWith('2.') ? '21' : '25';
}

export function validateAggregateName(value: string): string | undefined {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(value)) {
    return 'Aggregate name must be a valid Java class name starting with an uppercase letter.';
  }
  return undefined;
}

export function validateServiceFolder(value: string): string | undefined {
  if (value.length === 0) {
    return 'This value is required.';
  }
  if (path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    return 'Service folder must be a relative path.';
  }
  const segments = value.split(/[\\/]/);
  if (segments.some((segment) => segment === '..')) {
    return 'Service folder must be a relative path without parent-directory traversal.';
  }
  if (segments.some((segment) => segment.length === 0 || segment === '.')) {
    return 'Service folder must be a relative path without empty or current-directory segments.';
  }
  return undefined;
}

export function validateBasePackage(value: string): string | undefined {
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(value)) {
    return 'Base package must be a valid lowercase Java package name with at least two parts.';
  }
  return undefined;
}

export function validateServiceName(value: string): string | undefined {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    return 'Service name must use lowercase letters, digits, and single hyphens.';
  }
  return undefined;
}

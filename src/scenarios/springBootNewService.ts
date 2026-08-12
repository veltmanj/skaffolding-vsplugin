import * as path from 'node:path';
import * as vscode from 'vscode';
import { createWorkspaceDirectory, resolveWorkspacePath } from './fileSafety';
import { chooseFileWriteDecision, writeWorkspaceFileWithExplicitOverwrite } from './fileWriter';
import { Scenario } from './types';

export type StackMode = 'Reactive' | 'Non-Reactive';
type BuildTool = 'Maven' | 'Gradle';
export type PersistenceLayer = 'None' | 'Hibernate (JPA)' | 'Plain JDBC' | 'Spring Data R2DBC' | 'jOOQ' | 'QueryDSL (JPA)';
type Database = 'PostgreSQL' | 'H2' | 'MSSQL Server' | 'Oracle';
type MigrationTool = 'None' | 'Flyway' | 'Liquibase';

export const SPRING_BOOT_VERSION = '3.5.4';
const QUERYDSL_VERSION = '5.1.0';
const JAKARTA_PERSISTENCE_API_VERSION = '3.1.0';

interface SpringServiceAnswers {
  stackMode: StackMode;
  springBootVersion: string;
  serviceName: string;
  aggregateName: string;
  folderName: string;
  basePackage: string;
  buildTool: BuildTool;
  javaVersion: string;
  useTdd: boolean;
  tddTool: string;
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
      { path: 'ARCHITECTURE_NOTES.md', content: renderArchitectureNotes(answers, appPackage) }
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

  const javaVersion = await input('Java version', '25', validateJavaVersion);
  if (!javaVersion) {
    return undefined;
  }

  const useTddPick = await pick<'Yes' | 'No'>('Use test-driven development?', ['Yes', 'No']);
  if (!useTddPick) {
    return undefined;
  }

  const useTdd = useTddPick === 'Yes';
  let tddTool = 'Cucumber';
  if (useTdd) {
    const selectedTool = await input('TDD tool', 'Cucumber');
    if (!selectedTool) {
      return undefined;
    }
    tddTool = selectedTool;
  }

  const persistenceLayer = await pick<PersistenceLayer>('Persistence layer', persistenceOptions(stackMode));
  if (!persistenceLayer) {
    return undefined;
  }

  const database = await pick<Database>('Database', ['PostgreSQL', 'H2', 'MSSQL Server', 'Oracle']);
  if (!database) {
    return undefined;
  }

  const migrationTool = await pick<MigrationTool>('Schema migration tool', ['None', 'Flyway', 'Liquibase']);
  if (!migrationTool) {
    return undefined;
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
    <version>${a.springBootVersion ?? SPRING_BOOT_VERSION}</version>
    <relativePath/>
  </parent>
  <groupId>${normalizePackage(a.basePackage)}</groupId>
  <artifactId>${a.serviceName}</artifactId>
  <version>0.0.1-SNAPSHOT</version>
  <name>${a.serviceName}</name>
  <description>Generated by Skaffolding VS Plugin</description>

  <properties>
    <java.version>${a.javaVersion}</java.version>
  </properties>

  <dependencies>
${deps}
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
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
    id("org.springframework.boot") version "${a.springBootVersion ?? SPRING_BOOT_VERSION}"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "${normalizePackage(a.basePackage)}"
version = "0.0.1-SNAPSHOT"

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

function renderApplicationYaml(a: SpringServiceAnswers): string {
  const db = dbYamlBlock(a.database);
  const migration = migrationYamlBlock(a.migrationTool);
  return `spring:
  application:
    name: ${a.serviceName}
${a.persistenceLayer === 'None' ? '' : db}${migration}`;
}

function renderArchitectureNotes(a: SpringServiceAnswers, pkg: string): string {
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
- Database: ${a.database}
- Migration tool: ${a.migrationTool}

## Next Step
- Add domain, application, and infrastructure modules.
- Add CI pipeline and test profile.
`;
}

function buildDependencyBlocks(a: SpringServiceAnswers): string {
  const lines: string[] = [
    dependencyXml(a.stackMode === 'Reactive' ? 'spring-boot-starter-webflux' : 'spring-boot-starter-web'),
    dependencyXml('spring-boot-starter-validation')
  ];

  if (a.persistenceLayer === 'Hibernate (JPA)' || a.persistenceLayer === 'QueryDSL (JPA)') {
    lines.push(dependencyXml('spring-boot-starter-data-jpa'));
  }
  if (a.persistenceLayer === 'QueryDSL (JPA)') {
    lines.push(queryDslDependencyXml('querydsl-jpa'));
  }
  if (a.persistenceLayer === 'Plain JDBC') {
    lines.push(dependencyXml('spring-boot-starter-jdbc'));
  }
  if (a.persistenceLayer === 'jOOQ') {
    lines.push(dependencyXml('spring-boot-starter-jooq'));
    if (a.stackMode === 'Reactive') {
      lines.push(dependencyXml('spring-boot-starter-data-r2dbc'));
    }
  }
  if (a.persistenceLayer === 'Spring Data R2DBC') {
    lines.push(dependencyXml('spring-boot-starter-data-r2dbc'));
  }
  if (a.persistenceLayer !== 'None') {
    lines.push(driverDependencyXml(a.database, a.stackMode === 'Reactive'));
  }
  if (a.migrationTool === 'Flyway') {
    lines.push(dependencyXml('flyway-core', 'org.flywaydb'));
  }
  if (a.migrationTool === 'Liquibase') {
    lines.push(dependencyXml('liquibase-core', 'org.liquibase'));
  }

  return lines.join('\n');
}

function buildGradleDependencies(a: SpringServiceAnswers): string {
  const lines: string[] = [
    gradleDependency(a.stackMode === 'Reactive' ? 'org.springframework.boot:spring-boot-starter-webflux' : 'org.springframework.boot:spring-boot-starter-web'),
    gradleDependency('org.springframework.boot:spring-boot-starter-validation')
  ];

  if (a.persistenceLayer === 'Hibernate (JPA)' || a.persistenceLayer === 'QueryDSL (JPA)') {
    lines.push(gradleDependency('org.springframework.boot:spring-boot-starter-data-jpa'));
  }
  if (a.persistenceLayer === 'QueryDSL (JPA)') {
    lines.push(gradleDependency(`com.querydsl:querydsl-jpa:${QUERYDSL_VERSION}:jakarta`));
    lines.push(gradleDependency(`com.querydsl:querydsl-apt:${QUERYDSL_VERSION}:jakarta`, 'annotationProcessor'));
    lines.push(gradleDependency(`jakarta.persistence:jakarta.persistence-api:${JAKARTA_PERSISTENCE_API_VERSION}`, 'annotationProcessor'));
  }
  if (a.persistenceLayer === 'Plain JDBC') {
    lines.push(gradleDependency('org.springframework.boot:spring-boot-starter-jdbc'));
  }
  if (a.persistenceLayer === 'jOOQ') {
    lines.push(gradleDependency('org.springframework.boot:spring-boot-starter-jooq'));
    if (a.stackMode === 'Reactive') {
      lines.push(gradleDependency('org.springframework.boot:spring-boot-starter-data-r2dbc'));
    }
  }
  if (a.persistenceLayer === 'Spring Data R2DBC') {
    lines.push(gradleDependency('org.springframework.boot:spring-boot-starter-data-r2dbc'));
  }
  if (a.persistenceLayer !== 'None') {
    lines.push(gradleDependency(driverCoordinate(a.database, a.stackMode === 'Reactive'), 'runtimeOnly'));
  }
  if (a.migrationTool === 'Flyway') {
    lines.push(gradleDependency('org.flywaydb:flyway-core'));
  }
  if (a.migrationTool === 'Liquibase') {
    lines.push(gradleDependency('org.liquibase:liquibase-core'));
  }

  return lines.join('\n');
}

function dependencyXml(artifactId: string, groupId = 'org.springframework.boot'): string {
  return `    <dependency>\n      <groupId>${groupId}</groupId>\n      <artifactId>${artifactId}</artifactId>\n    </dependency>`;
}

function queryDslDependencyXml(artifactId: string): string {
  return `    <dependency>\n      <groupId>com.querydsl</groupId>\n      <artifactId>${artifactId}</artifactId>\n      <version>${QUERYDSL_VERSION}</version>\n      <classifier>jakarta</classifier>\n    </dependency>`;
}

function renderQueryDslMavenCompilerPlugin(a: SpringServiceAnswers): string {
  if (a.persistenceLayer !== 'QueryDSL (JPA)') {
    return '';
  }

  return `      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <configuration>
          <annotationProcessorPaths>
            <path>
              <groupId>com.querydsl</groupId>
              <artifactId>querydsl-apt</artifactId>
              <version>${QUERYDSL_VERSION}</version>
              <classifier>jakarta</classifier>
            </path>
            <path>
              <groupId>jakarta.persistence</groupId>
              <artifactId>jakarta.persistence-api</artifactId>
              <version>${JAKARTA_PERSISTENCE_API_VERSION}</version>
            </path>
          </annotationProcessorPaths>
        </configuration>
      </plugin>`;
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

function migrationYamlBlock(tool: MigrationTool): string {
  if (tool === 'Flyway') {
    return `  flyway:\n    enabled: true\n`;
  }
  if (tool === 'Liquibase') {
    return `  liquibase:\n    enabled: true\n`;
  }
  return '';
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

export function validateJavaVersion(value: string): string | undefined {
  if (!/^\d+$/.test(value)) {
    return 'Java version must be a whole number.';
  }
  if (Number.parseInt(value, 10) < 17) {
    return 'Java version must be at least 17.';
  }
  return undefined;
}

export function validateSpringBootVersion(value: string): string | undefined {
  if (!/^\d+\.\d+\.\d+$/.test(value)) {
    return 'Spring Boot version must be a semantic version with three numeric parts.';
  }
  return undefined;
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

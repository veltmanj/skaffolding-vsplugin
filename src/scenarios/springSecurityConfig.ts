import * as path from 'node:path';
import * as vscode from 'vscode';
import { createWorkspaceDirectory, resolveWorkspacePath } from './fileSafety';
import { chooseFileWriteDecision, writeWorkspaceFileWithExplicitOverwrite } from './fileWriter';
import { Scenario } from './types';

type StackMode = 'Reactive' | 'Non-Reactive';
type SecurityMode = 'Basic Authentication' | 'JWT Tokens' | 'Detached JWS' | 'WebAuthn';

export const addSpringSecurityConfigScenario: Scenario = {
  id: 'spring.boot.add-security-config',
  label: 'Spring Boot: Add SecurityConfig',
  description: 'Create a SecurityConfig template for reactive or non-reactive apps.',
  run: async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showErrorMessage('Open a workspace folder first.');
      return;
    }

    const stackMode = await pick<StackMode>('Reactive or Non-Reactive?', ['Reactive', 'Non-Reactive']);
    if (!stackMode) {
      return;
    }

    const securityMode = await pick<SecurityMode>('Security mode', [
      'Basic Authentication',
      'JWT Tokens',
      'Detached JWS',
      'WebAuthn'
    ]);
    if (!securityMode) {
      return;
    }

    const packageName = await input('Package name for config class', 'com.example.app.config');
    if (!packageName) {
      return;
    }

    const relativeServiceFolder = await input(
      'Target service folder (relative to workspace root)',
      '.'
    );
    if (relativeServiceFolder === undefined) {
      return;
    }

    const normalizedPackage = normalizePackage(packageName);
    const serviceFolder = resolveWorkspacePath(folder.uri.fsPath, relativeServiceFolder);
    const serviceFolderRelativePath = path.relative(folder.uri.fsPath, serviceFolder);
    const javaBase = resolveWorkspacePath(
      folder.uri.fsPath,
      path.join(serviceFolderRelativePath, 'src/main/java', normalizedPackage.replaceAll('.', '/'))
    );
    const targetFile = resolveWorkspacePath(
      folder.uri.fsPath,
      path.join(serviceFolderRelativePath, 'src/main/java', normalizedPackage.replaceAll('.', '/'), 'SecurityConfig.java')
    );
    const targetUri = vscode.Uri.file(targetFile);

    const content = stackMode === 'Reactive'
      ? renderReactiveConfig(normalizedPackage, securityMode)
      : renderServletConfig(normalizedPackage, securityMode);

    await createWorkspaceDirectory(folder.uri.fsPath, javaBase);
    const result = await writeWorkspaceFileWithExplicitOverwrite(
      folder.uri.fsPath,
      targetUri,
      content,
      () => chooseFileWriteDecision(path.relative(folder.uri.fsPath, targetFile))
    );

    if (result === 'cancelled') {
      vscode.window.showInformationMessage('SecurityConfig cancelled. Files created: 0. Files overwritten: 0. Files skipped: 0.');
      return;
    }
    if (result === 'skipped') {
      vscode.window.showInformationMessage('SecurityConfig complete. Files created: 0. Files overwritten: 0. Files skipped: 1.');
      return;
    }

    vscode.window.showInformationMessage(
      `SecurityConfig complete at ${path.relative(folder.uri.fsPath, targetFile)}. Files created: ${result === 'created' ? 1 : 0}. Files overwritten: ${result === 'overwritten' ? 1 : 0}. Files skipped: 0.`
    );
  }
};

async function pick<T extends string>(title: string, options: T[]): Promise<T | undefined> {
  const selected = await vscode.window.showQuickPick(options, { placeHolder: title });
  return selected as T | undefined;
}

async function input(prompt: string, value: string): Promise<string | undefined> {
  const entered = await vscode.window.showInputBox({
    prompt,
    value,
    ignoreFocusOut: true,
    validateInput: (text) => (text.trim().length === 0 ? 'This value is required.' : undefined)
  });
  return entered?.trim();
}

export function renderServletConfig(pkg: string, mode: SecurityMode): string {
  const section = servletSection(mode);
  return `package ${pkg};

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    // Selected security mode: ${mode}.

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
${section}
        return http.build();
    }
}
`;
}

export function renderReactiveConfig(pkg: string, mode: SecurityMode): string {
  const section = reactiveSection(mode);
  return `package ${pkg};

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.web.server.SecurityWebFilterChain;

@Configuration
public class SecurityConfig {

    // Selected security mode: ${mode}.

    @Bean
    SecurityWebFilterChain springSecurityFilterChain(ServerHttpSecurity http) {
${section}
        return http.build();
    }
}
`;
}

function servletSection(mode: SecurityMode): string {
  switch (mode) {
    case 'Basic Authentication':
      return `        http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health").permitAll()
                .anyRequest().authenticated()
            )
            .httpBasic(Customizer.withDefaults());`;
    case 'JWT Tokens':
      return `        http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
            .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()));`;
    case 'Detached JWS':
      return `        http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth.anyRequest().authenticated());
        // PLACEHOLDER: Detached JWS verification is not a complete implementation.
        // Safe use: add a reviewed verifier for the signature, headers, claims, and replay checks.
        // Do not use this template as production verification.`;
    case 'WebAuthn':
      return `        http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/webauthn/register", "/webauthn/login").permitAll()
                .anyRequest().authenticated()
            );
        // PLACEHOLDER: WebAuthn registration and assertion handling is not a complete implementation.
        // Safe use: add reviewed origin, challenge, credential, and user verification checks.
        // Do not use this template as production authentication.`;
  }
}

function reactiveSection(mode: SecurityMode): string {
  switch (mode) {
    case 'Basic Authentication':
      return `        http
            .csrf(ServerHttpSecurity.CsrfSpec::disable)
            .authorizeExchange(exchange -> exchange
                .pathMatchers("/actuator/health").permitAll()
                .anyExchange().authenticated()
            )
            .httpBasic(Customizer.withDefaults());`;
    case 'JWT Tokens':
      return `        http
            .csrf(ServerHttpSecurity.CsrfSpec::disable)
            .authorizeExchange(exchange -> exchange.anyExchange().authenticated())
            .oauth2ResourceServer(spec -> spec.jwt(Customizer.withDefaults()));`;
    case 'Detached JWS':
      return `        http
            .csrf(ServerHttpSecurity.CsrfSpec::disable)
            .authorizeExchange(exchange -> exchange.anyExchange().authenticated());
        // PLACEHOLDER: Detached JWS verification is not a complete implementation.
        // Safe use: add a reviewed verifier for the signature, headers, claims, and replay checks.
        // Do not use this template as production verification.`;
    case 'WebAuthn':
      return `        http
            .csrf(ServerHttpSecurity.CsrfSpec::disable)
            .authorizeExchange(exchange -> exchange
                .pathMatchers("/webauthn/register", "/webauthn/login").permitAll()
                .anyExchange().authenticated()
            );
        // PLACEHOLDER: WebAuthn reactive handling is not a complete implementation.
        // Safe use: add reviewed origin, challenge, credential, and user verification checks.
        // Do not use this template as production authentication.`;
  }
}

function normalizePackage(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '') || 'com.example.app.config';
}

# VS Code Extension Hardening Design

## Goal

Improve the Skaffolding VS Code extension for safe file generation, correct generated output, stronger validation, and release packaging.

## Scope

- Add one shared helper to keep generated files inside the workspace.
- Add overwrite protection for generated files.
- Fix the scenario pack template line breaks.
- Validate scenario pack data at runtime.
- Add tests for the new safety and validation behavior.
- Add VSIX packaging commands and checks.
- Improve Azure starter secret handling and connection settings.
- Fix QueryDSL dependency generation.
- Make the Spring Boot version configurable through one constant.
- Mark incomplete security modes as placeholders.

## Design

### Safe file generation

All generated paths will pass through a shared helper. The helper will resolve the path against the workspace root and reject paths outside that root. It will also reject absolute input paths and parent-directory traversal. All generators will use this helper.

### Existing files

Generators will check each target before writing. If a target exists, the command will ask whether to overwrite it. A negative answer will skip the target. The command will report the number of created and skipped files.

### Scenario packs

Runtime validation will check field types, prompt types, prompt IDs, select options, and file definitions. Invalid packs will be skipped with a warning. The existing JSON schema will remain the editor-facing validation source.

### Generated projects

The scenario pack template will contain real line breaks. QueryDSL selection will add the required dependency and annotation-processing configuration. Azure output will use safer secret instructions, avoid a committed password value, and provide the required application database settings.

### Packaging

The manifest will include a `vscode:prepublish` script. The project will add a package command and a package inspection command. The release check will confirm that the compiled extension entry point is present in the VSIX.

## Error handling

- Path rejection will stop the current scenario and show an error.
- Invalid scenario packs will be skipped and reported as warnings.
- A cancelled prompt will stop the scenario without writing files.
- Existing files will not be changed without user confirmation.

## Testing

Tests will cover:

- Workspace path acceptance and rejection.
- Scenario pack validation.
- Template line breaks.
- QueryDSL dependency output.
- Existing file decisions.
- Existing model and Azure snapshot behavior.

The acceptance checks are `npm test`, TypeScript compilation, and VSIX packaging inspection.

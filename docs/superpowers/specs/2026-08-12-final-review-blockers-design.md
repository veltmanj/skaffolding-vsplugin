# Final Review Blockers Design

## Goal

Close the three final review blockers. Keep file output in the workspace, align runtime and schema validation, and reject reserved Azure PostgreSQL application role names.

## File safety

Use a shared workspace file operation for all generators. Create each missing directory component separately. Before each create operation, use `lstat` to reject a link and record the parent device and inode. After the operation, compare the parent identity again and reject a replacement.

For a new file, verify the full parent chain immediately before open. Open the file with exclusive-create and no-follow flags. Verify the parent chain again before content is written. Write through the open file handle so that a later path change cannot redirect the write.

For an overwrite, verify the parent chain immediately before open. Open the approved file with no-follow mode. Verify the file identity and the parent chain before truncate and write.

## Scenario pack validation

Runtime validation rejects `options` unless the prompt type is `select`. Runtime and schema tests use the same malformed placeholder cases. A valid placeholder is `{{promptId}}`, with optional space inside the delimiters. Literal text cannot contain an unmatched `{{` or `}}` delimiter.

## Azure PostgreSQL roles

Use one reserved-role check for the administrator and the application user. Reject known Azure service roles, the PostgreSQL `public` pseudo-role, the default system superuser, common administrator names, and every name that starts with `pg_`.

## Tests

Use a red-green cycle for each blocker. The file test replaces a checked parent with a link before the safe create call. It verifies that no file is written outside the workspace. Validation tests send the same invalid prompt and placeholder data to runtime and Ajv schema validation. Azure tests cover the named blocked roles and representative `pg_` system roles.

## Acceptance

Run `npm test`, `npm run package`, and `npm run check:package`. Update the final hardening report with the new behavior and fresh command results. Do not create a Git commit.

# Development Workflow

## Before Editing

Before changing code:

1. Inspect relevant files.
2. Identify existing patterns.
3. Check available scripts.
4. Check current database schema or migrations.
5. State assumptions.
6. Avoid creating duplicate systems.

Do not replace an existing working implementation without understanding it.

## Scope Control

For each task:

- Solve the requested problem
- Avoid unrelated refactoring
- Avoid speculative features
- Avoid unnecessary dependencies
- Avoid architecture rewrites during MVP work

Create a separate recommendation section for non-blocking improvements rather than implementing them automatically.

## Package Management

Use the package manager already present in the repository.

Do not switch package managers.

Do not install a dependency when the existing stack already provides the capability.

Before adding a dependency:

- Explain why it is needed
- Check maintenance and compatibility
- Prefer small, established packages
- Avoid packages for trivial utilities

## Code Quality

Use:

- Strict typing
- Descriptive names
- Small focused functions
- Explicit error handling
- Shared domain constants
- Central validation schemas
- Reusable UI components

Avoid:

- `any` without a documented reason
- Silent catch blocks
- Magic numbers
- Duplicated status strings
- Business logic in view components
- Hidden side effects
- Unbounded queries

## Comments

Comments should explain:

- Why a decision exists
- A non-obvious invariant
- A security constraint
- A domain-specific edge case

Do not comment obvious syntax.

## Database Changes

Every schema change requires a migration.

Do not edit production data manually as part of ordinary feature implementation.

Migrations should be:

- Reviewable
- Repeatable where appropriate
- Safe for existing data
- Paired with rollback guidance for risky operations

## Live Verification Records

Never hard-delete a record created while verifying against production.

Cancel it instead, using the same path a user would take. A cancelled record is
already invisible on public surfaces, and it keeps the table consistent with the
audit log.

Create verification data so it can be told apart later:

- a recognisable contact address, for example `dogrulama+<faz>@afethub.test`
- a note saying the record is a test and will be cancelled

Why this rule exists: on 2 August 2026 a Phase 1 live verification run created a
delivery pledge, cancelled it, and then deleted the row. The audit entries stayed —
they are immutable by design — so the table and the audit log told different
stories, and reconstructing what happened took a transcript search. `cancel` alone
would have been enough.

`supabase/checks/integrity.sql` reports this class of divergence. Run it after any
verification session that touches production.

## Verification

After implementation, run the relevant available commands:

- Type checking
- Linting
- Unit tests
- Integration tests
- Production build

Do not claim success for commands that were not run.

If a command cannot run, state:

- The command attempted
- The failure
- Whether the failure is related to the change
- What remains to be verified

## Final Report

After every implementation task, report:

### Implemented

What changed.

### Files Changed

Exact paths.

### Verification

Commands run and results.

### Risks or Limitations

Anything unresolved.

### Next Recommended Step

Only the most relevant next action.

## Git Safety

Do not:

- Force push
- Rewrite history
- Delete branches
- Commit secrets
- Commit local environment files
- Revert unrelated user changes

Never create a commit unless explicitly requested.
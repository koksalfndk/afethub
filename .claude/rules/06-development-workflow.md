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
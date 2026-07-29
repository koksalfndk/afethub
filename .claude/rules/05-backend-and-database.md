# Backend and Database Rules

## Architecture

Keep domain logic independent from UI components.

Suggested separation:

- Presentation
- Application services
- Domain logic
- Data access
- External integrations

Do not place authoritative quantity logic inside React components.

## Database Conventions

Use:

- UUID or similarly non-guessable primary keys
- created_at
- updated_at
- explicit status fields
- foreign-key constraints
- check constraints
- unique constraints where required
- indexes for active operational queries

Use database constraints in addition to application validation.

## Quantities

Use numeric types suitable for the unit.

Do not assume all quantities are integers.

Examples:

- 10 pieces
- 25.5 kilograms
- 120 litres
- 8 hours

Store:

- Numeric quantity
- Explicit unit

Do not store values such as “10 boxes” in one free-text quantity field.

## Aggregates

Prefer deriving approved totals from approval records unless performance proves materialization is needed.

If aggregate values are stored:

- Treat them as cached authoritative aggregates maintained transactionally
- Provide reconciliation logic
- Test against underlying records

Never allow the client to send the final aggregate total as truth.

## Status Transitions

Implement status transitions explicitly.

Reject invalid transitions.

Examples:

- rejected → approved should require a deliberate reopen workflow
- approved → pending must not happen silently
- completed Need → accepting submissions requires reopen permission
- cancelled submission → approved is invalid by default

## Soft Deletion

Do not hard-delete operational records from normal user flows.

Prefer:

- archived_at
- cancelled_at
- deleted_at where legally appropriate

Quantity-affecting records must remain auditable.

## Public and Private Views

Create separate serializers, queries or database views for:

- Public Need data
- Contributor-owned data
- Coordinator operational data
- Administrator data

Do not fetch private fields and merely hide them in the UI.

## Email

Email operations should be asynchronous where practical.

Track:

- Queued
- Sent
- Failed
- Retried

Do not block core database writes solely on third-party email delivery.

A failed confirmation email must be recoverable with resend functionality.

## Observability

Use structured logs.

Include:

- Request ID
- Actor ID when available
- Entity ID
- Operation
- Result
- Error category

Never log:

- Passwords
- Session tokens
- Full reset links
- Secret keys
- Full private submission payloads unnecessarily

## Performance

Prioritize:

- Fast active-disaster pages
- Indexed Need filtering
- Pagination for activity and submissions
- Efficient coordinator queues
- Image optimization
- Minimal client JavaScript where possible

Do not prematurely optimize low-volume admin features at the expense of correctness.

## Testing Requirements

At minimum, test:

- Remaining quantity calculation
- Pending quantities not reducing remaining
- Full approval
- Partial approval
- Rejection
- Duplicate approval attempts
- Concurrent approvals
- Over-approval prevention
- Need completion
- Need reopening
- Unauthorized coordinator actions
- Public data redaction
- Guest tracking access
- Email verification state transitions
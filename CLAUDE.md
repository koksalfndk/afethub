# AfetHUB Project Instructions

## Project Identity

AfetHUB is an independent civil disaster coordination platform.

It is not connected to PatiBase or any other product.

Never import:

- PatiBase branding
- PatiBase components
- PatiBase database structures
- PatiBase user accounts
- PatiBase visual language
- PatiBase terminology

AfetHUB must remain a fully independent product.

## Mission

AfetHUB coordinates verified needs, incoming physical aid, volunteers, delivery locations and public updates during:

- Wildfires
- Earthquakes
- Floods
- Severe weather
- Evacuations
- Other civil emergencies

AfetHUB is not primarily a monetary donation platform.

The core product goal is:

> Show what is needed, what has arrived, what is pending verification and what still remains.

## Primary Product Rule

Never require a visitor to create an account before:

- Viewing active disasters
- Viewing needs
- Viewing delivery locations
- Reporting product aid
- Submitting a need request
- Applying as a volunteer
- Tracking a previous submission

Account creation is optional for public contributors.

Accounts exist to:

- Save contact details
- Avoid repeatedly entering information
- View submission history
- Manage notifications
- Speed up future submissions

Coordinator and administrator actions always require authenticated and authorized accounts.

## Core Quantity Rule

The canonical formula is:

remaining_quantity = requested_quantity - approved_quantity

Pending submissions must never reduce the public remaining quantity.

Rejected quantities must never reduce the public remaining quantity.

Reported quantities must never be treated as delivered quantities until approved by an authorized coordinator.

## Source of Truth

The database is the source of truth.

Never calculate authoritative totals only in the browser.

All quantity-changing operations must be:

- Validated on the server
- Performed transactionally
- Protected from race conditions
- Recorded in an immutable audit log

## Development Priorities

When making decisions, use this priority order:

1. Human safety
2. Data accuracy
3. Abuse prevention
4. Operational clarity
5. Accessibility
6. Mobile usability
7. Performance
8. Visual polish

Never sacrifice correctness or trust for visual convenience.

## Working Method

Before implementing a non-trivial feature:

1. Inspect the existing project structure.
2. Identify affected pages, components, database tables and APIs.
3. Explain the proposed implementation briefly.
4. List important risks and edge cases.
5. Make the smallest coherent change.
6. Run relevant validation, type checks and tests.
7. Report exactly what changed and what remains unresolved.

Do not perform broad refactors during urgent MVP work unless they are necessary for correctness or security.

## No Fabricated Completion

Never claim that:

- A build passed
- A migration ran
- A test passed
- An email was delivered
- A deployment succeeded
- A database change exists
- A feature works end-to-end

unless it was actually verified.

Clearly distinguish:

- Implemented
- Locally verified
- Mocked
- Not tested
- Blocked
- Requires production verification

## Rule Files

Follow all rules inside `.claude/rules/`.

When rules conflict, use this precedence:

1. Security and human safety
2. Domain and quantity integrity
3. Data privacy
4. MVP scope
5. UX and visual rules
6. General coding preferences
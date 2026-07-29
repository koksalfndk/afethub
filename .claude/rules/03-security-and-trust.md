# Security, Privacy and Trust

## Server-Side Authorization

Never trust role information from the browser.

All coordinator and administrator operations require server-side authorization.

Protect at minimum:

- Need creation
- Need editing
- Quantity changes
- Submission approval
- Partial approval
- Rejection
- Delivery location management
- Announcement publication
- Disaster management
- User role management
- Audit access

Hiding a button is not authorization.

## Data Minimization

Collect only information necessary for coordination.

Public contribution forms may request:

- Full name
- Email
- Phone number
- City
- Submission-specific information

Do not request sensitive identity documents in the initial MVP.

Do not expose personal data in public APIs.

## Contact Information

Contributor contact details are visible only to authorized personnel with an operational need.

Avoid displaying full contact details in list views.

Prefer masked forms such as:

- k***@example.com
- +90 5** *** ** 42

Reveal full details only when necessary and authorized.

## Email Verification

Guest submissions may be stored before email verification.

Clearly distinguish:

- Unverified email
- Verified email
- Coordinator-verified delivery

Email verification does not mean the physical aid has been verified.

Never label an email-verified submission as approved aid.

## Abuse Prevention

Public forms require layered protection:

- Rate limiting
- Bot protection
- Input validation
- File validation
- Duplicate detection
- Abuse reporting
- Coordinator moderation

Do not create barriers so aggressive that legitimate emergency submissions become impractical.

## File Uploads

For photos and attachments:

- Restrict file types
- Restrict file size
- Generate safe filenames
- Do not trust file extensions
- Store outside executable paths
- Strip unsafe metadata where practical
- Use signed or controlled access for private evidence
- Never expose internal storage paths

## Input Validation

Validate all public input on the server.

Validate:

- Required fields
- Length limits
- Quantity ranges
- Allowed units
- Email format
- Phone format
- Allowed status transitions
- File types
- Entity ownership
- Disaster and Need availability

Client validation is for convenience only.

## Race Conditions

Approval operations must use database transactions or atomic database functions.

Two coordinators must not be able to approve overlapping quantities based on stale remaining values.

During approval:

1. Lock or atomically validate the affected Need.
2. Validate the submission state.
3. Calculate allowed quantity.
4. Write the decision.
5. Update authoritative aggregates if stored.
6. Write the audit event.
7. Commit together.

## Idempotency

Approval, rejection and submission endpoints should support idempotency where repeated requests could create duplicate effects.

A network retry must not double-count approved aid.

## Audit Log

Security-sensitive and quantity-changing actions must create immutable audit events.

Audit events should include:

- Actor
- Actor role
- Action
- Entity type
- Entity ID
- Previous value
- New value
- Reason
- Timestamp
- Request or correlation ID when available

Audit events must not contain plaintext passwords, secrets or authentication tokens.

## Secrets

Never place secrets in:

- Source code
- Client-side environment variables
- Git history
- Screenshots
- Logs
- Example content

Use server-side environment variables.

Create `.env.example` with placeholder names only.

## Error Handling

Public errors must not reveal:

- Stack traces
- Database details
- Internal IDs
- Secret values
- Authorization implementation
- Other contributors' data

Log internal diagnostic details securely.

## Legal and Safety Disclaimer

Do not present AfetHUB as an official emergency authority unless formally authorized.

Emergency pages should make clear that users must contact official emergency services for immediate danger.

Do not invent emergency telephone numbers or public-authority affiliations.
# Domain and Quantity Logic

## Core Entities

The platform should treat these as separate domain entities:

- User
- Guest Contributor
- Coordinator
- Organization
- Disaster
- Need
- Aid Submission
- Aid Submission Item
- Need Request
- Volunteer Application
- Delivery Location
- Announcement
- Verification Decision
- Audit Event

Do not combine a published Need with an Aid Submission.

A Need represents demand.

An Aid Submission represents a contributor's claim or commitment.

A Verification Decision represents what a coordinator actually confirms.

## Need Quantities

Each measurable Need should contain:

- requested_quantity
- approved_quantity
- pending_quantity
- remaining_quantity
- unit

Canonical rules:

approved_quantity =
sum of approved quantities from valid approval records

pending_quantity =
sum of unresolved submitted quantities

remaining_quantity =
max(requested_quantity - approved_quantity, 0)

Pending quantity is informational.

Pending quantity does not reduce remaining quantity.

## Example

A Need requires 100 masks.

Initial state:

- Requested: 100
- Approved: 0
- Pending: 0
- Remaining: 100

A user reports 30 masks.

Before coordinator approval:

- Requested: 100
- Approved: 0
- Pending: 30
- Remaining: 100

After approval of all 30:

- Requested: 100
- Approved: 30
- Pending: 0
- Remaining: 70

## Partial Approval

If a user reports 30 units and the coordinator verifies 25:

- approved_quantity for the submission is 25
- rejected or unverified quantity is 5
- the Need decreases only by 25
- the submission becomes partially approved
- the coordinator must provide a reason

Never overwrite the originally reported quantity.

Store separately:

- reported_quantity
- approved_quantity
- rejected_quantity
- decision_reason

## Over-Approval

A coordinator must not silently approve more than the remaining quantity.

If:

- Remaining: 10
- Reported: 25

the interface must support deliberate choices:

- Approve only 10
- Increase the requested quantity with a reason
- Redirect surplus to another compatible Need
- Record surplus separately
- Reject the submission

Never automatically discard surplus.

Never automatically increase requested quantity.

## Requested Quantity Changes

Changing requested_quantity after publication requires:

- Coordinator authorization
- A reason
- Previous value
- New value
- Timestamp
- Audit event

Reducing requested quantity below approved quantity is forbidden unless a specific correction workflow exists.

## Completion

A Need becomes completed when:

remaining_quantity = 0

Completion may be automatic after a successful transaction.

A coordinator may pause or reopen a Need, but these operations require:

- Permission
- Reason
- Audit event

Completed or paused Needs must not accept new aid submissions by default.

## Submission States

Recommended Aid Submission states:

- draft
- email_verification_pending
- coordinator_review_pending
- information_requested
- approved
- partially_approved
- rejected
- cancelled
- archived

Avoid using a single generic “pending” status internally.

## Guest Submissions

Guest and registered-user submissions must follow the same verification and quantity rules.

A guest submission must not have lower operational validity merely because the contributor has no account.

Guest identity should be stored as contact details associated with the submission, not as a fake user account.

## Need Requests

A public Need Request is not automatically a published Need.

Flow:

1. Submitted
2. Email verification where required
3. Coordinator review
4. Approve, edit, merge, request information or reject
5. Published as a separate Need record

Preserve the original request even if a coordinator edits the published Need.

## Tracking Codes

Every public submission should receive a non-sequential tracking code.

Tracking codes must:

- Be easy to read
- Avoid exposing database IDs
- Be resistant to guessing
- Be unique
- Be stored separately from primary keys

Example display format:

AFH-SYD-K7P4M2

Do not rely on the tracking code alone for access to private submission details.

Require an additional verification factor such as:

- Matching email
- Secure emailed access link
- One-time verification code
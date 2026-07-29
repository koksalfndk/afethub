# Seydikemer MVP Scope

## Immediate Goal

Build a usable first version for the Seydikemer wildfire as quickly as possible without compromising quantity integrity, privacy or coordinator authorization.

The MVP should support one active disaster first while preserving a multi-disaster data model.

## Must Have

### Public

- Active disaster page
- Public Need list
- Need detail
- Requested, approved, pending and remaining quantities
- Delivery location details
- Guest aid submission
- Optional email verification
- Submission success page
- Tracking code
- Submission tracking
- Guest Need request
- Optional account registration
- Login
- Email verification

### Coordinator

- Secure coordinator login
- Coordinator dashboard
- Create and edit Need
- View pending submissions
- Full approval
- Partial approval
- Rejection with reason
- Request more information
- Quantity update
- Delivery location management
- Public announcement management
- Audit activity view

### Reliability

- Server-side validation
- Transactional approvals
- Idempotency protection
- Rate limiting
- Public/private data separation
- Audit events
- Responsive design
- Useful errors
- Loading and empty states

## Initial Disaster

Name:

Seydikemer Orman Yangını

Slug:

seydikemer-orman-yangini

Delivery location:

Seydikemer Kapalı Pazaryeri

Do not invent a full street address unless verified and explicitly supplied.

## Initial Need Categories

- Powerbank
- Maske
- Tepe lambası
- Pil
- Islak mendil
- Göz yaşı damlası
- İş eldiveni
- İş pantolonu
- Tişört ve gömlek

Treat initial quantities as draft or demo values until a verified coordinator confirms them.

Never publish placeholder quantities as live data without a visible demo label.

## Explicitly Out of Scope for First Release

Do not implement unless explicitly requested:

- Monetary donation collection
- Cryptocurrency
- Public contributor leaderboard
- Social feed
- Direct messaging between all users
- Complex gamification
- Native mobile application
- Nationwide organization verification system
- AI-generated emergency decisions
- Automated redistribution without coordinator approval
- Public display of contributor identities
- Complex warehouse management
- Route optimization
- Multi-language support beyond basic readiness
- Government-system integration
- PatiBase integration

## Release Gate

Do not describe the MVP as ready for live disaster operations until all of these are verified:

- Coordinator authorization works
- Public personal data is redacted
- Guest submission works
- Email flow is tested
- Full approval updates quantities correctly
- Partial approval updates quantities correctly
- Pending submissions do not reduce remaining quantity
- Duplicate approvals do not double-count
- Concurrent approvals are protected
- Audit events are written
- Mobile form works
- Tracking access is protected
- Seed data is confirmed as real or clearly marked as demo
# Frontend and UX Rules

## Mobile First

Design and implement mobile layouts first.

Assume many users will access the platform:

- Outdoors
- Under stress
- With weak connectivity
- On older mobile devices

Core actions must remain usable at narrow viewport widths.

## Accessibility

Target WCAG 2.2 AA where practical.

Requirements:

- Minimum touch target approximately 48px
- Visible keyboard focus
- Semantic HTML
- Form labels
- Accessible error messages
- Sufficient color contrast
- Status text in addition to color
- Screen-reader-friendly live updates
- Reduced-motion support
- Logical heading order

Never communicate a status using color alone.

## Content Hierarchy

On Need cards, prioritize:

1. Need name
2. Remaining quantity
3. Priority
4. Delivery location
5. Approved and pending quantities
6. Last updated time
7. Action

Do not visually prioritize requested quantity over remaining quantity.

## Quantity Display

Always show labels clearly.

Good:

- 70 remaining
- 30 approved
- 15 pending verification
- 100 requested

Bad:

- 70 / 30 / 15 / 100

Never use a progress bar without numerical text.

## Public Calls to Action

Preferred public actions:

- View active needs
- Report aid
- Submit a need
- Volunteer
- Track submission
- Get directions

Do not make “Create account” the primary action.

## Forms

Public emergency forms must be short and clear.

Use progressive disclosure where needed.

Every form should:

- Preserve entered information after recoverable errors
- Explain why contact information is requested
- Show required and optional fields
- Use appropriate input types
- Support browser autofill
- Prevent accidental duplicate submission
- Show a clear success state

Do not reset the form after a server error.

## Account Offer

Offer optional registration only after successful public submission or as a secondary header action.

Suggested message:

“Save your information for faster future submissions.”

Never imply that an account makes a contribution more valuable.

## Loading States

Avoid blank screens.

Use:

- Skeletons for predictable content
- Inline progress for form submission
- Disabled duplicate-submit states
- Clear retry actions

Do not use indefinite spinners without context.

## Empty States

Empty states must describe reality.

Example:

“No active needs are currently published for this disaster.”

Do not say:

“All needs have been solved”

unless this is verified.

## Error States

Errors must be actionable.

Good:

“We could not submit your report. Your entered information is still here. Please try again.”

Bad:

“Something went wrong.”

## Destructive Actions

Require confirmation for:

- Rejecting submissions
- Closing a Need
- Pausing a Need
- Removing a delivery location
- Archiving a disaster
- Changing approved quantities

Show the consequence before confirmation.

## Visual Language

Use:

- Calm neutral backgrounds
- Strong typography
- Clear cards
- Minimal decoration
- Consistent spacing
- Restrained emergency colors

Avoid:

- Dramatic disaster photographs in core operational views
- Decorative animation
- Glassmorphism
- Tiny text
- Dense dashboard layouts
- Gamification
- Confetti
- Leaderboards for aid

### Gradients

Measured gradients are allowed. They exist to give a surface depth or to mark a
panel, never as decoration. The permitted uses are defined as tokens in
`app/src/theme.ts` (`G`, `wash()`, `barFill()`, `ribbon()`); do not hand-roll new
gradients in components.

Allowed:

- Header bar and card surfaces washed toward white (white stays dominant)
- A 4px accent ribbon on the top edge of a card
- Progress fills and primary buttons
- A dark navy panel or strip that carries only short labels and figures

Not allowed:

- Gradients behind body copy that must stay readable outdoors on a weak screen
- More than two colour stops of visible contrast in one surface
- A gradient that replaces the status colour of a border, badge or figure —
  status is still carried by colour **and** text
- Glassmorphism, blur-behind panels, and translucent overlays over content

The hero and any card containing paragraph text stays light. Contrast targets in
this file still apply to every gradient surface.

## Responsive Navigation

Public mobile navigation should prioritize:

- Active needs
- Report aid
- Track
- More

Coordinator navigation may use:

- Dashboard
- Approvals
- Needs
- Locations
- More

Do not mix public and coordinator navigation without clear role context.

## Dates and Numbers

Initial product locale is Turkish.

Display:

- Dates in Turkish format
- Times in 24-hour format
- Quantities with Turkish number formatting
- Clear units adjacent to values

Store dates internally in timezone-safe formats.

Never store formatted display dates as authoritative date values.
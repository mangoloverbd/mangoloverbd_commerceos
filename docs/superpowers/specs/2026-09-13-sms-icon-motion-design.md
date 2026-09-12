# SMS Action Icon and Dialog Motion Design

## Goal

Refresh the individual SMS action in the order editor with the supplied chat-bubble SVG and make the SMS composer open and close with a smooth, accessible Framer Motion transition.

## Design

- Add a focused `SmsBubbleIcon` component that renders the supplied 24px viewBox SVG with `currentColor`, allowing the action button to control its color and size.
- Replace the existing Phosphor `ChatText` icon in `CustomerPanel` without changing the button label or availability rules.
- Keep Radix Dialog responsible for focus management, Escape handling, and modal semantics. Keep its portal and overlay, and animate the content wrapper with `AnimatePresence` and `motion.div` using a short opacity/scale/vertical offset transition.
- Respect `useReducedMotion()` by removing positional/scaling motion while retaining a brief opacity transition.

## Verification

- Add a focused icon test for the supplied SVG path structure and accessible SMS action rendering.
- Keep the existing SMS dialog send/error tests passing.
- Run focused tests, the full test suite, lint, and the production build.

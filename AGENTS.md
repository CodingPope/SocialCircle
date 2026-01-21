# Social Circle (Codex) – Project Instructions

These instructions are derived from `.github/instructions/CopilotSocialCircle.instructions.md`.

## Product

- Social Circle is a mobile app (ages 21–40+) for making friends via short-term in-person events; it is not a dating app.
- Map-first, highly local, low-friction user flows.

## Working Style (Avoid “Bare Minimum”)

- Start each task by stating: goal, success criteria, and constraints (mobile-only, Firebase module rules, etc.).
- If the request is ambiguous, ask up to 3 clarifying questions; otherwise proceed with clearly stated assumptions.
- Prefer changes that are small in diff but complete in behavior (don’t stop at “it compiles” if it breaks flows).

## Tech Constraints

- Mobile-only: iOS + Android (React Native + Expo). Do not introduce web-only code paths.
- Firebase client usage must use native modules: `@react-native-firebase/*` (no Firebase web SDK).
- Do not use browser APIs/globals (`window`, `document`, `localStorage`, etc.).
- Do not add new dependencies or new build steps without asking first.

## Firebase Guidance

- Firestore collections: `users`, `events`, `chats`, `messages`, `categories`, `businesses`.
- Join flow: add user to `attendees`; if full, show “Join Waitlist”.
- Events disappear from map after `endTime`.
- Chats archive after inactivity or manual close (don’t block UI on this).

## Navigation Safety (Prevent “NAVIGATE … not handled”)

- Never invent route names; confirm the target screen is registered in the current navigator (or navigate via parent with `{ screen: ... }`).
- If adding/changing a screen, update the owning navigator (often `src/navigation/AppNavigator.js`) and any feature exports, then verify call sites.
- Prefer using existing screen-name constants/maps when available (e.g., feature `screens.js`) instead of duplicating strings.

## Cloud Functions (Server Only)

- Code under `functions/` uses the Admin SDK (`firebase-admin`).
- Never use React Native Firebase or Firebase web SDK in `functions/`.

## Code Quality & UX

- Prefer small, reusable components over large nested screens.
- Keep key flows fast (aim for ~3 taps from discovery to RSVP).
- Handle null/edge cases; avoid assumptions about Firestore data.
- Avoid creating new `.md` files unless explicitly requested.

## Definition Of Done (Before You Say “Done”)

- No redbox/runtime errors introduced in affected flows (especially navigation).
- `npm test` (or the closest available targeted check) passes when changes touch logic/components with tests.
- Summarize what changed + what you verified (commands run, flows sanity-checked).

## Comments (When Needed)

- If adding inline comments, prefer the format: `// Description: ...`

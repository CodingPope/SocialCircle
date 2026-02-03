# Social Circle — Agent Instructions (Codex + Copilot)

Social Circle is a mobile app (ages 21–40+) for making real friends via short-term, in-person events.
Map-first, highly local, low-friction user flows. Not a dating app. :contentReference[oaicite:5]{index=5}

## Stack (source of truth: package.json)

- Expo SDK 53 (dev-client workflow)
- React 19 + React Native 0.79
- React Navigation v7
- Firebase: @react-native-firebase/\* (primary), plus firebase JS SDK present (treat as legacy unless already used in a specific area)
- State: Zustand
- Testing: jest-expo :contentReference[oaicite:6]{index=6}

## Working Style (avoid “bare minimum”)

- Start each task with:
  1. Goal
  2. Success criteria
  3. Constraints (mobile-only, Firebase rules, no new deps, etc.)
- If ambiguous, ask up to 3 clarifying questions; otherwise proceed with explicit assumptions.
- Prefer changes that are small in diff but complete in behavior (don’t stop at “it compiles” if it breaks flows).
- When changing logic, add/adjust tests when practical.

## Non-negotiable Constraints

- Mobile-only (iOS + Android). Do not introduce web-only code paths or browser globals (`window`, `document`, `localStorage`).
- Do not add new dependencies or new build steps without asking first.
- Keep performance tight: avoid extra re-renders, expensive map operations, unbounded listeners, and heavy images.

## Commands (run these, don’t invent new ones)

- Start dev client: `npm run start`
- Clear cache: `npm run start:clear`
- iOS: `npm run ios` or physical device `npm run ios:device`
- Android: `npm run android`
- Tests: `npm test` (CI style: `npm run test:ci`) :contentReference[oaicite:7]{index=7}

## Repo Structure Rules

- App code lives under `src/` and entry points are `App.js` + `index.js`.
- Cloud Functions are under `functions/` (server-only). If there is a `functions/package.json`, treat it as a separate Node project with its own install/run steps.
- Prefer existing patterns/utilities/components over introducing parallel abstractions.

## Firebase Guidance (Mobile)

- Prefer `@react-native-firebase/*` in mobile runtime.
- Do NOT import `firebase-admin` or `firebase-functions` into mobile app code (server only).
- If you see `firebase` (web SDK) used in mobile code, treat it as legacy:
  - Don’t expand its usage.
  - Prefer migrating that area to `@react-native-firebase/*` when touching it, unless migration is risky for the current task. :contentReference[oaicite:8]{index=8}

### Firestore conventions (product expectations)

- Main collections: `users`, `events`, `chats`, `messages`, `categories`, `businesses`.
- Join flow: add user to `attendees`; if full, show “Join Waitlist”.
- Events disappear from map after `endTime`.
- Chats can archive after inactivity or manual close; do not block UI on archiving.  
  (Note: verify exact field names/types in code + rules before shipping changes.)

## Navigation Safety (Prevent “NAVIGATE … not handled”)

- Never invent route names.
- Confirm the target screen is registered in the current navigator before navigating.
- If adding/changing a screen:
  - Update the owning navigator(s)
  - Update any screen maps/constants (if present)
  - Verify at least one real navigation path end-to-end (manual sanity check)

## UI/UX Quality Rules

- Prefer small reusable components over giant screens.
- Handle null/edge cases from Firestore (missing fields, deleted docs, permission failures).
- Avoid UI jank: debounce user typing where needed, avoid heavy work on render, and keep map markers performant.
- Keep core flow fast (aim ~3 taps from discovery → RSVP).

## Definition of Done (before you say “done”)

- No redbox/runtime errors introduced in affected flows (especially navigation + map).
- Tests still pass (`npm test`) when changes touch logic/components covered by tests.
- Summarize:
  - What changed
  - What you verified (commands run + key flows sanity-checked)
  - Any follow-ups or risks

## Comments (when needed)

- Prefer minimal, high-signal inline comments:
  - `// Description: ...`

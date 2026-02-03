# Social Circle — Copilot Instructions (Repo-wide)

Primary reference: follow `/AGENTS.md` for workflow, commands, and definition of done.

## Non-negotiables

- Mobile-only (iOS/Android). No browser globals (`window`, `document`, `localStorage`).
- Do not add new dependencies or new build steps unless explicitly requested.
- Do not create new `.md` files unless explicitly requested.

## Stack (source of truth: package.json)

- Expo (SDK 53), React Native
- State: Zustand (and existing Context where already used)
- Navigation: React Navigation
- Backend: Firebase (Firestore/Auth/Storage)
- Firebase on mobile MUST use `@react-native-firebase/*` modules.

## Firebase rules

- In app runtime (`src/**`): use `@react-native-firebase/firestore`, `auth`, `storage`, etc.
- Never use `firebase-admin` in mobile code.
- Never introduce Firebase Web SDK syntax (`firebase/app`, `firebase/firestore`, `getFirestore`, etc.) into mobile code.
- In Cloud Functions only (`functions/**`): use `firebase-admin` + `firebase-functions`.

## Navigation safety

- Never invent route names.
- Confirm the screen exists in the active navigator before navigating.
- If adding a screen, wire it into the correct navigator(s) and verify at least one real navigation path.

## Performance guardrails (maps + feeds)

- Use `FlatList` for feeds/lists; avoid giant `ScrollView`s.
- Avoid nesting VirtualizedLists in ScrollViews.
- Avoid expensive work in render; reduce unnecessary re-renders.
- Be conservative with real-time listeners; always unsubscribe on unmount.

## Data correctness

- Treat Firestore data as untrusted: handle missing fields, nulls, deleted docs, and permission errors.
- Prefer small diffs but complete behavior; don’t stop at “it compiles” if flows break.

## Output expectations

- Provide the exact code changes.
- Briefly summarize what changed and what you verified (commands run and key flows checked).
- Note any follow-ups or risks.

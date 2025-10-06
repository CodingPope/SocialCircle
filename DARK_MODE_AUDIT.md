# 🌓 Dark Mode Audit & Fix Plan

_Last updated: 2025-10-05 22:36:35 (UTC)_

## 1. Root Causes
- Components still ship hard-coded light-mode colors (`#fff`, `#000`, `#007AFF`, etc.) instead of using `theme.colors.*`.
- Some screens render gradients/panels outside the theme provider (e.g., ManageInterests) so dark palette never applies.
- The dark palette in `src/theme/index.js` lacks a few semantic tokens, making substitutions harder (no dedicated chip, input, or elevated-card colors).

These gaps keep large portions of the UI “stuck” in light mode, resulting in the screenshots you shared.

---

## 2. Hard-Coded Color Inventory
Colors grouped by impact (High = user-facing core flows, Medium = secondary screens, Low = edge/legacy). Line references are approximate; adjust if code shifts.

### 🔴 High-Impact
| File | Examples of Hard-Coded Colors | Why It Hurts Dark Mode | Est. Fix |
| --- | --- | --- | --- |
| `src/features/events/components/MapScreen.js` | `#007AFF`, `#FFFFFF`, `#3A7BFF`, `#101824`, `#E5E7EB`, gradient chip text `#1F1F1F` | Search bar, filter chips, FABs, tutorials & preview cards ignore theme → entire map UI stays light | 4–6 hrs (many style blocks + map markers) |
| `src/features/interestPosts/components/InterestPostCard.js` | `#f5a623`, `#8e8e93`, `#c7c7cc`, `#fff`, `#1c1c1e`, `#007AFF` | Cards dominate Discovery & Profile tabs; ratings/badges unreadable in dark mode | 3–4 hrs |
| `src/features/events/components/EventPopUpCard.js` | `#2563EB`, `#F8FAFC`, `#F2F4F7`, `#111827`, `#E8F1FF`, `#FDE8E8` | Event details modal sits on top of map; bright backgrounds & chips flare | 3 hrs |
| `src/features/events/components/MyCircle.js` | `#f8f9fb`, `#4da6ff`, `#222`, `#888`, `#E8F1FF` | Entire dashboard is light-only, clashes with dark nav bar | 3 hrs |
| `src/features/notifications/components/NotificationScreen.js` | `#fff`, `#2563EB`, `#0EA5E9`, `#22C55E`, `#F7F8FA` | Notification list & empty state stay white (see screenshot) | 2–3 hrs |

### 🟠 Medium-Impact
| File | Hard-Coded Colors | Notes | Est. Fix |
| --- | --- | --- | --- |
| `src/components/map/BlipPreview.js` | `#E5E7EB`, `#111827`, `#F3F4F6`, `#B91C1C`, `#FEE2E2` | Preview card overlays map, so mismatch is obvious | 2 hrs |
| `src/components/map/CategoryMarker.js` | `#FF4444`, `#FFFFFF` | Marker badges & text | 1 hr |
| `src/components/map/MapFilterBar.js` | `#4CAF50`, `#E0E0E0` | Filter chips for business map still light | 1 hr |
| `src/features/events/components/EventListView.js` | `#FFFFFF`, `#1F2937`, `#E5E7EB` | Drawer list feels blinding in dark mode | 1.5 hrs |
| `src/features/events/components/DiscoveryScreen.js` | `#fff`, `#0A84FF`, `#e5edff`, `#1F2937` | Tabs, cards, and header rely on fixed blues/whites | 2 hrs |

### 🟡 Low-Impact / Legacy
| File | Hard-Coded Colors | Notes |
| --- | --- | --- |
| `src/features/business/...` screens | `#2F80ED`, `#fff`, `#ccc` | Business flows still hardcode brand blue |
| `src/components/analytics/AnalyticsConsentPrompt.js` | `#EEF1F5`, `#1E88E5`, `#2F3A4A` | Modal shown intermittently |
| `src/navigation/UserHeader.js` | `#f4511e` | Custom stack header for a few stacks |
| Various icons (`RatingStars`, `Badge`, etc.) | `#FFD700`, `#007AFF` | Minor polish once core screens fixed |

> ✅ Tip: `rg "#[0-9A-Fa-f]{3,6}" src -n` returns the full list if you need to cross-check.

---

## 3. Palette Review (`src/theme/index.js`)
Current dark palette is close to modern guidelines, but consider:
- **textSecondary (`#94A3B8`)** – borderline 4.3:1 contrast on `#0B1120`. Suggest bumping to `#AFC2DE`.
- **border (`#334155`)** – blends with card backgrounds. Try `#3F4D63` or introduce `borderStrong` for dividers.
- **Missing semantic tokens**: chips, elevated cards, inputs, success/warning/danger backgrounds. Adding them makes refactors faster and avoids ad-hoc hex values.

Proposed additions:
```ts
chipBackground: { light: '#EEF2FF', dark: 'rgba(255,255,255,0.12)' }
chipActiveBackground: { light: '#2563EB', dark: '#3B82F6' }
inputBackground: { light: '#F8FAFC', dark: '#1F2937' }
cardElevated: { light: '#FFFFFF', dark: '#111827' }
```

---

## 4. MapScreen Search Bar Alignment Fix
**Symptom**: Placeholder text overlaps the search icon on both platforms.

**Cause**: The `GooglePlacesAutocomplete` text input didn’t reserve horizontal space for the leading icon. The input’s own style and `textInputProps.style` lacked sufficient left padding.

**Fix**:
```diff
 textInputProps={{
   ...
-  style: {
-    color: theme.colors.text,
-    paddingLeft: 40,
-    paddingRight: 8,
-  },
+  style: {
+    color: theme.colors.text,
+    paddingLeft: 44,   // 18px icon + 6px margin + buffer
+    paddingRight: 8,
+  },
 }}
 ...
 styles={{
   ...
   textInput: {
     height: 44,
     fontSize: 16,
     backgroundColor: 'transparent',
-    paddingLeft: 40,
+    paddingLeft: 44,
     paddingRight: 8,
     color: theme.colors.text,
   },
 }}
```
This gives both iOS and Android enough inset so the text starts to the right of the icon without affecting the dropdown list.

---

## 5. Recommended Work Breakdown
| Phase | Scope | Est. Effort |
| --- | --- | --- |
| 1 | Refactor MapScreen styles & markers to theme tokens | 4–6 hrs |
| 2 | Theme InterestPostCard (and related feed cards) | 3–4 hrs |
| 3 | Update EventPopUpCard + EventListView | 3 hrs |
| 4 | MyCircle & NotificationScreen cleanup | 4 hrs |
| 5 | Secondary components (BlipPreview, CategoryMarker, business screens) | 4 hrs |
| 6 | Palette polish + add semantic tokens | 2 hrs |

Total: ~20–23 hrs for a thorough dark-mode pass (not counting QA).

---

## 6. Next Steps
1. **Refactor MapScreen** using new semantic tokens (chips, tutorials, FABs). Leverage `theme.colors` and fall back to new semantic entries if needed.
2. **Create shared chip/button styles** that pull from the theme once the palette additions land.
3. **Iteratively migrate** other high-priority components above, testing each in light and dark mode.
4. **Run cross-device checks** (iOS/Android) and update screenshots to confirm parity.

Once these steps land, dark mode will look intentional instead of accidental.

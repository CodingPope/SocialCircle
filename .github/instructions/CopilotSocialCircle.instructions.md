---
applyTo: '**'
---

# 🧠 Social Circle – Copilot Coding Instruction

You're helping me build **Social Circle** — a mobile app designed for adults (ages 21–40+) to make friends and meet in person through short-term events. This is not a dating app. It's casual, interest-based, and time-limited. Think “Snap Map meets Meetup” — fast, map-first, and highly local.

---

## 🎯 App Mission

- Enable people to create and join **in-person social events** within 3–7 days
- Use a **map-first UI** for discovery and spontaneity
- Prioritize **trust**, **real connection**, and **low social friction**

---

## ⚙️ Tech Stack

| Area       | Tool/Service                      |
| ---------- | --------------------------------- |
| Frontend   | React Native (Expo)               |
| State Mgmt | Zustand or Context API            |
| Backend    | Firebase (Firestore)              |
| Auth       | Firebase Auth                     |
| Maps       | Google Maps API                   |
| Storage    | Firebase Storage (images)         |
| Optional   | Cloud Functions, Mixpanel, Stripe |

---

## 📱 Main Screens

### 🗺 Map (Home)

- Press-and-hold to create event
- Tap pin to view details
- Pins colored by category or type (friends, trending, sponsored)

### 🔍 Discover Feed

- Interest-based, trending, and friend-attended events
- Scrollable cards with RSVP/Join buttons

### 👥 My Circle

- Events you're hosting or attending
- Possibly a segmented view: Hosting | Attending | Past
- Option for calendar integration

### 👤 Profile

- Bio, interests, profile picture, rating, badges
- Event history (with highlights/photos)
- Friends list (MVP version = simple)

### 🔔 Notifications

- RSVP alerts, chat messages, friend requests, new event suggestions

---

## 🛠 Key Functional Requirements

- **Firestore schema**:
  - `users`, `events`, `chats`, `messages`, `categories`, `businesses`
- **Event flow**:
  - Join = add to attendees
  - If event is full → show “Join Waitlist”
  - Group chat created on first RSVP
- **Events disappear from map** after their `endTime`
- **Chats archive** after X days of inactivity or manual close
- **Interests used to filter map + feed**

---

## 🔐 Trust & Safety Features

- Users rate hosts and events (1–5 stars)
- Reporting system for events or people
- Host controls: kick, block, close RSVPs
- Profile verification system (basic for MVP: verified email or phone)

---

## 💼 Business Logic (Modular / Phase 2+)

- Business accounts = `user.type = "business"`
- Must be verified + pay for visibility
- Businesses can:
  - Host sponsored events
  - Pin their venue on the map
  - Get analytics (views, RSVPs, interest data)
- Tiered plans: Free (limited), Premium (highlighted, always-on pins)

---

## 💡 Copilot Guidance

**When writing code, always**:

- Suggest scalable Firestore structures (avoid tight coupling)
- Modularize UI components (especially event cards, modals, pins, chats)
- Use best React Native practices (accessibility, responsive design)
- Optimize for fast user flows (3 taps or less from discovery to RSVP)
- Prepare for future features (like filters, clustering, user roles)
- Use comments like this:

  ```js
  // Description: [what this block does]
  ```

  Avoid:

- Hardcoding unless explicitly mocking or stubbing
- Long, nested components – extract into reusables
- Making assumptions about Firestore data without checking null/edge cases
- UI-blocking logic on user flows (keep it responsive)

---

## 🧪 Example Task Prompt to Use with Copilot

> “Build an RSVP button component. When clicked, it should check if the event is full (based on `capacity` and `attendees` array). If not full, add the current user to `attendees` and navigate to the group chat. If full, show a toast saying 'Join Waitlist' and call a `joinWaitlist` function. Use Firestore for data updates and avoid unnecessary reads.”

---

## ✅ Goal Reminder

Social Circle is:

- **Spontaneous**
- **Friendly**
- **Map-first**
- **Focused on real-life socializing**

Let’s build it clean, fast, and scalable.

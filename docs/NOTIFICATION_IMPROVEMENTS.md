# Notification System Improvements

## Summary

Implemented comprehensive notification improvements including new notification types, better routing, and UI fixes.

---

## 🔔 New Notification Types

### 1. Event Cancelled (`event_cancelled`)

**Location:** `functions/index.js` - `deleteEvent` callable

- **Trigger:** When a host cancels/deletes an event
- **Recipients:** All attendees (excluding the host)
- **Message:** `"[Event Title] has been cancelled"`
- **Navigation:** Links to event details page
- **Implementation:** Added notification creation within the transaction when `isDeleted` is set to `true`

### 2. Event Reminder (`event_reminder`)

**Location:** `functions/index.js` - `sendEventReminders` scheduled function

- **Trigger:** Scheduled function runs every 15 minutes, finds events starting in 60-75 minutes
- **Recipients:** All attendees + host
- **Message:** `"[Event Title] starts in 1 hour!"`
- **Navigation:** Links to event details page
- **Implementation:**
  - New scheduled Cloud Function using `onSchedule`
  - Queries events with `date` between 60-75 minutes from now
  - Checks for duplicate reminders before sending
  - Batch creates notifications for all recipients

### 3. User Joined Event (`event_joined`)

**Location:** `functions/index.js` - `acceptRsvpRequest` and `rsvpEvent` callables

- **Trigger:** When someone joins an event (either via RSVP approval or direct join)
- **Recipients:** Event host/owner
- **Message:** `"[User Name] joined [Event Title]"`
- **Navigation:** Links to event details page
- **Implementation:**
  - Added to `acceptRsvpRequest` after transaction completes
  - Added to `rsvpEvent` after transaction completes
  - Fetches user display name for personalized message

---

## 📱 Notification Navigation Fixes

### Chat Message Notifications

**Location:** `functions/index.js` - `onMessageCreateNotify` trigger

- **Improvements:**
  - Title now shows sender name: `"[Sender Name] in [Event Title]"`
  - Body shows message text or "Sent a message"
  - Data payload includes:
    - `linkType: 'chat'` for proper routing
    - `senderId` and `senderName` for context
    - `eventId` for navigation

### App-Level Notification Handler

**Location:** `App.js` - Notification response listener

- **Improvements:**
  - Smart routing based on `linkType`:
    - `linkType: 'chat'` → Navigate to `EventChat` screen
    - `linkType: 'event'` → Navigate to `EventDetail` screen
    - Default: Falls back to event detail for event-related notifications
  - Added error logging for debugging
  - Handles both new and legacy notification formats

---

## 🎨 UI/UX Improvements

### EventChatScreen Modal Swipe-to-Close

**Location:** `EventChatScreen.js`

- **Problem:** Drag handle was too small and hard to reach in safe area
- **Solution:**
  - Created dedicated `dragHandleContainer` with larger touch area
  - Separated drag handle from scrollable content
  - Added `swipeThreshold={80}` to modal for easier gesture recognition
  - Modal wrapper structure:
    ```
    <Modal>
      <View style={modalWrapper}>           // Container with rounded corners
        <View style={dragHandleContainer}>  // Fixed drag area at top
          <View style={dragHandle} />       // Visual drag indicator
        </View>
        <ScrollView style={modalContent}>  // Scrollable content
          ...
        </ScrollView>
      </View>
    </Modal>
    ```
  - Styles optimized:
    - `dragHandleContainer`: 12pt top padding, 8pt bottom padding
    - Modal max height: 95% of screen (was 100%)
    - Better separation between drag area and content

---

## 📋 Testing Checklist

### Cloud Functions (requires deployment)

- [ ] Deploy Cloud Functions: `firebase deploy --only functions`
- [ ] Verify scheduled function created: Check Firebase Console > Functions
- [ ] Test event cancellation notification
- [ ] Test event reminder (wait for scheduled run or test locally)
- [ ] Test user joined notification (RSVP and direct join)

### Chat Notifications

- [ ] Send a chat message and verify:
  - [ ] Push notification shows sender name
  - [ ] Tapping notification opens EventChat screen
  - [ ] Notification displays message text

### UI Testing

- [ ] Open EventChatScreen
- [ ] Tap hamburger menu (⋯) to open modal
- [ ] Verify drag handle is visible and accessible
- [ ] Swipe down from top to close modal
- [ ] Test on different devices (notch vs non-notch)

### Navigation Testing

- [ ] Receive event_cancelled notification → tap → opens event detail
- [ ] Receive event_reminder notification → tap → opens event detail
- [ ] Receive event_joined notification → tap → opens event detail
- [ ] Receive chat notification → tap → opens chat screen

---

## 🔧 Configuration Notes

### Scheduled Function

The `sendEventReminders` function runs every 15 minutes:

- **Schedule:** `'every 15 minutes'`
- **Timezone:** UTC
- **Memory:** 256MiB
- **Timeout:** 120 seconds

To adjust the reminder timing window, modify these lines in `sendEventReminders`:

```javascript
const reminderStart = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour
const reminderEnd = new Date(now.getTime() + 75 * 60 * 1000); // 1h 15min
```

### Notification Types Summary

| Type               | Trigger               | Recipient        | Screen      |
| ------------------ | --------------------- | ---------------- | ----------- |
| `event_cancelled`  | Host deletes event    | All attendees    | EventDetail |
| `event_reminder`   | 1hr before event      | Attendees + host | EventDetail |
| `event_joined`     | User joins event      | Host             | EventDetail |
| `rsvp_request`     | User requests to join | Host             | EventDetail |
| `request_accepted` | Host accepts RSVP     | Requester        | EventDetail |
| `chat_message`     | New message in chat   | All participants | EventChat   |

---

## 📝 Files Modified

1. **functions/index.js**

   - Added `event_cancelled` notifications in `deleteEvent`
   - Added `sendEventReminders` scheduled function
   - Added `event_joined` notifications in `acceptRsvpRequest` and `rsvpEvent`
   - Enhanced chat message notifications with sender info

2. **App.js**

   - Improved notification response handler with smart routing
   - Added error logging

3. **EventChatScreen.js**
   - Restructured modal for better swipe-to-close UX
   - Added `dragHandleContainer` and `modalWrapper`
   - Updated styles for better accessibility

---

## 🚀 Deployment Steps

1. **Deploy Cloud Functions:**

   ```bash
   cd functions
   npm install  # If any dependencies were added
   cd ..
   firebase deploy --only functions
   ```

2. **Test in Development:**

   ```bash
   npm start
   # or
   npm run ios
   ```

3. **Monitor Function Logs:**
   ```bash
   firebase functions:log --only sendEventReminders
   ```

---

## 🐛 Troubleshooting

### Reminders not sending

- Check Firebase Console > Functions > Logs for errors
- Verify scheduled function is enabled
- Check if events exist in the reminder time window
- Ensure `isDeleted` field is `false` on events

### Notifications not navigating correctly

- Check notification data payload includes `linkType` and `eventId`
- Verify App.js notification listener is registered
- Check device notification permissions

### Modal not swipeable

- Ensure react-native-modal is properly installed
- Check if `swipeDirection='down'` is set
- Verify modal is not blocked by parent touchable components

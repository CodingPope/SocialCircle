# Firestore Performance & Cost Controls

## Overview

This document outlines performance optimizations and cost controls implemented for Firestore queries in Social Circle.

---

## 🚀 Implemented Optimizations

### 1. Cache Size Limit (Production)

**Location**: `src/services/firebase/config.js`

**Change**: Set cache size to **50MB** in production (unlimited in dev)

```javascript
cacheSizeBytes: __DEV__ ? firestore.CACHE_SIZE_UNLIMITED : 50 * 1024 * 1024;
```

**Rationale**:

- Prevents unbounded cache growth on devices
- 50MB supports ~5,000-10,000 event documents with images and user data
- Balances offline capability with memory constraints
- Development uses unlimited for easier debugging

---

### 2. Query Limits on Realtime Listeners

#### Notifications Listener

**Location**: `src/features/notifications/stores/notificationStore.js`

**Change**: Added limit of 100 most recent notifications

```javascript
.where('recipientId', '==', userId)
.orderBy('createdAt', 'desc')
.limit(100)
```

**Impact**:

- Prevents unbounded reads for power users
- Reduces bandwidth and battery usage
- Most users will never hit 100 notifications

#### My Circle - Hosting Events

**Location**: `src/features/events/components/MyCircle.js`

**Change**: Limited to 100 most recent hosted events

```javascript
.where('ownerId', '==', user.uid)
.orderBy('createdAt', 'desc')
.limit(100)
```

#### My Circle - Attending Events

**Location**: `src/features/events/components/MyCircle.js`

**Change**: Limited to 100 most recent attending events

```javascript
.where('attendees', 'array-contains', user.uid)
.orderBy('date', 'desc')
.limit(100)
```

---

### 3. Composite Indexes

#### Added Index: Notifications by Recipient + Created Date

**Location**: `firestore.indexes.json`

```json
{
  "collectionGroup": "notifications",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "recipientId", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

**Purpose**: Optimizes the notifications query with `where` + `orderBy` + `limit`

#### Existing Indexes Verified

- ✅ Events by geohash + interest + status + isDeleted + createdAt
- ✅ Events by geohash + interest + status + isDeleted + date
- ✅ Events by ownerId + createdAt
- ✅ Events by status + category + date
- ✅ Businesses by ownerId + createdAt

---

## ⚠️ Known Limitations & Future Optimizations

### Attendee Array Pattern

**Current Implementation**: Events store attendees as an array of UIDs

```javascript
event: {
  attendees: ["uid1", "uid2", "uid3", ...],
  capacity: 20
}
```

**Limitations**:

1. **Document Size**: Each event document grows as attendees join

   - Max Firestore doc size: 1MB
   - Each UID: ~28 bytes
   - Theoretical max: ~35,000 attendees (impractical)
   - **Realistic limit**: ~500-1,000 attendees before performance degrades

2. **Read Costs**: Every read of an event fetches entire attendee array

   - Small events (<20 people): Minimal impact
   - Large events (>100 people): ~3KB+ per read just for UIDs

3. **Query Performance**: `array-contains` queries on large arrays are slower

### Recommended Future Refactor (Phase 2+)

**When events regularly exceed 100 attendees**, consider:

#### Option 1: Subcollection Pattern

```
events/{eventId}/attendees/{userId} = { joinedAt, status }
```

**Pros**: Scales to unlimited attendees, better query performance
**Cons**: Requires aggregation query for count, more complex joins

#### Option 2: Denormalized Count + Subcollection

```javascript
event: {
  attendeeCount: 150,  // Denormalized for display
  attendeeSnippets: {  // First 3 for preview
    uid1: { name, photoURL },
    uid2: { name, photoURL },
    uid3: { name, photoURL }
  }
}
events/{eventId}/attendees/{userId} = { joinedAt, status }
```

**Pros**: Fast reads for UI, scalable, still shows preview
**Cons**: Requires Cloud Functions to maintain count

#### Option 3: Separate Collection

```
eventAttendees/{eventId_userId} = { eventId, userId, joinedAt }
```

**Pros**: Simple queries, scales well
**Cons**: Join complexity, no native count

---

## 📊 Current Query Costs (Estimates)

### Discovery Feed Queries

- **Hot Events**: 1-10 bounds × 1-2 interest chunks = 2-20 reads per query
- **Cache TTL**: 2 minutes (reduces repeated reads)
- **Estimated cost**: ~0.02¢ per user per session

### Realtime Listeners

- **Notifications**: 1 initial read + incremental updates
- **My Circle (Hosting)**: 1 initial read + incremental updates (max 100 docs)
- **My Circle (Attending)**: 1 initial read + incremental updates (max 100 docs)
- **Estimated cost**: ~0.01¢ per user per day

### Map Queries

- Geohash-based queries with radius filtering
- Typically 1-4 geohash bounds per query
- **Cache TTL**: Event-based (reduces repeated reads)
- **Estimated cost**: ~0.01¢ per map interaction

---

## 🔍 Monitoring & Alerts (Future)

### Recommended Metrics to Track

1. **Average attendee array size** across all events
2. **95th percentile event document size**
3. **Query latency** for discovery feeds
4. **Cache hit rate** (if measurable via SDK)
5. **Daily read/write counts** by collection

### Alert Thresholds

- Event document size > 200KB
- Attendee array > 500 users
- Query latency > 3 seconds
- Daily reads > 100K (adjust based on DAU)

---

## ✅ Best Practices

### When Writing Queries

1. ✅ Always use `.limit()` on unbounded queries
2. ✅ Add `.orderBy()` to enable index optimization
3. ✅ Use composite indexes for multi-field queries
4. ✅ Prefer denormalized data for read-heavy operations
5. ✅ Cache results with reasonable TTL (2-5 minutes)

### When Designing Data Models

1. ✅ Keep frequently-read fields at document root
2. ✅ Use subcollections for unbounded lists (comments, messages, etc.)
3. ✅ Denormalize counts and snippets for UI performance
4. ✅ Document size should stay under 100KB for best performance

### Cost Control

1. ✅ Use TTL caching for repeated queries
2. ✅ Implement pagination for large result sets
3. ✅ Limit realtime listeners to active screens only
4. ✅ Use offline persistence to reduce reads
5. ✅ Monitor Firestore usage dashboard weekly

---

## 📚 References

- [Firestore Best Practices](https://firebase.google.com/docs/firestore/best-practices)
- [Query Performance](https://firebase.google.com/docs/firestore/query-data/indexing)
- [Data Model Design](https://firebase.google.com/docs/firestore/manage-data/structure-data)
- [Pricing Calculator](https://firebase.google.com/pricing)

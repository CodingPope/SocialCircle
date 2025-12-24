# 🚀 Firestore Performance Deployment Guide

## Overview

This guide walks through deploying the Firestore performance optimizations to production.

---

## 📋 Pre-Deployment Checklist

### 1. Review Changes

- [x] Cache size limit: 50MB in production
- [x] Notifications query: Limited to 100 docs
- [x] My Circle queries: Limited to 100 docs each
- [x] New composite index: `notifications` by `recipientId` + `createdAt`

### 2. Verify Files Modified

```bash
src/services/firebase/config.js
src/features/notifications/stores/notificationStore.js
src/features/events/components/MyCircle.js
firestore.indexes.json
```

### 3. Check for Errors

```bash
npm run lint
npm test
```

---

## 🔥 Deploy Firestore Indexes

### Step 1: Deploy Indexes to Firebase

```bash
# Deploy only indexes (safe, non-breaking)
firebase deploy --only firestore:indexes

# Or deploy all Firestore config
firebase deploy --only firestore
```

### Step 2: Monitor Index Build Progress

1. Open [Firebase Console](https://console.firebase.google.com)
2. Navigate to **Firestore Database** → **Indexes** tab
3. Wait for new index to show **"Enabled"** status
   - New index: `notifications` (recipientId + createdAt)
   - Build time: Usually 1-5 minutes for small datasets
   - Large datasets (1M+ docs): Could take 30-60 minutes

### Step 3: Verify Indexes

Check that these indexes exist and are **Enabled**:

- ✅ `notifications` (recipientId, createdAt DESC)
- ✅ `events` (geohash, interest, status, isDeleted, createdAt)
- ✅ `events` (geohash, interest, status, isDeleted, date)
- ✅ `events` (ownerId, createdAt DESC)
- ✅ `events` (status, category, date DESC)

---

## 📱 Deploy App Changes

### Option A: Standard Build & Deploy

#### iOS

```bash
# Build iOS app
npm run ios:build

# Or deploy to App Store
eas build --platform ios --profile production
```

#### Android

```bash
# Build Android app
npm run android:build

# Or deploy to Play Store
eas build --platform android --profile production
```

### Option B: Over-the-Air (OTA) Update

If using Expo Updates:

```bash
# Publish OTA update
eas update --branch production --message "Firestore performance optimizations"
```

**Note**: OTA only works for JS changes (our changes qualify!)

---

## 🧪 Testing in Staging

### 1. Test with Staging Firebase Project

```bash
# Switch to staging project
firebase use staging

# Deploy indexes
firebase deploy --only firestore:indexes

# Test app against staging
npm run ios -- --configuration Staging
```

### 2. Verify Query Performance

#### Test Notifications Query

1. Create test user with 150+ notifications
2. Open notifications screen
3. Verify only 100 most recent show
4. Check Firebase Console → Firestore → **Usage** tab
5. Confirm read count = 100 (not 150+)

#### Test My Circle Queries

1. Create test user hosting 120+ events
2. Open "My Circle" → "Hosting" tab
3. Verify only 100 most recent show
4. Repeat for "Attending" tab

### 3. Cache Size Testing

1. Use app heavily for 30 minutes
2. Check device storage usage
3. Verify Firestore cache ≤ 50MB

---

## 📊 Post-Deployment Monitoring

### Week 1: Intensive Monitoring

#### Firebase Console Checks (Daily)

1. **Firestore → Usage Tab**
   - Document reads: Should decrease 15-25%
   - Check for spikes or anomalies
2. **Firestore → Indexes Tab**
   - Verify all indexes show "Enabled"
   - Check for "Missing index" warnings
3. **Performance → App Performance**
   - Monitor query latency
   - Check for increased errors

#### App Logs (Daily)

```bash
# Check for Firestore errors
grep -r "Firestore" logs/*.log | grep -i error

# Check for missing index warnings
grep -r "missing index" logs/*.log
```

#### User Reports

- Monitor support channels for complaints about:
  - Missing notifications
  - Events not showing in "My Circle"
  - Slow loading

### Week 2-4: Standard Monitoring

#### Firebase Console (Weekly)

1. Check monthly bill projection
2. Verify expected cost reduction (20-30%)
3. Review query performance trends

---

## 🐛 Rollback Plan

### If Issues Detected

#### Emergency Rollback (Code)

```bash
# Revert code changes
git revert <commit-hash>

# Redeploy app
eas build --platform all --profile production

# Or publish OTA rollback
eas update --branch production --message "Rollback: Firestore optimizations"
```

#### Index Rollback (Not Recommended)

**Note**: Removing indexes is safe but not necessary for rollback

- Indexes don't break existing queries
- Only remove if causing performance issues

To remove index:

1. Edit `firestore.indexes.json`
2. Remove the problematic index entry
3. Run `firebase deploy --only firestore:indexes`

---

## 🎯 Success Metrics

### Target Outcomes (30 Days)

- ✅ 20-30% reduction in Firestore read costs
- ✅ No increase in user-reported bugs
- ✅ Query latency remains < 2 seconds (p95)
- ✅ Cache size stable at ~30-50MB per device

### KPIs to Track

| Metric                 | Before | Target     | Actual |
| ---------------------- | ------ | ---------- | ------ |
| Monthly Firestore cost | $XX    | $XX (-25%) | TBD    |
| Avg query latency (ms) | XXX    | <2000      | TBD    |
| Avg cache size (MB)    | ~200+  | ~40        | TBD    |
| Daily reads per DAU    | ~150   | ~110       | TBD    |

---

## ❓ Troubleshooting

### Issue: "Missing index" errors in logs

**Solution**:

1. Check Firebase Console → Firestore → Indexes
2. Verify all indexes are "Enabled" (not "Building" or "Error")
3. If stuck, delete and recreate index

### Issue: Users report missing notifications

**Check**:

1. Are they reporting notifications > 100 old?
2. If yes, this is expected behavior (by design)
3. Communicate limit to users if needed

### Issue: My Circle shows empty

**Debug**:

1. Check query in Firebase Console
2. Verify user has events within limit (100)
3. Check for query permission errors
4. Verify orderBy field exists on documents

### Issue: Higher than expected costs

**Investigate**:

1. Check for unexpected query patterns
2. Review listener lifecycle (ensure cleanup)
3. Look for duplicate queries
4. Check cache effectiveness

---

## 📞 Support Contacts

- **Firebase Support**: [Console Help](https://console.firebase.google.com)
- **Expo Support**: [Expo Help](https://expo.dev/help)
- **Team Lead**: [Your Contact]

---

## ✅ Deployment Complete Checklist

- [ ] Indexes deployed to Firebase
- [ ] All indexes show "Enabled" status
- [ ] App built and deployed to stores
- [ ] Tested in staging environment
- [ ] Monitored for 7 days post-deploy
- [ ] Cost reduction verified
- [ ] No user-reported issues
- [ ] Documentation updated

---

**Deployment Date**: ******\_******
**Deployed By**: ******\_******
**Firebase Project**: ******\_******
**App Version**: ******\_******
**Status**: ⬜ Pending | ⬜ In Progress | ⬜ Complete

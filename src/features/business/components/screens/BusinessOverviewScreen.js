import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../../theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../../../auth/context/AuthContext';
import { db } from '../../../../services/firebase';
import { Timestamp } from '../../../../services/firebase/firestoreCompat';
import { getBusinessCapabilities } from '../../../../lib/business/businessCapabilities';
import { BUSINESS_TIERS } from '../../../../lib/business/businessConstants';
import { useNavigation } from '@react-navigation/native';

// Description: Business Overview Screen - live counts, quick actions, and tier-gated snapshot
export default function BusinessOverviewScreen({ route }) {
  const theme = useTheme();
  const navigation = useNavigation();
  const { user } = useAuth();
  const businessId = route?.params?.businessId || user?.businessId;

  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liveCounts, setLiveCounts] = useState({ events: 0, perks: 0 });
  const [snapshot, setSnapshot] = useState({
    views: '—',
    saves: '—',
    rsvps: '—',
    perkSaves: '—',
  });

  const routeTier = route?.params?.businessTier;
  const businessTier = useMemo(
    () =>
      routeTier ||
      business?.tier ||
      business?.businessTier ||
      BUSINESS_TIERS.TIER_1_FREE,
    [routeTier, business],
  );

  const capabilities = useMemo(
    () => getBusinessCapabilities(businessTier),
    [businessTier],
  );

  // Load business profile
  useEffect(() => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    let active = true;
    const unsub = db
      .collection('businesses')
      .doc(businessId)
      .onSnapshot(
        (snap) => {
          if (!active) return;
          if (snap.exists) {
            setBusiness({ id: snap.id, ...snap.data() });
          }
          setLoading(false);
        },
        () => {
          if (active) setLoading(false);
        },
      );
    return () => {
      active = false;
      unsub?.();
    };
  }, [businessId]);

  // Fetch live counts
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    const fetchCounts = async () => {
      try {
        const now = Timestamp.now();
        const eventsSnap = await db
          .collection('events')
          .where('businessId', '==', businessId)
          .where('isActive', '==', true)
          .where('endAt', '>', now)
          .get();

        let perksCount = 0;
        if (capabilities.canCreatePerk) {
          const perksSnap = await db
            .collection('perks')
            .where('businessId', '==', businessId)
            .where('isActive', '==', true)
            .where('expiresAt', '>', now)
            .get();
          perksCount = perksSnap.size;
        }

        if (active) {
          setLiveCounts({ events: eventsSnap.size, perks: perksCount });
        }
      } catch (e) {
        // Keep graceful degradation
      }
    };
    fetchCounts();
    return () => {
      active = false;
    };
  }, [businessId, capabilities.canCreatePerk]);

  // Placeholder snapshot (future: hook into analytics)
  useEffect(() => {
    if (!businessId) return;
    // Minimal placeholder that meets spec until tracking arrives
    setSnapshot((prev) => ({
      ...prev,
      rsvps: prev.rsvps === '—' ? '0' : prev.rsvps,
      views: prev.views === '—' ? '0' : prev.views,
      saves: prev.saves === '—' ? '0' : prev.saves,
      perkSaves: prev.perkSaves === '—' ? '0' : prev.perkSaves,
    }));
  }, [businessId]);

  const handleCreateEvent = useCallback(() => {
    navigation.navigate('BusinessEventForm', {
      businessId,
      businessTier,
    });
  }, [navigation, businessId, businessTier]);

  const handleCreatePerk = useCallback(() => {
    navigation.navigate('BusinessPerkForm', {
      businessId,
      businessTier,
    });
  }, [navigation, businessId, businessTier]);

  const handleUpgrade = useCallback(() => {
    navigation.navigate('BusinessSettings');
  }, [navigation]);

  if (!businessId) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.center}>
          <Ionicons
            name='briefcase-outline'
            size={48}
            color={theme.colors.textSecondary}
          />
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
            No business account
          </Text>
          <Text
            style={[
              styles.emptySubtitle,
              { color: theme.colors.textSecondary },
            ]}
          >
            Create a business profile to see your overview.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.center}>
          <ActivityIndicator size='large' color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Ionicons
            name='analytics-outline'
            size={40}
            color={theme.colors.primary}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              Live overview
            </Text>
            <Text
              style={[styles.subtitle, { color: theme.colors.textSecondary }]}
            >
              Stay on top of events and perks
            </Text>
          </View>
        </View>

        {/* Live section */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Live
            </Text>
            <View style={styles.badge}>
              <Text style={[styles.badgeText, { color: theme.colors.primary }]}>
                Updated
              </Text>
            </View>
          </View>
          <View style={styles.metricsRow}>
            <MetricPill
              icon='calendar-outline'
              label='Active events'
              value={liveCounts.events}
              theme={theme}
            />
            {capabilities.canCreatePerk && (
              <MetricPill
                icon='gift-outline'
                label='Active perks'
                value={liveCounts.perks}
                theme={theme}
              />
            )}
          </View>
          <View style={styles.chipsRow}>
            {liveCounts.events === 0 && (
              <Chip
                icon='alert-circle'
                text='No upcoming events'
                theme={theme}
              />
            )}
            {capabilities.canCreatePerk && liveCounts.perks === 0 && (
              <Chip icon='pricetag' text='No active perks' theme={theme} />
            )}
          </View>
        </View>

        {/* Quick actions */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Quick actions
            </Text>
          </View>
          <View style={styles.actionsRow}>
            <ActionButton
              icon='add-circle-outline'
              label='Create Event'
              onPress={handleCreateEvent}
              theme={theme}
            />
            <ActionButton
              icon='gift-outline'
              label='Create Perk'
              onPress={
                capabilities.canCreatePerk ? handleCreatePerk : undefined
              }
              disabled={!capabilities.canCreatePerk}
              helper={
                !capabilities.canCreatePerk ? 'Upgrade to unlock' : undefined
              }
              theme={theme}
            />
            {businessTier === BUSINESS_TIERS.TIER_1_FREE && (
              <ActionButton
                icon='trending-up-outline'
                label='Upgrade'
                onPress={handleUpgrade}
                theme={theme}
              />
            )}
          </View>
        </View>

        {/* Performance snapshot */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Performance snapshot
            </Text>
            <Text
              style={[styles.caption, { color: theme.colors.textSecondary }]}
            >
              This week
            </Text>
          </View>
          <View style={styles.metricsGrid}>
            <SnapshotStat label='RSVPs' value={snapshot.rsvps} theme={theme} />
            {businessTier !== BUSINESS_TIERS.TIER_1_FREE && (
              <>
                <SnapshotStat
                  label='Views'
                  value={snapshot.views}
                  theme={theme}
                />
                <SnapshotStat
                  label='Saves'
                  value={snapshot.saves}
                  theme={theme}
                />
                <SnapshotStat
                  label='Perk saves'
                  value={snapshot.perkSaves}
                  theme={theme}
                />
              </>
            )}
            {businessTier === BUSINESS_TIERS.TIER_1_FREE && (
              <LockedRow text='Upgrade to unlock more metrics' theme={theme} />
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const MetricPill = ({ icon, label, value, theme }) => (
  <View
    style={[
      styles.metricPill,
      { backgroundColor: theme.colors.backgroundSecondary },
    ]}
  >
    <Ionicons name={icon} size={18} color={theme.colors.primary} />
    <View style={{ marginLeft: 8 }}>
      <Text style={[styles.metricValue, { color: theme.colors.text }]}>
        {value}
      </Text>
      <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>
        {label}
      </Text>
    </View>
  </View>
);

const Chip = ({ icon, text, theme }) => (
  <View
    style={[
      styles.chip,
      {
        backgroundColor: theme.colors.backgroundSecondary,
        borderColor: theme.colors.border,
      },
    ]}
  >
    <Ionicons name={icon} size={14} color={theme.colors.textSecondary} />
    <Text style={[styles.chipText, { color: theme.colors.textSecondary }]}>
      {text}
    </Text>
  </View>
);

const ActionButton = ({ icon, label, onPress, disabled, helper, theme }) => (
  <TouchableOpacity
    style={[
      styles.actionButton,
      {
        backgroundColor: theme.colors.backgroundSecondary,
        borderColor: theme.colors.border,
      },
      disabled && { opacity: 0.5 },
    ]}
    onPress={onPress}
    disabled={disabled}
  >
    <Ionicons name={icon} size={22} color={theme.colors.primary} />
    <Text style={[styles.actionLabel, { color: theme.colors.text }]}>
      {label}
    </Text>
    {helper && (
      <Text style={[styles.helperText, { color: theme.colors.textSecondary }]}>
        {helper}
      </Text>
    )}
  </TouchableOpacity>
);

const SnapshotStat = ({ label, value, theme }) => (
  <View
    style={[
      styles.snapshotStat,
      { backgroundColor: theme.colors.backgroundSecondary },
    ]}
  >
    <Text style={[styles.snapshotValue, { color: theme.colors.text }]}>
      {value}
    </Text>
    <Text style={[styles.snapshotLabel, { color: theme.colors.textSecondary }]}>
      {label}
    </Text>
  </View>
);

const LockedRow = ({ text, theme }) => (
  <View style={[styles.lockedRow, { borderColor: theme.colors.border }]}>
    <Ionicons
      name='lock-closed-outline'
      size={16}
      color={theme.colors.textSecondary}
    />
    <Text style={[styles.lockedText, { color: theme.colors.textSecondary }]}>
      {text}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  caption: {
    fontSize: 13,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(99,102,241,0.08)',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  metricLabel: {
    fontSize: 13,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    gap: 6,
  },
  chipText: {
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 6,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
  },
  metricsGrid: {
    gap: 10,
  },
  snapshotStat: {
    borderRadius: 12,
    padding: 12,
  },
  snapshotValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  snapshotLabel: {
    fontSize: 13,
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  lockedText: {
    fontSize: 13,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
});

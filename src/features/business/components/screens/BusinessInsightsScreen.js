import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../../theme';
import { useAuth } from '../../../auth/context/AuthContext';
import { db } from '../../../../services/firebase';
import { Timestamp } from '../../../../services/firebase/firestoreCompat';
import { getBusinessCapabilities } from '../../../../lib/business/businessCapabilities';
import { BUSINESS_TIERS } from '../../../../lib/business/businessConstants';

// Description: Business Insights Screen (v1) - Last 7 days metrics with safe placeholders
export default function BusinessInsightsScreen({ route }) {
  const theme = useTheme();
  const { user } = useAuth();
  const businessId = route?.params?.businessId || user?.businessId;

  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    rsvps: '—',
    views: '—',
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

  // Load business doc
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

  // Fetch RSVPs (last 7 days) using event attendees length as fallback source
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    const fetchRsvps = async () => {
      try {
        const now = new Date();
        const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const startTs = Timestamp.fromDate(start);

        const snap = await db
          .collection('events')
          .where('businessId', '==', businessId)
          .where('hostType', '==', 'BUSINESS')
          .where('startAt', '>=', startTs)
          .get();

        let total = 0;
        snap.forEach((doc) => {
          const data = doc.data() || {};
          if (typeof data.rsvpCount === 'number') {
            total += data.rsvpCount;
          } else if (Array.isArray(data.attendees)) {
            total += data.attendees.length;
          }
        });

        if (active) {
          setMetrics((prev) => ({ ...prev, rsvps: total }));
        }
      } catch (err) {
        // On permission/network issues, leave as '—'
      }
    };
    fetchRsvps();
    return () => {
      active = false;
    };
  }, [businessId]);

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
            Create a business profile to view insights.
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

  const isTier1 = businessTier === BUSINESS_TIERS.TIER_1_FREE;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Ionicons
            name='stats-chart-outline'
            size={40}
            color={theme.colors.primary}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              Last 7 days
            </Text>
            <Text
              style={[styles.subtitle, { color: theme.colors.textSecondary }]}
            >
              Key activity for your business
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
            Engagement
          </Text>
          <View style={styles.metricsGrid}>
            <Stat label='Event RSVPs' value={metrics.rsvps} theme={theme} />
            {isTier1 ? (
              <LockedRow
                text='Upgrade to unlock views & perk saves'
                theme={theme}
              />
            ) : (
              <>
                <Stat
                  label='Event views'
                  value={metrics.views}
                  hint='Tracking not enabled yet'
                  theme={theme}
                />
                {capabilities.canCreatePerk && (
                  <Stat
                    label='Perk saves'
                    value={metrics.perkSaves}
                    hint='Tracking not enabled yet'
                    theme={theme}
                  />
                )}
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const Stat = ({ label, value, hint, theme }) => (
  <View
    style={[
      styles.statBox,
      { backgroundColor: theme.colors.backgroundSecondary },
    ]}
  >
    <Text style={[styles.statValue, { color: theme.colors.text }]}>
      {value}
    </Text>
    <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>
      {label}
    </Text>
    {hint && (
      <Text style={[styles.statHint, { color: theme.colors.textSecondary }]}>
        {hint}
      </Text>
    )}
  </View>
);

const LockedRow = ({ text, theme }) => (
  <View
    style={[
      styles.lockedRow,
      {
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.backgroundSecondary,
      },
    ]}
  >
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
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  metricsGrid: {
    gap: 10,
  },
  statBox: {
    borderRadius: 12,
    padding: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 14,
    marginTop: 4,
  },
  statHint: {
    fontSize: 12,
    marginTop: 4,
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

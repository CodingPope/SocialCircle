import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../../theme';
import { useAuth } from '../../../auth/context/AuthContext';
import { db } from '../../../../services/firebase';
import { getBusinessCapabilities } from '../../../../lib/business/businessCapabilities';
import { BUSINESS_TIERS, DEFAULT_TIER } from '../../../../lib/business/businessConstants';

export default function BusinessSettingsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const theme = useTheme();
  const { user } = useAuth();
  const businessId = route?.params?.bizId || user?.businessId || null;

  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tierWarning, setTierWarning] = useState(false);

  const tier = useMemo(() => {
    const t = business?.tier || business?.businessTier;
    if (!t) {
      setTierWarning(true);
      return DEFAULT_TIER;
    }
    return t;
  }, [business]);

  const capabilities = useMemo(() => getBusinessCapabilities(tier), [tier]);

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
          setBusiness(snap.exists ? { id: snap.id, ...snap.data() } : null);
          setLoading(false);
        },
        () => active && setLoading(false)
      );
    return () => {
      active = false;
      unsub?.();
    };
  }, [businessId]);

  const goToUpgrade = (requestedTier) => {
    navigation.navigate('BusinessUpgrade', {
      bizId: businessId,
      currentTier: tier,
      requestedTier,
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size='large' color={theme.colors.primary} />
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>Loading settings…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!businessId || !business) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.center}>
          <Ionicons name='briefcase-outline' size={48} color={theme.colors.textSecondary} />
          <Text style={[styles.title, { color: theme.colors.text }]}>No business profile</Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            Finish setup to access business settings.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => navigation.navigate('BusinessOnboarding')}
          >
            <Text style={styles.primaryButtonText}>Finish setup</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const limits = [
    { label: 'Monthly events', value: formatCap(capabilities.monthlyEventLimit) },
    { label: 'Monthly perks', value: formatCap(capabilities.monthlyPerkLimit) },
    { label: 'Max active events', value: formatCap(capabilities.maxActiveEvents) },
    { label: 'Max active perks', value: formatCap(capabilities.maxActivePerks) },
    { label: 'Max radius (mi)', value: formatCap(capabilities.maxTargetRadiusMiles || capabilities.maxTargetRadius) },
    { label: 'Interest slots', value: formatCap(capabilities.interestSlots) },
    { label: 'Category slots', value: formatCap(capabilities.categorySlots) },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.header, { color: theme.colors.text }]}>Business Settings</Text>
        <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
          Manage your plan, limits, and account.
        </Text>
        {tierWarning && (
          <View style={[styles.alert, { borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundSecondary }]}>
            <Ionicons name='alert-circle-outline' size={18} color={theme.colors.textSecondary} />
            <Text style={[styles.alertText, { color: theme.colors.textSecondary }]}>
              Tier not set—showing Free defaults.
            </Text>
          </View>
        )}

        {/* Plan card */}
        <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Plan</Text>
          <Text style={[styles.planName, { color: theme.colors.text }]}>{tierLabel(tier)}</Text>
          <View style={styles.bulletList}>
            <Bullet text={capabilities.canCreatePerk ? 'Perks enabled' : 'Perks locked'} theme={theme} />
            <Bullet
              text={`Interests up to ${formatCap(capabilities.interestSlots)}`}
              theme={theme}
            />
            <Bullet
              text={`Radius up to ${formatCap(capabilities.maxTargetRadiusMiles || capabilities.maxTargetRadius)} mi`}
              theme={theme}
            />
          </View>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => goToUpgrade(tier)}
          >
            <Text style={styles.primaryButtonText}>View Plans</Text>
          </TouchableOpacity>
        </View>

        {/* Limits */}
        <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Posting limits</Text>
          {limits.map((item) => (
            <View key={item.label} style={[styles.row, { borderColor: theme.colors.border }]}>
              <Text style={[styles.rowLabel, { color: theme.colors.text }]}>{item.label}</Text>
              <Text style={[styles.rowValue, { color: theme.colors.textSecondary }]}>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* Account */}
        <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Account</Text>
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
            onPress={() =>
              Alert.alert('Coming soon', 'Deactivating a business profile will be available later.')
            }
          >
            <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>
              Deactivate business profile
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Upgrade screen
export function BusinessUpgradeScreen({ route, navigation }) {
  const theme = useTheme();
  const { user } = useAuth();
  const businessId = route?.params?.bizId || user?.businessId || null;
  const currentTier = route?.params?.currentTier || DEFAULT_TIER;
  const tiers = Object.values(BUSINESS_TIERS);
  const [toast, setToast] = useState(null);

  const handleRequest = async (requestedTier) => {
    if (!businessId) {
      Alert.alert('No business', 'Set up a business profile first.');
      return;
    }
    try {
      await db.collection('businessUpgradeRequests').add({
        businessId,
        ownerUid: user?.uid || null,
        requestedTier,
        currentTier,
        status: 'PENDING',
        createdAt: new Date(),
      });
      setToast('Upgrade request sent');
      Alert.alert('Request sent', 'We will review your upgrade request shortly.');
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      Alert.alert('Request failed', err?.message || 'Please try again.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.header, { color: theme.colors.text }]}>View Plans</Text>
        <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
          Request an upgrade—changes are applied by an admin.
        </Text>
        {tiers.map((t) => {
          const caps = getBusinessCapabilities(t);
          return (
            <View
              key={t}
              style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
            >
              <Text style={[styles.planName, { color: theme.colors.text }]}>{tierLabel(t)}</Text>
              <View style={styles.bulletList}>
                <Bullet text={`Events/mo: ${formatCap(caps.monthlyEventLimit)}`} theme={theme} />
                <Bullet text={`Perks/mo: ${formatCap(caps.monthlyPerkLimit)}`} theme={theme} />
                <Bullet text={`Active events: ${formatCap(caps.maxActiveEvents)}`} theme={theme} />
                <Bullet text={`Active perks: ${formatCap(caps.maxActivePerks)}`} theme={theme} />
                <Bullet
                  text={`Radius: ${formatCap(caps.maxTargetRadiusMiles || caps.maxTargetRadius)} mi`}
                  theme={theme}
                />
                <Bullet
                  text={`Interests: ${formatCap(caps.interestSlots)}`}
                  theme={theme}
                />
                <Bullet
                  text={`Categories: ${formatCap(caps.categorySlots)}`}
                  theme={theme}
                />
              </View>
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
                onPress={() => handleRequest(t)}
              >
                <Text style={styles.primaryButtonText}>
                  {currentTier === t ? 'Current plan' : 'Request upgrade'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
      {toast && (
        <View style={[styles.toast, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.toastText, { color: theme.colors.text }]}>{toast}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// Helpers
const formatCap = (v) => {
  if (v === Infinity) return 'Unlimited';
  if (v === undefined || v === null) return '—';
  return String(v);
};

const tierLabel = (tier) => {
  switch (tier) {
    case BUSINESS_TIERS.TIER_1_FREE:
      return 'Free';
    case BUSINESS_TIERS.TIER_2_GROWTH:
      return 'Growth';
    case BUSINESS_TIERS.TIER_3_LANDMARK:
      return 'Landmark';
    case BUSINESS_TIERS.TIER_4_ENTERPRISE:
      return 'Enterprise';
    default:
      return 'Unknown';
  }
};

const Bullet = ({ text, theme }) => (
  <View style={styles.bulletRow}>
    <Ionicons name='checkmark-circle-outline' size={18} color={theme.colors.primary} />
    <Text style={[styles.bulletText, { color: theme.colors.text }]}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, padding: 24 },
  header: { fontSize: 22, fontWeight: '700' },
  helper: { fontSize: 14, marginBottom: 8 },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderRadius: 10,
  },
  alertText: { fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  planName: { fontSize: 18, fontWeight: '700' },
  bulletList: { gap: 6 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bulletText: { fontSize: 14 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  rowLabel: { fontSize: 14, fontWeight: '600' },
  rowValue: { fontSize: 14 },
  primaryButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryButton: {
    marginTop: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButtonText: { fontWeight: '600', fontSize: 15 },
  toast: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  toastText: { fontWeight: '600', fontSize: 14 },
});

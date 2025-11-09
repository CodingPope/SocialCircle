// Description: Placeholder Business Home until full console is built
import React, { useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  useBizOnboarding,
  BUSINESS_ONBOARDING_STAGES,
} from '../stores/businessOnboardingStore';
import { useAuth } from '../../auth/context/AuthContext';

export default function BusinessHomePlaceholder() {
  const navigation = useNavigation();
  const { draft, locations, bizId, resumeLatestDraft, loading, stage } =
    useBizOnboarding();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user?.uid) {
      resumeLatestDraft(user.uid);
    }
  }, [authLoading, user?.uid, resumeLatestDraft]);

  const statusSummary = useMemo(() => {
    const status = (draft?.status || 'draft').toLowerCase();
    if (status === 'active') return 'Your business profile is live.';
    if (status === 'pending_review') return 'Your profile is pending review.';
    if (!bizId) return 'No business draft yet.';
    switch (stage) {
      case BUSINESS_ONBOARDING_STAGES.BASICS:
        return 'Add your basics to keep moving.';
      case BUSINESS_ONBOARDING_STAGES.LOCATION:
        return 'Save your primary location next.';
      case BUSINESS_ONBOARDING_STAGES.REVIEW:
        return 'Review your info and submit for launch.';
      default:
        return 'Finish setup to activate your profile.';
    }
  }, [draft?.status, bizId, stage]);

  const verificationStatus = (draft?.verification?.status || 'pending')
    .toString()
    .toLowerCase();
  const hasLocation = Array.isArray(locations) && locations.length > 0;

  const openOnboarding = (route) => {
    const destination = route || 'Intro';
    const parent = navigation.getParent?.();
    if (parent?.navigate) {
      parent.navigate('BusinessOnboarding', { screen: destination });
    } else {
      navigation.navigate('BusinessOnboarding', { screen: destination });
    }
  };

  const openEvents = () => {
    const parent = navigation.getParent?.();
    if (parent?.navigate) {
      parent.navigate('BusinessTabs', { screen: 'BizMap' });
    } else {
      navigation.navigate('BizMap');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Business Home</Text>
      <Text style={styles.subtitle}>{draft?.displayName || 'Welcome!'}</Text>
      <Text style={styles.summary}>{statusSummary}</Text>
      {loading && (
        <Text style={[styles.summary, { color: '#999', marginTop: 4 }]}>
          Refreshing business status…
        </Text>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Profile checklist</Text>
        <ChecklistRow
          label='Business basics'
          complete={Boolean(draft?.displayName && draft?.category)}
          onPress={() => openOnboarding('Basics')}
        />
        <ChecklistRow
          label='Primary location'
          complete={hasLocation}
          onPress={() => openOnboarding('Location')}
        />
        <ChecklistRow
          label='Review & submit'
          complete={stage === BUSINESS_ONBOARDING_STAGES.DONE || verificationStatus === 'verified'}
          onPress={() => openOnboarding('Review')}
        />
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => openOnboarding('Review')}
      >
        <Text style={styles.primaryLabel}>Review & launch</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={openEvents}>
        <Text style={styles.secondaryLabel}>Create first event</Text>
      </TouchableOpacity>
    </View>
  );
}

function ChecklistRow({ label, complete, onPress, optional }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <Ionicons
        name={complete ? 'checkmark-circle' : 'ellipse-outline'}
        size={20}
        color={complete ? '#27AE60' : '#999'}
        style={{ marginRight: 10 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>
          {label}
          {optional ? ' (optional)' : ''}
        </Text>
        {!complete && !optional && (
          <Text style={styles.rowHint}>Tap to finish this step</Text>
        )}
      </View>
      {!complete && (
        <Ionicons name='chevron-forward' size={16} color='#999' />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#F8F9FA' },
  title: { fontSize: 22, fontWeight: '700', color: '#1A1A1A' },
  subtitle: { fontSize: 16, color: '#2F80ED', marginTop: 4, fontWeight: '600' },
  summary: { fontSize: 14, color: '#555', marginTop: 10, lineHeight: 20 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  rowLabel: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  rowHint: { fontSize: 12, color: '#888', marginTop: 2 },
  primaryButton: {
    backgroundColor: '#2F80ED',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 24,
  },
  primaryLabel: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  secondaryButton: {
    backgroundColor: '#27AE60',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryLabel: { color: '#FFF', fontWeight: '700', fontSize: 16 },
});

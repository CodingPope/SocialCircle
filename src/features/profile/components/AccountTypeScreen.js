import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../../auth/context/AuthContext';
import auth from '@react-native-firebase/auth';
import appCheck from '@react-native-firebase/app-check';
import logger from '../../../lib/logger';
import { useTheme } from '../../../theme';
import { useSessionRole } from '../stores/sessionRoleStore';
import { useBizOnboarding } from '../../business/stores/businessOnboardingStore';
import { switchToPersonalAccount } from '../../../services/firebase/config';

const BENEFITS = [
  {
    icon: 'briefcase-outline',
    text: 'Public business profile with category and description.',
  },
  {
    icon: 'stats-chart-outline',
    text: 'Insights on profile views, follows, and event engagement.',
  },
  {
    icon: 'call-outline',
    text: 'Contact buttons for email, phone, or website.',
  },
  {
    icon: 'megaphone-outline',
    text: 'Tools to promote events and posts.',
  },
];

const REQUIREMENTS = [
  { icon: 'pricetag-outline', text: 'Business name and category.' },
  { icon: 'location-outline', text: 'Primary business location.' },
  { icon: 'mail-outline', text: 'Support email or phone.' },
  { icon: 'globe-outline', text: 'Website or social link (optional).' },
];

const RETAINED = [
  {
    icon: 'checkmark-circle-outline',
    text: 'Your username, followers, and posts stay the same.',
  },
  {
    icon: 'checkmark-circle-outline',
    text: 'You can switch back to personal anytime.',
  },
];

export default function AccountTypeScreen({ navigation }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user, loading: authLoading } = useAuth();
  const role = useSessionRole((s) => s.role);
  const setRole = useSessionRole((s) => s.setRole);
  const isBusiness = role === 'business';
  const { start, resumeLatestDraft, loading: bizLoading } = useBizOnboarding();
  const [starting, setStarting] = useState(false);
  const userIsBusiness =
    isBusiness || String(user?.type || '').toLowerCase() === 'business';

  // If Firestore user record already says business, sync the session role.
  React.useEffect(() => {
    if (userIsBusiness && role !== 'business') {
      try {
        setRole('business');
      } catch {}
    }
  }, [userIsBusiness, role, setRole]);

  const handleStartSetup = async () => {
    if (authLoading || starting || bizLoading) return;
    if (!user?.uid) {
      Alert.alert('Sign in required', 'Please sign in to continue.');
      return;
    }
    setStarting(true);
    try {
      // Ensure auth token and App Check token are fresh before calling the callable
      try {
        // Force refresh ID token - helps when tokens have expired or not propagated
        await auth().currentUser?.getIdToken(true);
      } catch (tokenErr) {
        logger.warn(
          '[bizOnboarding] ID token refresh failed:',
          tokenErr?.message || tokenErr
        );
      }

      // Try to prefetch an App Check token in dev to avoid UNAUTHENTICATED from enforced callables
      if (__DEV__) {
        try {
          await appCheck().getToken(true);
        } catch (acErr) {
          logger.warn(
            '[bizOnboarding] App Check token prefetch failed:',
            acErr?.message || acErr
          );
        }
      }
      const existing = await resumeLatestDraft(user.uid, { force: true });
      if (existing?.bizId) return;
      const id = await start(user.uid);
      if (!id) {
        Alert.alert(
          'Unable to start',
          'We could not start business setup. Please try again.'
        );
      }
    } catch (error) {
      Alert.alert(
        'Unable to start',
        error?.message || 'Something went wrong. Please try again.'
      );
    } finally {
      setStarting(false);
    }
  };

  const switchToPersonal = async () => {
    try {
      setRole('consumer');
    } catch {}
    if (!user?.uid) return;
    try {
      await switchToPersonalAccount();
    } catch (error) {
      Alert.alert(
        'Unable to switch',
        error?.message || 'Please try again in a moment.'
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityLabel='Go back'
        >
          <Ionicons name='arrow-back' size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account settings</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your account type</Text>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {userIsBusiness ? 'Business' : 'Personal'}
              </Text>
            </View>
            <Text style={styles.badgeNote}>
              {userIsBusiness
                ? 'Business tools are enabled for this account.'
                : 'Switch to business to unlock analytics and contact tools.'}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Switch to a business account</Text>
          <Text style={styles.cardDescription}>
            Create a public business profile tied to your current account. You
            keep your personal profile and can switch back anytime.
          </Text>

          <Text style={styles.sectionLabel}>What you get</Text>
          {BENEFITS.map((item) => (
            <View key={item.text} style={styles.listRow}>
              <Ionicons
                name={item.icon}
                size={18}
                color={theme.colors.primary}
                style={styles.listIcon}
              />
              <Text style={styles.listText}>{item.text}</Text>
            </View>
          ))}

          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
            We will ask for
          </Text>
          {REQUIREMENTS.map((item) => (
            <View key={item.text} style={styles.listRow}>
              <Ionicons
                name={item.icon}
                size={18}
                color={theme.colors.textSecondary}
                style={styles.listIcon}
              />
              <Text style={styles.listText}>{item.text}</Text>
            </View>
          ))}

          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
            What stays the same
          </Text>
          {RETAINED.map((item) => (
            <View key={item.text} style={styles.listRow}>
              <Ionicons
                name={item.icon}
                size={18}
                color={theme.colors.success}
                style={styles.listIcon}
              />
              <Text style={styles.listText}>{item.text}</Text>
            </View>
          ))}

          {userIsBusiness ? (
            <>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() =>
                  navigation.navigate('BusinessOnboarding', {
                    screen: 'BusinessHome',
                  })
                }
                accessibilityRole='button'
              >
                <Text style={styles.primaryButtonText}>
                  Manage business profile
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={switchToPersonal}
                accessibilityRole='button'
              >
                <Text style={styles.secondaryButtonText}>
                  Switch back to personal
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (starting || bizLoading) && styles.primaryButtonDisabled,
                ]}
                onPress={handleStartSetup}
                disabled={starting || bizLoading}
                accessibilityRole='button'
              >
                {starting || bizLoading ? (
                  <ActivityIndicator color='#FFFFFF' />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Start business setup
                  </Text>
                )}
              </TouchableOpacity>
              <Text style={styles.helperText}>
                We accept any email or phone for testing.
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme) => {
  const { colors, spacing, radii } = theme;
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xl,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      padding: spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: spacing.lg,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    cardDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
      marginBottom: spacing.sm,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.pill,
      backgroundColor: colors.chipBackground,
      marginRight: spacing.sm,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.chipText,
    },
    badgeNote: {
      flex: 1,
      fontSize: 13,
      color: colors.textSecondary,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: spacing.sm,
    },
    listIcon: {
      marginRight: spacing.sm,
      marginTop: 2,
    },
    listText: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
      lineHeight: 20,
    },
    primaryButton: {
      marginTop: spacing.md,
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    primaryButtonDisabled: {
      backgroundColor: colors.neutral500,
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    secondaryButton: {
      marginTop: spacing.sm,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    helperText: {
      marginTop: spacing.sm,
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
};

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db, serverTimestamp } from '../../../../../services/firebase/config';
import { useUserStore } from '../../../../profile';
import AnimatedGradientBackground from '../../../../../components/ui/AnimatedGradientBackground';
import { logOnboardingStepComplete } from '../../../../../services/onboardingAnalyticsService';
import Button from '../../../../../components/ui/Button';
import { useTheme } from '../../../../../theme';

const createStyles = (theme) => {
  const { colors, radii, spacing } = theme;
  return StyleSheet.create({
    safe: { flex: 1 },
    backButtonContainer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContainer: {
      flexGrow: 1,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl * 2,
      paddingBottom: spacing.xl * 3,
    },
    header: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.neutral100,
      textAlign: 'center',
      marginBottom: spacing.md,
      textShadowColor: 'rgba(0,0,0,0.2)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 4,
    },
    subtitle: {
      fontSize: 16,
      color: colors.neutral100,
      textAlign: 'center',
      marginBottom: spacing.xl,
      opacity: 0.9,
      lineHeight: 24,
    },
    tosContainer: {
      backgroundColor: theme.isDark
        ? 'rgba(30, 41, 59, 0.95)'
        : 'rgba(255, 255, 255, 0.95)',
      borderRadius: radii.xl,
      padding: spacing.xl,
      marginBottom: spacing.xl,
      borderWidth: 1,
      borderColor: theme.isDark
        ? 'rgba(148, 163, 184, 0.2)'
        : 'rgba(226, 232, 240, 0.5)',
    },
    tosTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.isDark ? '#FFFFFF' : colors.neutral900,
      marginBottom: spacing.md,
    },
    tosText: {
      fontSize: 14,
      color: theme.isDark ? '#FFFFFF' : colors.neutral700,
      lineHeight: 22,
      marginBottom: spacing.md,
    },
    bulletPoint: {
      fontSize: 14,
      color: theme.isDark ? '#FFFFFF' : colors.neutral700,
      lineHeight: 22,
      marginBottom: spacing.sm,
      paddingLeft: spacing.md,
    },
    linkButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.isDark
        ? 'rgba(59, 130, 246, 0.2)'
        : 'rgba(59, 130, 246, 0.15)',
      padding: spacing.md,
      borderRadius: radii.lg,
      marginTop: spacing.md,
    },
    linkButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.primary,
      marginLeft: spacing.sm,
    },
    checkboxContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: theme.isDark
        ? 'rgba(30, 41, 59, 0.95)'
        : 'rgba(255, 255, 255, 0.95)',
      borderRadius: radii.xl,
      padding: spacing.lg,
      marginBottom: spacing.xl,
      borderWidth: 1,
      borderColor: theme.isDark
        ? 'rgba(148, 163, 184, 0.2)'
        : 'rgba(226, 232, 240, 0.5)',
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: radii.sm,
      borderWidth: 2,
      borderColor: colors.primary,
      marginRight: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    checkboxChecked: {
      backgroundColor: colors.primary,
    },
    checkboxLabel: {
      flex: 1,
      fontSize: 15,
      color: theme.isDark ? '#FFFFFF' : colors.neutral900,
      lineHeight: 22,
    },
    buttonContainer: {
      marginTop: spacing.md,
    },
    disabledButton: {
      opacity: 0.5,
    },
  });
};

// Description: TOS Acceptance Screen for onboarding (Guideline 1.2 compliance)
// Users must accept TOS before creating user-generated content (events)
// Can also be accessed from Settings → Privacy & Legal for updates
export default function TOSAcceptanceScreen({ navigation, route }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);

  // Check if called from Settings (vs onboarding flow)
  const fromSettings = route?.params?.fromSettings || false;
  const onComplete = route?.params?.onComplete;

  const [accepted, setAccepted] = useState(user?.tosAccepted || false);
  const [saving, setSaving] = useState(false);

  // Description: Open full TOS document in browser or modal
  const openFullTOS = async () => {
    try {
      // Production TOS URL - host this document on your website
      const tosUrl = 'https://www.findyourcircle.app/terms';
      const supported = await Linking.canOpenURL(tosUrl);
      if (supported) {
        await Linking.openURL(tosUrl);
      } else {
        alert(
          'Unable to open Terms of Service. Please visit socialcircle.app/legal/terms-of-service'
        );
      }
    } catch (error) {
      console.error('[TOS] Failed to open TOS link:', error);
      alert(
        'Unable to open Terms of Service. Please visit socialcircle.app/legal/terms-of-service'
      );
    }
  };

  // Description: Save TOS acceptance to Firestore and continue onboarding
  const handleAccept = async () => {
    if (!accepted || !user?.uid) return;

    setSaving(true);
    try {
      const userDocRef = db.collection('users').doc(user.uid);
      const timestamp = serverTimestamp();

      await userDocRef.set(
        {
          tosAccepted: true,
          tosAcceptedAt: timestamp,
          tosVersion: '1.0', // Increment when TOS changes
          tosPromptedAt: timestamp,
        },
        { merge: true }
      );

      // Update local user store
      setUser({
        ...user,
        tosAccepted: true,
        tosAcceptedAt: new Date(),
        tosVersion: '1.0',
        tosPromptedAt: new Date(),
      });

      // Log analytics event
      await logOnboardingStepComplete('TOS', {
        tosVersion: '1.0',
        accepted: true,
      });

      // Navigate based on context
      if (fromSettings) {
        // Called from Settings - go back
        if (onComplete) {
          onComplete();
        } else {
          navigation.goBack();
        }
      } else {
        // Onboarding flow - continue to next step
        navigation.replace('InterestsScreen');
      }
    } catch (error) {
      console.error('[TOS] Failed to save acceptance:', error);
      alert(
        'Failed to save your acceptance. Please check your connection and try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  // Description: Allow user to decline TOS but continue with limited access
  // They can browse events but cannot create/join/chat (UGC features blocked)
  const handleDecline = async () => {
    if (!user?.uid) return;

    setSaving(true);
    try {
      const userDocRef = db.collection('users').doc(user.uid);
      const timestamp = serverTimestamp();

      await userDocRef.set(
        {
          tosAccepted: false,
          tosDeclinedAt: timestamp,
          tosVersion: '1.0',
          tosPromptedAt: timestamp,
        },
        { merge: true }
      );

      // Update local user store
      setUser({
        ...user,
        tosAccepted: false,
        tosDeclinedAt: new Date(),
        tosVersion: '1.0',
        tosPromptedAt: new Date(),
      });

      // Log analytics event
      await logOnboardingStepComplete('TOS', {
        tosVersion: '1.0',
        accepted: false,
      });

      // Continue to next onboarding step (read-only mode)
      navigation.replace('InterestsScreen');
    } catch (error) {
      console.error('[TOS] Failed to save decline:', error);
      alert(
        'Failed to save your choice. Please check your connection and try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatedGradientBackground>
      <SafeAreaView style={styles.safe}>
        {/* Back button when coming from Settings */}
        {fromSettings && (
          <View style={styles.backButtonContainer}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              accessibilityLabel='Go back'
            >
              <Ionicons
                name='arrow-back'
                size={24}
                color={theme.colors.neutral100}
              />
            </TouchableOpacity>
          </View>
        )}

        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.header}>Terms of Service</Text>
          <Text style={styles.subtitle}>
            {fromSettings
              ? 'Review and update your Terms of Service acceptance. You need to accept to create events or join activities.'
              : "Please review our terms. You can browse events without accepting, but you'll need to accept to create events or join activities."}
          </Text>

          <View style={styles.tosContainer}>
            <Text style={styles.tosTitle}>Key Points</Text>
            <Text style={styles.tosText}>
              By using Social Circle, you agree to:
            </Text>
            <Text style={styles.bulletPoint}>
              • Be respectful and kind to all community members
            </Text>
            <Text style={styles.bulletPoint}>
              • Not post harmful, illegal, or offensive content
            </Text>
            <Text style={styles.bulletPoint}>
              • Follow community guidelines when creating events
            </Text>
            <Text style={styles.bulletPoint}>
              • Take responsibility for events you host
            </Text>
            <Text style={styles.bulletPoint}>
              • Respect others' privacy and safety
            </Text>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={openFullTOS}
              activeOpacity={0.7}
            >
              <Ionicons
                name='document-text-outline'
                size={20}
                color={theme.colors.primary}
              />
              <Text style={styles.linkButtonText}>Read Full Terms</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setAccepted(!accepted)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
              {accepted && <Ionicons name='checkmark' size={18} color='#fff' />}
            </View>
            <Text style={styles.checkboxLabel}>
              I have read and agree to the Terms of Service and Community
              Guidelines
            </Text>
          </TouchableOpacity>

          <View style={styles.buttonContainer}>
            <Button
              title={
                saving
                  ? 'Saving...'
                  : fromSettings
                  ? 'Save Changes'
                  : 'Accept & Continue'
              }
              onPress={handleAccept}
              disabled={!accepted || saving}
              style={!accepted || saving ? styles.disabledButton : null}
            />
            {/* Only show decline button during onboarding, not from Settings */}
            {!fromSettings && (
              <Button
                title='Continue Without Accepting'
                onPress={handleDecline}
                disabled={saving}
                variant='secondary'
                style={{ marginTop: theme.spacing.md }}
              />
            )}
          </View>

          {saving && (
            <ActivityIndicator
              size='small'
              color={theme.colors.primary}
              style={{ marginTop: theme.spacing.md }}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </AnimatedGradientBackground>
  );
}

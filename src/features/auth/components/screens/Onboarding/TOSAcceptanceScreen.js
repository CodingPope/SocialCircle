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
import { db, serverTimestamp } from '../../../../../services/firebase';
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
      maxHeight: 400,
    },
    tosScrollView: {
      maxHeight: 280,
      marginVertical: spacing.md,
    },
    tosTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.isDark ? '#FFFFFF' : colors.neutral900,
      marginBottom: spacing.sm,
    },
    versionText: {
      fontSize: 12,
      color: theme.isDark ? colors.neutral300 : colors.neutral500,
      marginBottom: spacing.md,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.isDark ? '#FFFFFF' : colors.neutral900,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    tosText: {
      fontSize: 14,
      color: theme.isDark ? '#FFFFFF' : colors.neutral700,
      lineHeight: 22,
      marginBottom: spacing.sm,
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
          'Unable to open Terms of Service. Please visit socialcircle.app/legal/terms-of-service',
        );
      }
    } catch (error) {
      console.error('[TOS] Failed to open TOS link:', error);
      alert(
        'Unable to open Terms of Service. Please visit socialcircle.app/legal/terms-of-service',
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
        { merge: true },
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
        'Failed to save your acceptance. Please check your connection and try again.',
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
              : 'Please review and accept our terms to continue using Social Circle.'}
          </Text>

          <View style={styles.tosContainer}>
            <Text style={styles.tosTitle}>Terms of Service</Text>
            <Text style={styles.versionText}>
              Version 1.0 • Effective January 19, 2026
            </Text>

            <ScrollView
              style={styles.tosScrollView}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              <Text style={styles.tosText}>
                By using Social Circle, you agree to the following:
              </Text>

              <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
              <Text style={styles.tosText}>
                You must be at least 18 years old to use this app. By creating
                an account, you certify you meet this requirement. If you use
                Sign in with Apple, you agree to Apple's terms and conditions.
              </Text>

              <Text style={styles.sectionTitle}>2. Zero Tolerance Policy</Text>
              <Text style={styles.tosText}>
                We have ZERO TOLERANCE for: sexually explicit content; hate
                speech; harassment; fraud; illegal activities; impersonation;
                spam; stalking; or any harmful conduct. Violations result in
                immediate account termination.
              </Text>

              <Text style={styles.sectionTitle}>3. User-Generated Content</Text>
              <Text style={styles.tosText}>
                You are solely responsible for all content you post. We employ
                automated filtering, user reporting, manual review, and
                reputation scoring to moderate content. Report violations via
                the in-app report feature.
              </Text>

              <Text style={styles.sectionTitle}>4. Event Participation</Text>
              <Text style={styles.tosText}>
                You attend events at your own risk. We do NOT conduct background
                checks, verify identities, or ensure event safety. Always meet
                in public places. Hosts must provide accurate information;
                attendees must RSVP honestly.
              </Text>

              <Text style={styles.sectionTitle}>5. Account Termination</Text>
              <Text style={styles.tosText}>
                We may suspend or terminate your account immediately for
                violations, fraudulent activity, repeated reports, or providing
                false information. No refunds are provided upon termination.
              </Text>

              <Text style={styles.sectionTitle}>6. Intellectual Property</Text>
              <Text style={styles.tosText}>
                By posting content, you grant us a worldwide, non-exclusive,
                royalty-free license to display and distribute your content. You
                retain ownership but agree to this license for app
                functionality.
              </Text>

              <Text style={styles.sectionTitle}>
                7. Privacy & Data Collection
              </Text>
              <Text style={styles.tosText}>
                We collect account info, location data, event participation,
                communications, device info, and usage analytics. Location is
                optional but enhances discovery. See our Privacy Policy for
                complete details.
              </Text>

              <Text style={styles.sectionTitle}>8. Business Accounts</Text>
              <Text style={styles.tosText}>
                Business accounts must represent legitimate, registered
                businesses and may be required to provide verification
                documents. Sponsored events must comply with all content
                policies and advertising regulations.
              </Text>

              <Text style={styles.sectionTitle}>9. Disclaimers</Text>
              <Text style={styles.tosText}>
                The app is provided "AS IS" without warranties. We make NO
                GUARANTEES regarding uninterrupted service, accuracy of
                information, user safety, or success in making friends.
              </Text>

              <Text style={styles.sectionTitle}>
                10. Limitation of Liability
              </Text>
              <Text style={styles.tosText}>
                We are NOT liable for indirect, incidental, or consequential
                damages; personal injury; property damage; or service
                interruptions. Our total liability is capped at the greater of
                $100 USD or amounts you paid in the prior 12 months.
              </Text>

              <Text style={styles.sectionTitle}>11. Indemnification</Text>
              <Text style={styles.tosText}>
                You agree to indemnify and hold harmless Social Circle from any
                claims arising from your violations, content, conduct, event
                participation, or infringement of third-party rights.
              </Text>

              <Text style={styles.sectionTitle}>12. Dispute Resolution</Text>
              <Text style={styles.tosText}>
                Disputes are governed by Colorado law and resolved through
                binding arbitration under AAA rules. You waive the right to
                participate in class actions or representative proceedings.
              </Text>

              <Text style={styles.sectionTitle}>13. Changes to Terms</Text>
              <Text style={styles.tosText}>
                We may update these Terms at any time. You will be notified via
                in-app notification, email, or re-acceptance prompt. Continued
                use after changes constitutes acceptance.
              </Text>

              <Text style={styles.sectionTitle}>14. Children's Privacy</Text>
              <Text style={styles.tosText}>
                We do NOT knowingly collect information from anyone under 18. If
                we discover a minor has created an account, we will immediately
                terminate it and delete all data.
              </Text>

              <Text style={styles.sectionTitle}>15. Additional Terms</Text>
              <Text style={styles.tosText}>
                These Terms include provisions for: contact & reporting
                (safety@findyourcircle.app); severability; entire agreement;
                export controls; force majeure; no waiver; assignment; and
                survival of certain sections after termination.
              </Text>
            </ScrollView>

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
              <Text style={styles.linkButtonText}>Read Terms of Service</Text>
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

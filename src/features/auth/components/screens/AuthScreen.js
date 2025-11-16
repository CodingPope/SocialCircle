import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Image,
} from 'react-native';
import { auth, db } from '../../../../firebase/config';
import {
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  updateDoc,
} from '../../../../firebase/firestoreCompat';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { useUserStore, useSessionRole } from '../../../profile';
import {
  registerForPushTokenAsync,
  initPushForUser,
} from '../../../notifications/services/pushService';
import { GOOGLE_CLIENT_ID } from '@env';
import { track as trackClient } from '../../../../lib/analytics';
import LoadingOverlay from '../../../../components/ui/LoadingOverlay';
import AnimatedGradientBackground from '../../../../components/ui/AnimatedGradientBackground';
import Button from '../../../../components/ui/Button';
import { useTheme } from '../../../../theme';
import { useThemeStore } from '../../../../store/themeStore';
import {
  getAuthErrorMessage,
  isValidEmail,
  validatePassword,
  logAuthError,
} from '../../utils/authErrorHandler';
import { useBizOnboarding } from '../../../business';
import { Ionicons } from '@expo/vector-icons';

const extractAppleProfileFields = (appleCredential, firebaseUser) => {
  const fullName = appleCredential?.fullName || {};
  const displayNameParts = (firebaseUser?.displayName || '')
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);

  const [displayFirstName, ...displayRemaining] = displayNameParts;

  return {
    email:
      firebaseUser?.email ||
      appleCredential?.email ||
      firebaseUser?.providerData?.find((p) => p?.email)?.email ||
      '',
    firstName:
      fullName.givenName || fullName.nickname || displayFirstName || '',
    lastName: fullName.familyName || displayRemaining.join(' ') || '',
    appleRelayEmail: appleCredential?.email || null,
  };
};

// Toggle visibility for the business login tab on the auth screen.
const ENABLE_BUSINESS_ACCOUNT_SWITCH = false;

const HERO_TAGLINE = 'Find Your Circle';

const createStyles = (theme) => {
  const { colors, radii, spacing } = theme;
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    overlay: {
      flex: 1,
      paddingTop: spacing.xl * 2.5,
      paddingBottom: spacing.lg,
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    hero: {
      alignItems: 'center',
      gap: 0,
    },
    heroLogo: {
      width: 205,
      height: 205,
      resizeMode: 'contain',
      marginBottom: -30,
    },
    heroTagline: {
      color: 'rgba(255, 255, 255, 1)',
      fontSize: 17,
      fontWeight: '600',
      textAlign: 'center',
      letterSpacing: 0.4,
    },
    card: {
      backgroundColor: colors.neutral100,
      borderRadius: radii.xl,
      padding: spacing.lg * 1.25,
      shadowColor: '#0E1335',
      shadowOpacity: 0.18,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    cardTitle: {
      fontSize: 30,
      fontWeight: '800',
      color: colors.neutral900,
      marginBottom: spacing.lg,
      letterSpacing: -0.5,
    },
    cardSubtitle: {
      fontSize: 15,
      color: colors.neutral600,
      marginBottom: spacing.xl,
      lineHeight: 21,
    },
    accountSwitchContainer: {
      flexDirection: 'row',
      backgroundColor: colors.neutral200,
      padding: spacing.xs,
      borderRadius: radii.xl,
      marginBottom: spacing.lg,
      gap: spacing.xs,
    },
    accountSwitchButton: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radii.lg,
      alignItems: 'center',
    },
    accountSwitchButtonActive: {
      backgroundColor: colors.neutral100,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 4,
      elevation: 3,
    },
    accountSwitchText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.neutral600,
    },
    accountSwitchTextActive: {
      color: colors.primary,
    },
    modeSwitch: {
      flexDirection: 'row',
      borderRadius: radii.xl,
      backgroundColor: colors.neutral200,
      padding: spacing.xs,
      marginBottom: spacing.lg,
      gap: spacing.xs,
    },
    modeOption: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radii.lg,
      alignItems: 'center',
    },
    modeOptionActive: {
      backgroundColor: colors.neutral100,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 4,
      elevation: 2,
    },
    modeOptionText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.neutral600,
    },
    modeOptionTextActive: {
      color: colors.primary,
    },
    businessLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.secondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: spacing.xs,
    },
    inputGroup: {
      marginBottom: spacing.md,
    },
    inputLabel: {
      fontSize: 13,
      color: colors.neutral500,
      marginBottom: spacing.xs / 2,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.neutral300,
      borderRadius: radii.lg,
      padding: spacing.md,
      fontSize: 16,
      color: colors.neutral900,
      backgroundColor: colors.neutral50,
    },
    forgotPasswordLink: {
      alignSelf: 'flex-start',
      marginTop: spacing.xs,
      marginBottom: spacing.md,
    },
    linkText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '600',
    },
    switchModeContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: spacing.md,
      gap: spacing.xs,
    },
    switchModeText: {
      color: colors.neutral600,
      fontSize: 14,
    },
    switchModeLink: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    appleButton: {
      width: '100%',
      height: 44,
      marginTop: spacing.sm,
    },
    buttonSpacing: {
      marginTop: spacing.sm,
      width: '100%',
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: spacing.lg,
      gap: spacing.sm,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.neutral200,
    },
    dividerLabel: {
      fontSize: 12,
      color: colors.neutral500,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    socialButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.neutral300,
      borderRadius: radii.lg,
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    socialButtonDisabled: {
      opacity: 0.5,
    },
    socialButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.neutral900,
    },
  });
};

async function generateNonce(length = 32) {
  const bytes = await Crypto.getRandomBytesAsync(length);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

export default function AuthScreen({ navigation, route }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [businessMode, setBusinessMode] = useState(!!route?.params?.business);
  const showBusinessAccountSwitch =
    ENABLE_BUSINESS_ACCOUNT_SWITCH || businessMode;
  const setUser = useUserStore((state) => state.setUser);
  const setProfileComplete = useUserStore((state) => state.setProfileComplete);
  const setRole = useSessionRole((s) => s.setRole);
  const setNextBusinessRoute = useSessionRole((s) => s.setNextBusinessRoute);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const cardTitle = useMemo(() => {
    if (businessMode) {
      return mode === 'login' ? 'Welcome back' : 'Get started';
    }
    return mode === 'login' ? 'Welcome back' : 'Get started';
  }, [businessMode, mode]);

  const cardSubtitle = useMemo(() => {
    // Remove subtitles entirely for cleaner look
    return null;
  }, [businessMode, mode]);

  const googleDisabled = !googleRequest;
  const handleAccountModeChange = useCallback(
    (nextBusiness) => {
      try {
        navigation.setParams &&
          navigation.setParams({ business: !!nextBusiness });
      } catch {}
      setBusinessMode(!!nextBusiness);
    },
    [navigation, setBusinessMode]
  );
  const handleGooglePress = useCallback(() => {
    if (googleDisabled) {
      return;
    }
    googlePromptAsync();
  }, [googleDisabled, googlePromptAsync]);

  // Description: Test Firebase Auth configuration on mount
  useEffect(() => {
    const testFirebaseConfig = async () => {
      try {
        console.log('🔍 Firebase Auth Check:');
        console.log('   App:', auth().app.name);
        console.log('   Current User:', auth().currentUser?.email || 'None');

        // Try to get auth state to verify connectivity
        const unsubscribe = auth().onAuthStateChanged((user) => {
          console.log(
            '   Auth State:',
            user ? `Logged in as ${user.email}` : 'Not logged in'
          );
        });

        return unsubscribe;
      } catch (error) {
        console.error('❌ Firebase Auth initialization error:', error);
      }
    };

    const unsubscribe = testFirebaseConfig();
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (route?.params && 'business' in route.params) {
      // Only affect local UI mode here; do NOT flip sessionRole until auth success
      setBusinessMode(!!route.params.business);
    }
  }, [route?.params?.business]);

  // Description: Reset session role to consumer when component mounts (unless in business mode)
  useEffect(() => {
    if (!businessMode) {
      setRole('consumer');
    }
  }, [businessMode, setRole]);

  const isProfileComplete = (userData) => {
    return (
      userData &&
      userData.firstName &&
      userData.lastName &&
      userData.dob &&
      userData.sex &&
      Array.isArray(userData.interests) &&
      userData.interests.length > 0 &&
      userData.location?.latitude != null &&
      userData.location?.longitude != null
    );
  };

  // Google Auth (disabled for now but kept in)
  const [googleRequest, googleResponse, googlePromptAsync] =
    Google.useIdTokenAuthRequest({
      clientId: GOOGLE_CLIENT_ID,
    });

  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    // Check availability once
    let mounted = true;
    AppleAuthentication.isAvailableAsync()
      .then((v) => {
        if (mounted) setAppleAvailable(!!v);
      })
      .catch(() => {});
    return () => (mounted = false);
  }, []);

  // Description: Sign in with Apple handler
  const handleAppleSignIn = async () => {
    // Only available on iOS devices; expo-apple-authentication will guard accordingly
    try {
      setLoading(true);
      // Generate a secure nonce and SHA256 it for Firebase as recommended
      const rawNonce = await generateNonce();
      const hashed = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashed,
      });

      // credential contains identityToken (JWT) which we can exchange with Firebase
      if (!credential || !credential.identityToken) {
        throw new Error('Apple Sign-In returned no identity token.');
      }

      // Create an OAuth credential for Firebase using the raw nonce
      // FIXED: Use auth.AppleAuthProvider instead of OAuthProvider
      const oauthCredential = auth.AppleAuthProvider.credential(
        credential.identityToken,
        rawNonce
      );

      try {
        const result = await auth().signInWithCredential(oauthCredential);

        // Description: Reset session role to consumer for Apple login
        setRole('consumer');

        // If new user, create minimal profile (re-use createUser from profile services)
        if (result?.additionalUserInfo?.isNewUser) {
          const {
            createUser,
          } = require('../../../profile/services/userService');
          const token = await registerForPushTokenAsync().catch(() => null);
          const appleProfile = extractAppleProfileFields(
            credential,
            result.user
          );
          await createUser(result.user.uid, {
            email: appleProfile.email || result.user.email || '',
            firstName: appleProfile.firstName,
            lastName: appleProfile.lastName,
            appleRelayEmail: appleProfile.appleRelayEmail,
            deviceToken: token || null,
            pushOptIn: !!token,
          });
          if (token) initPushForUser(result.user.uid).catch(() => {});
        } else {
          initPushForUser(result.user.uid).catch(() => {});
        }
      } catch (err) {
        // Handle account-exists-with-different-credential for Apple
        const code = err?.code || err?.message || '';
        if (code.includes('account-exists-with-different-credential')) {
          // Save pending credential for linking after user signs in with existing provider
          // We store it in-memory for now; for persistence consider storing in secure local storage
          const pendingCred = oauthCredential;

          // Ask user to sign in with the existing provider (we try Google if available)
          Alert.alert(
            'Account conflict',
            'An account already exists with the same email but different sign-in method. Sign in with the existing method to link Apple to your account.',
            [
              {
                text: 'Sign in with Google',
                onPress: async () => {
                  try {
                    // Prompt Google sign-in flow and then link
                    await googlePromptAsync();
                    // Wait for googleResponse effect to handle signInWithCredential;
                    // after user is signed in, try linking
                    const unsubscribe = auth().onAuthStateChanged(
                      async (user) => {
                        if (user) {
                          try {
                            await user.linkWithCredential(pendingCred);
                            Alert.alert(
                              'Linked',
                              'Apple account linked successfully.'
                            );
                          } catch (linkErr) {
                            console.warn('Link error', linkErr);
                            Alert.alert(
                              'Link failed',
                              linkErr?.message || String(linkErr)
                            );
                          }
                          unsubscribe();
                        }
                      }
                    );
                  } catch (gErr) {
                    Alert.alert(
                      'Google Sign-In Failed',
                      gErr?.message || String(gErr)
                    );
                  }
                },
              },
              {
                text: 'Cancel',
                style: 'cancel',
              },
            ]
          );
        } else {
          throw err;
        }
      }
    } catch (err) {
      // expo-apple-authentication throws with code 'ERR_CANCELED' when user cancels
      if (err && err.code === 'ERR_CANCELED') {
        // user cancelled, don't alert
      } else {
        // Log detailed error for debugging
        console.error('[Apple Sign-In] Error details:', {
          code: err?.code,
          message: err?.message,
          nativeError: err?.nativeError,
          fullError: err,
        });

        logAuthError(err, 'apple-signin', {});
        const { title, message } = getAuthErrorMessage(err, 'login');
        Alert.alert(title, message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Description: Handle Google sign-in and create user with full default schema if new
    if (googleResponse?.type === 'success') {
      const { id_token } = googleResponse.params;
      const credential = auth.GoogleAuthProvider.credential(id_token);
      auth()
        .signInWithCredential(credential)
        .then(async (result) => {
          // Description: Reset session role to consumer for Google login
          setRole('consumer');

          if (result.additionalUserInfo?.isNewUser) {
            const {
              createUser,
            } = require('../../../profile/services/userService');
            const token = await registerForPushTokenAsync().catch(() => null);
            await createUser(result.user.uid, {
              email: result.user.email,
              deviceToken: token || null,
              pushOptIn: !!token,
            });
            if (token) initPushForUser(result.user.uid).catch(() => {});
          } else {
            initPushForUser(result.user.uid).catch(() => {});
          }
        })
        .catch((err) => {
          logAuthError(err, 'google-signin', {});
          const { title, message } = getAuthErrorMessage(err, 'login');
          Alert.alert(title, message);
        });
    }
  }, [googleResponse]);

  const handleSubmit = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    // Description: Validate email format using utility function
    if (!isValidEmail(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    // Description: Validate password strength using utility function
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      Alert.alert('Invalid Password', passwordValidation.message);
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const result = await auth().signInWithEmailAndPassword(email, password);
        const userRef = doc(db, 'users', result.user.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists ? userSnap.data() : {};
        setUser({ uid: result.user.uid, ...userData });
        const complete = isProfileComplete(userData);
        setProfileComplete(complete);

        // If user is logging in as business, do not attempt user doc push init
        if (businessMode) {
          setRole('business');
          try {
            const resume = await useBizOnboarding
              .getState()
              .resumeLatestDraft(result.user.uid, { force: true });
            const statusRaw =
              resume?.data?.status ||
              useBizOnboarding.getState().draft?.status ||
              'draft';
            const normalizedStatus = String(statusRaw || 'draft').toLowerCase();
            const sendToTabs = ['active', 'pending_review'].includes(
              normalizedStatus
            );
            setNextBusinessRoute(
              sendToTabs ? 'BusinessTabs' : 'BusinessOnboarding'
            );
          } catch (resumeErr) {
            console.warn(
              '[AuthScreen] Failed to resume business draft:',
              resumeErr?.message || resumeErr
            );
            setNextBusinessRoute('BusinessOnboarding');
          }
          setLoading(false);
          return;
        }

        // Description: Reset session role to consumer for normal login to prevent persisted business mode
        setRole('consumer');

        // Only initialize push for consumer accounts that have a user profile doc
        if (userSnap.exists) {
          await initPushForUser(result.user.uid).catch(() => {});
        }
      } else if (mode === 'signup') {
        // Check if account already exists
        let methods = [];
        try {
          methods = await auth().fetchSignInMethodsForEmail(email);
        } catch (e) {
          // If invalid email, we already validated format; surface other errors
          console.warn('fetchSignInMethodsForEmail error', e);
        }

        if (Array.isArray(methods) && methods.length > 0) {
          // Account exists (could be password or social). Do not proceed to create.
          const hasPassword = methods.includes('password');
          if (hasPassword) {
            Alert.alert(
              'Account Exists',
              'An account with this email already exists. Please log in.'
            );
          } else {
            Alert.alert(
              'Use existing sign-in',
              'This email is linked to a social login. Use that method.'
            );
          }
          setLoading(false);
          return;
        }

        // Create account
        const result = await auth().createUserWithEmailAndPassword(
          email,
          password
        );

        // Ensure auth token is minted before any Firestore writes
        try {
          await result.user.getIdToken(true);
        } catch {}

        // If signing up in business mode, do NOT create a user profile doc.
        // We switch the session role and let BusinessRoot take over onboarding.
        if (businessMode) {
          try {
            setRole('business');
            setNextBusinessRoute('BusinessOnboarding');
          } catch {}
          setLoading(false);
          return;
        }

        // Description: Reset session role to consumer for normal signup
        setRole('consumer');

        // Consumer signup: create minimal, rule-compliant user profile
        const userDocRef = doc(db, 'users', result.user.uid);
        const token = await registerForPushTokenAsync().catch(() => null);
        try {
          const {
            createUser,
          } = require('../../../profile/services/userService');
          await createUser(result.user.uid, {
            email: result.user.email,
            deviceToken: token || null,
            pushOptIn: !!token,
          });
        } catch (err) {
          console.log(
            '[AuthScreen] Error creating Firestore user doc:',
            err?.message || err
          );
          Alert.alert(
            'Account Creation Error',
            'Could not create user profile. Please try again.'
          );
          setLoading(false);
          return;
        }

        // Best-effort subcollection seed (non-blocking)
        try {
          const profileviewsRef = collection(userDocRef, 'profileviews');
          await setDoc(doc(profileviewsRef, 'initialSeed'), {
            timestamp: serverTimestamp(),
            viewerId: 'system',
          });
        } catch {}

        // Load into store and continue onboarding for consumers
        const userSnapshot = await getDoc(userDocRef);
        const userData = userSnapshot.exists ? userSnapshot.data() : {};
        setUser({ uid: result.user.uid, ...userData });
        setProfileComplete(false);
        await initPushForUser(result.user.uid).catch(() => {});
      }
    } catch (err) {
      // Description: Use centralized error handler for user-friendly messages
      logAuthError(err, mode, {
        email: email ? email.substring(0, 3) + '***' : 'N/A',
      });

      const { title, message } = getAuthErrorMessage(err, mode);
      Alert.alert(title, message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = () => {
    if (!email) {
      Alert.alert('Reset Password', 'Please enter your email address first.');
      return;
    }

    // Description: Validate email before attempting password reset
    if (!isValidEmail(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    auth()
      .sendPasswordResetEmail(email)
      .then(() =>
        Alert.alert(
          'Check Your Email',
          'A password reset link has been sent to your email address. Please check your inbox and follow the instructions.'
        )
      )
      .catch((err) => {
        logAuthError(err, 'reset', { email: email.substring(0, 3) + '***' });
        const { title, message } = getAuthErrorMessage(err, 'reset');
        Alert.alert(title, message);
      });
  };

  return (
    <AnimatedGradientBackground style={styles.container} variant='onboarding'>
      <View style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <LoadingOverlay visible={loading} />

          <View style={styles.hero}>
            <Image
              source={require('../../../../../assets/SocialCircleLogoClear.png')}
              style={styles.heroLogo}
            />
            <Text style={styles.heroTagline}>{HERO_TAGLINE}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{cardTitle}</Text>
            {cardSubtitle && (
              <Text style={styles.cardSubtitle}>{cardSubtitle}</Text>
            )}

            {showBusinessAccountSwitch && (
              <View style={styles.accountSwitchContainer}>
                <TouchableOpacity
                  style={[
                    styles.accountSwitchButton,
                    !businessMode && styles.accountSwitchButtonActive,
                  ]}
                  onPress={() => handleAccountModeChange(false)}
                >
                  <Text
                    style={[
                      styles.accountSwitchText,
                      !businessMode && styles.accountSwitchTextActive,
                    ]}
                  >
                    I&apos;m here to attend
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.accountSwitchButton,
                    businessMode && styles.accountSwitchButtonActive,
                  ]}
                  onPress={() => handleAccountModeChange(true)}
                >
                  <Text
                    style={[
                      styles.accountSwitchText,
                      businessMode && styles.accountSwitchTextActive,
                    ]}
                  >
                    I manage a business
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.modeSwitch}>
              <TouchableOpacity
                style={[
                  styles.modeOption,
                  mode === 'login' && styles.modeOptionActive,
                ]}
                onPress={() => setMode('login')}
              >
                <Text
                  style={[
                    styles.modeOptionText,
                    mode === 'login' && styles.modeOptionTextActive,
                  ]}
                >
                  Sign in
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeOption,
                  mode === 'signup' && styles.modeOptionActive,
                ]}
                onPress={() => setMode('signup')}
              >
                <Text
                  style={[
                    styles.modeOptionText,
                    mode === 'signup' && styles.modeOptionTextActive,
                  ]}
                >
                  Sign up
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                placeholder='you@example.com'
                value={email}
                onChangeText={setEmail}
                autoCapitalize='none'
                keyboardType='email-address'
                autoCorrect={false}
                spellCheck={false}
                textContentType='emailAddress'
                autoComplete='email'
                style={styles.input}
                placeholderTextColor={theme.colors.neutral500}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                placeholder='••••••••'
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType='password'
                autoComplete='password'
                autoCorrect={false}
                spellCheck={false}
                style={styles.input}
                placeholderTextColor={theme.colors.neutral500}
              />
            </View>

            {mode === 'login' && (
              <TouchableOpacity
                style={styles.forgotPasswordLink}
                onPress={handlePasswordReset}
              >
                <Text style={styles.linkText}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            {loading ? (
              <ActivityIndicator
                size='large'
                color={theme.colors.secondary}
                style={{ marginVertical: theme.spacing.md }}
              />
            ) : (
              <Button
                title={mode === 'login' ? 'Sign in' : 'Create account'}
                onPress={handleSubmit}
                style={styles.buttonSpacing}
              />
            )}

            <View style={styles.switchModeContainer}>
              <TouchableOpacity
                onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
              >
                <Text style={styles.switchModeLink}>
                  {mode === 'login' ? 'Sign up' : 'Sign in'}
                </Text>
              </TouchableOpacity>
            </View>

            {appleAvailable && (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerLabel}>or</Text>
                  <View style={styles.dividerLine} />
                </View>

                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={
                    AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                  }
                  buttonStyle={
                    AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  }
                  cornerRadius={8}
                  style={styles.appleButton}
                  onPress={handleAppleSignIn}
                />
              </>
            )}
          </View>
        </View>
      </View>
    </AnimatedGradientBackground>
  );
}

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
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

const createStyles = (theme) => {
  const { colors, radii, spacing, mode } = theme;
  const isDark = mode === 'dark';
  const cardBackground = isDark ? 'rgba(6, 11, 26, 0.94)' : colors.neutral100;
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  const primaryText = isDark ? '#F7FAFF' : colors.neutral900;
  const secondaryText = isDark ? 'rgba(255,255,255,0.72)' : colors.neutral600;
  const softSurface = isDark ? 'rgba(255,255,255,0.08)' : colors.neutral200;
  const pillActive = isDark ? 'rgba(10, 18, 48, 0.95)' : colors.neutral100;
  const inputBackground = isDark ? 'rgba(8, 13, 32, 0.9)' : colors.neutral50;
  const inputBorder = isDark ? 'rgba(255,255,255,0.08)' : colors.neutral300;
  const inputText = isDark ? '#F4F7FF' : colors.neutral900;
  const linkColor = isDark ? '#85A6FF' : colors.primary;
  const accentBlue = isDark ? '#4D7BFF' : colors.primary;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#020617' : colors.background,
    },
    overlay: {
      flexGrow: 1,
      justifyContent: 'flex-start',
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    heroBlock: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 0,
      paddingBottom: spacing.lg,
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
    },
    heroLogo: {
      width: 200,
      height: 200,
    },
    heroTagline: {
      color: primaryText,
      fontSize: 16,
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: cardBackground,
      borderRadius: 32,
      padding: spacing.xl,
      borderWidth: 1,
      borderColor: cardBorder,
      shadowColor: isDark ? '#050914' : '#0E1335',
      shadowOpacity: 0.35,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 16 },
      elevation: 12,
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
    },
    cardTitle: {
      fontSize: 32,
      fontWeight: '700',
      color: primaryText,
      marginBottom: spacing.lg,
    },
    accountSwitchContainer: {
      flexDirection: 'row',
      backgroundColor: softSurface,
      padding: spacing.xs,
      borderRadius: radii.xl,
      marginBottom: spacing.md,
      gap: spacing.xs,
    },
    accountSwitchButton: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radii.lg,
      alignItems: 'center',
    },
    accountSwitchButtonActive: {
      backgroundColor: pillActive,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 4,
      elevation: 3,
    },
    accountSwitchText: {
      fontSize: 14,
      fontWeight: '600',
      color: secondaryText,
    },
    accountSwitchTextActive: {
      color: primaryText,
    },
    modeSwitch: {
      flexDirection: 'row',
      borderRadius: radii.xl,
      backgroundColor: softSurface,
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
      backgroundColor: pillActive,
      shadowColor: '#01030A',
      shadowOpacity: 0.15,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 6,
      elevation: 2,
    },
    modeOptionText: {
      fontSize: 14,
      fontWeight: '600',
      color: secondaryText,
    },
    modeOptionTextActive: {
      color: primaryText,
    },
    businessLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: secondaryText,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: spacing.xs,
    },
    inputGroup: {
      marginBottom: spacing.md,
    },
    inputLabel: {
      fontSize: 13,
      color: secondaryText,
      marginBottom: spacing.xs / 2,
    },
    input: {
      borderWidth: 1,
      borderColor: inputBorder,
      borderRadius: radii.lg,
      padding: spacing.md,
      fontSize: 16,
      color: inputText,
      backgroundColor: inputBackground,
    },
    appleButton: {
      width: '100%',
      height: 50,
      borderRadius: radii.lg,
      overflow: 'hidden',
    },
    buttonSpacing: {
      marginTop: spacing.md,
      width: '100%',
    },
    linkText: {
      color: linkColor,
      fontSize: 13,
      fontWeight: '600',
    },
    subtleLinkText: {
      color: secondaryText,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
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
      backgroundColor: softSurface,
    },
    dividerLabel: {
      fontSize: 12,
      color: secondaryText,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    socialButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: softSurface,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.neutral50,
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
      color: primaryText,
    },
    primaryActionButton: {
      backgroundColor: accentBlue,
      borderRadius: radii.pill,
      paddingVertical: spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#101a3c',
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    primaryActionButtonText: {
      color: '#F8FBFF',
    },
    forgotPasswordButton: {
      alignSelf: 'flex-start',
      marginTop: -spacing.xs,
      marginBottom: spacing.sm,
    },
    secondaryModeLink: {
      marginTop: spacing.sm,
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
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const placeholderColor =
    theme.mode === 'dark' ? 'rgba(255,255,255,0.5)' : theme.colors.neutral500;
  const accentColor =
    theme.mode === 'dark' ? '#4D7BFF' : theme.colors.secondary;
  const googleIconColor =
    theme.mode === 'dark' ? '#F7FAFF' : theme.colors.neutral900;
  const googleIconMutedColor =
    theme.mode === 'dark' ? 'rgba(255,255,255,0.45)' : theme.colors.neutral500;
  const heroSize = useMemo(() => {
    const scaled = screenWidth * 0.45;
    return Math.min(220, Math.max(160, scaled));
  }, [screenWidth]);
  const heroLogoDynamicStyle = useMemo(
    () => ({
      width: heroSize,
      height: heroSize,
      marginBottom: -heroSize * 0.1,
    }),
    [heroSize]
  );
  const heroTaglineDynamicStyle = useMemo(
    () => ({
      marginTop: -heroSize * 0.2,
      marginBottom: -heroSize * 0.08,
    }),
    [heroSize]
  );
  const overlayInsetStyle = useMemo(
    () => ({
      paddingTop: Math.max(theme.spacing.lg, insets.top + theme.spacing.sm),
      paddingBottom: Math.max(
        theme.spacing.xl,
        insets.bottom + theme.spacing.lg
      ),
    }),
    [
      insets.bottom,
      insets.top,
      theme.spacing.lg,
      theme.spacing.sm,
      theme.spacing.xl,
    ]
  );
  const cardTitle = mode === 'login' ? 'Welcome back' : 'Create account';
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
      <ScrollView
        contentContainerStyle={[styles.overlay, overlayInsetStyle]}
        keyboardShouldPersistTaps='handled'
        showsVerticalScrollIndicator={false}
      >
        <LoadingOverlay visible={loading} />

        <View style={styles.heroBlock}>
          <Image
            source={require('../../../../../assets/SocialCircleLogoClear.png')}
            style={[styles.heroLogo, heroLogoDynamicStyle]}
            resizeMode='contain'
          />
          <Text style={[styles.heroTagline, heroTaglineDynamicStyle]}>
            Find Your Circle
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{cardTitle}</Text>

          {showBusinessAccountSwitch ? (
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
          ) : null}

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

          {businessMode ? (
            <Text style={styles.businessLabel}>business login</Text>
          ) : null}

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
              placeholderTextColor={placeholderColor}
              keyboardAppearance={themeMode === 'dark' ? 'dark' : 'light'}
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
              placeholderTextColor={placeholderColor}
              keyboardAppearance={themeMode === 'dark' ? 'dark' : 'light'}
            />
          </View>

          <TouchableOpacity
            onPress={handlePasswordReset}
            style={styles.forgotPasswordButton}
          >
            <Text style={styles.linkText}>Forgot password?</Text>
          </TouchableOpacity>

          {loading ? (
            <ActivityIndicator
              size='large'
              color={accentColor}
              style={{ marginVertical: theme.spacing.md }}
            />
          ) : (
            <Button
              title={mode === 'login' ? 'Sign in' : 'Create account'}
              onPress={handleSubmit}
              style={[styles.buttonSpacing, styles.primaryActionButton]}
              textStyle={styles.primaryActionButtonText}
            />
          )}

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* {mode === 'login' ? (
              <TouchableOpacity
                style={[
                  styles.socialButton,
                  googleDisabled && styles.socialButtonDisabled,
                ]}
                onPress={handleGooglePress}
                disabled={googleDisabled}
              >
                <Ionicons
                  name='logo-google'
                  size={18}
                  color={
                    googleDisabled ? googleIconMutedColor : googleIconColor
                  }
                />
                <Text style={styles.socialButtonText}>
                  Continue with Google
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.socialButton, styles.socialButtonDisabled]}
                disabled
              >
                <Ionicons
                  name='time-outline'
                  size={18}
                  color={googleIconMutedColor}
                />
                <Text style={styles.socialButtonText}>
                  Google sign up coming soon
                </Text>
              </TouchableOpacity>
            )} */}

          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              }
              buttonStyle={
                AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={12}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          )}
        </View>
      </ScrollView>
    </AnimatedGradientBackground>
  );
}

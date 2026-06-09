/**
 * Test plan:
 * - Sign up a new user -> redirected to interest selection
 * - Select interests -> redirected into main app
 * - Close and re-open the app -> should go straight into main app as logged in.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  Image,
} from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '@env';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import { useUserStore } from '../../../profile';
import { useThemeStore } from '../../../../store/themeStore';
import {
  registerForPushTokenAsync,
  initPushForUser,
} from '../../../notifications/api/pushService';
import { auth } from '../../../../services/firebase';
import { track as trackClient } from '../../../../lib/analytics';
import {
  createUser,
  mergeUserFields,
  getUserById,
  findSoftDeletedUserByEmail,
} from '../../../profile/api/userService';
import {
  getAuthErrorMessage,
  logAuthError,
} from '../../utils/authErrorHandler';

// Description: Extract name/email from Apple credential and Firebase user
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

// Description: Generate a secure random nonce for Apple Sign In
async function generateNonce(length = 32) {
  const bytes = await Crypto.getRandomBytesAsync(length);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

const HERO_COPY = {
  login: {
    eyebrow: 'Returning member',
    title: 'Jump back into the circle',
    subtitle:
      'Pick up RSVPs, continue chats, and catch the latest plans from your people.',
  },
  signup: {
    eyebrow: 'New here?',
    title: 'Design your social life',
    subtitle:
      'Tell us what you are into and we will line up events and people who fit.',
  },
};

const HERO_STATS = [
  { value: '1.2k+', label: 'Hangouts hosted this week' },
  { value: '320+', label: 'Communities near you' },
  { value: '<5 min', label: 'Avg. reply time' },
];

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // or 'signup'
  const [error, setError] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const themeMode = useThemeStore((state) => state.mode);
  const keyboardAppearance = themeMode === 'dark' ? 'dark' : 'light';

  // Description: Configure Google Sign-In once at mount using native SDK.
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_CLIENT_ID,
      ...(Platform.OS === 'ios' && GOOGLE_IOS_CLIENT_ID
        ? { iosClientId: GOOGLE_IOS_CLIENT_ID }
        : {}),
    });
  }, []);

  // Description: Native Google Sign-In → Firebase credential exchange
  const handleGoogleSignIn = async () => {
    try {
      await GoogleSignin.hasPlayServices();
      const { data } = await GoogleSignin.signIn();
      const credential = auth.GoogleAuthProvider.credential(data.idToken);
      await auth().signInWithCredential(credential);
    } catch (err) {
      if (err.code !== statusCodes.SIGN_IN_CANCELLED) {
        setError(err.message);
      }
    }
  };

  // Description: Check Apple Sign In availability (iOS only)
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    let mounted = true;
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync()
        .then((v) => {
          if (mounted) setAppleAvailable(!!v);
        })
        .catch(() => {});
    }
    return () => (mounted = false);
  }, []);

  // Description: Handle Apple Sign In without double-prompt on credential conflict
  const handleAppleSignIn = async () => {
    try {
      setError('');
      const rawNonce = await generateNonce();
      const hashed = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashed,
      });

      if (!credential || !credential.identityToken) {
        throw new Error('Apple Sign-In returned no identity token.');
      }

      const oauthCredential = auth.AppleAuthProvider.credential(
        credential.identityToken,
        rawNonce,
      );

      try {
        const result = await auth().signInWithCredential(oauthCredential);

        const token = await registerForPushTokenAsync().catch(() => null);
        const appleProfile = extractAppleProfileFields(credential, result.user);

        const hasAppleProvidedName = !!(
          appleProfile.firstName || appleProfile.lastName
        );
        const hasAppleProvidedEmail = !!appleProfile.email;

        if (result?.additionalUserInfo?.isNewUser) {
          // Description: If Apple didn't provide name (re-registration after deletion),
          // try recovering from a soft-deleted Firestore record by email
          if (!appleProfile.firstName && !appleProfile.lastName) {
            const recoveryEmail = appleProfile.email || result.user.email || '';
            if (recoveryEmail) {
              try {
                const {
                  findSoftDeletedUserByEmail,
                } = require('../../../profile/api/userService');
                const softDeleted =
                  await findSoftDeletedUserByEmail(recoveryEmail);
                if (softDeleted?.data) {
                  if (softDeleted.data.firstName)
                    appleProfile.firstName = softDeleted.data.firstName;
                  if (softDeleted.data.lastName)
                    appleProfile.lastName = softDeleted.data.lastName;
                }
              } catch (recoveryErr) {
                console.warn(
                  '[LoginScreen] Soft-deleted user recovery failed:',
                  recoveryErr?.message,
                );
              }
            }
          }
          await createUser(result.user.uid, {
            email: appleProfile.email || result.user.email || '',
            firstName: appleProfile.firstName || '',
            lastName: appleProfile.lastName || '',
            appleRelayEmail: appleProfile.appleRelayEmail,
            appleAuthorizationCode: credential.authorizationCode || null,
            deviceToken: token || null,
            pushOptIn: !!token,
          });
          if (token) initPushForUser(result.user.uid).catch(() => {});
        } else {
          // Description: Existing Auth user — check if Firestore doc exists and is active
          const existingProfile = await getUserById(result.user.uid);

          if (!existingProfile) {
            // Firestore doc is missing or soft-deleted.
            // Recover name from soft-deleted doc if Apple didn't provide it.
            if (!appleProfile.firstName && !appleProfile.lastName) {
              const recoveryEmail =
                appleProfile.email || result.user.email || '';
              if (recoveryEmail) {
                try {
                  const softDeleted =
                    await findSoftDeletedUserByEmail(recoveryEmail);
                  if (softDeleted?.data) {
                    if (softDeleted.data.firstName)
                      appleProfile.firstName = softDeleted.data.firstName;
                    if (softDeleted.data.lastName)
                      appleProfile.lastName = softDeleted.data.lastName;
                  }
                } catch (recoveryErr) {
                  console.warn(
                    '[LoginScreen] Soft-deleted recovery (existing auth):',
                    recoveryErr?.message,
                  );
                }
              }
            }
            // Create a fresh Firestore doc for this auth user
            await createUser(result.user.uid, {
              email: appleProfile.email || result.user.email || '',
              firstName: appleProfile.firstName || '',
              lastName: appleProfile.lastName || '',
              appleRelayEmail: appleProfile.appleRelayEmail,
              appleAuthorizationCode: credential.authorizationCode || null,
              deviceToken: token || null,
              pushOptIn: !!token,
            });
          } else {
            // Active Firestore doc exists — merge new Apple data if provided
            if (!appleProfile.firstName && !appleProfile.lastName) {
              if (existingProfile.firstName)
                appleProfile.firstName = existingProfile.firstName;
              if (existingProfile.lastName)
                appleProfile.lastName = existingProfile.lastName;
              if (existingProfile.email)
                appleProfile.email = existingProfile.email;
            }
            if (hasAppleProvidedName || hasAppleProvidedEmail) {
              const updates = {
                ...(hasAppleProvidedName && appleProfile.firstName
                  ? { firstName: appleProfile.firstName }
                  : {}),
                ...(hasAppleProvidedName && appleProfile.lastName
                  ? { lastName: appleProfile.lastName }
                  : {}),
                ...(hasAppleProvidedEmail ? { email: appleProfile.email } : {}),
                ...(appleProfile.appleRelayEmail
                  ? { appleRelayEmail: appleProfile.appleRelayEmail }
                  : {}),
                appleAuthorizationCode: credential.authorizationCode || null,
              };
              await mergeUserFields(result.user.uid, updates);
            }
          }
          initPushForUser(result.user.uid).catch(() => {});
        }
      } catch (err) {
        // Description: Handle account-exists-with-different-credential without re-prompting
        const code = err?.code || err?.message || '';
        if (code.includes('account-exists-with-different-credential')) {
          Alert.alert(
            'Account Already Exists',
            'An account with this email already exists using a different sign-in method. Please sign in with your original method instead.',
            [
              {
                text: 'Sign in with Google',
                onPress: () => googlePromptAsync(),
              },
              {
                text: 'Sign in with Email',
                onPress: () => setMode('login'),
              },
              { text: 'Cancel', style: 'cancel' },
            ],
          );
        } else {
          throw err;
        }
      }
    } catch (err) {
      const cancelCodes = [
        'ERR_CANCELED',
        'ERR_REQUEST_CANCELED',
        'ERR_USER_CANCEL',
        'ERR_APPLE_SIGNIN_CANCEL',
      ];
      const isCanceled =
        (err && cancelCodes.includes(err.code)) ||
        String(err?.message || '')
          .toLowerCase()
          .includes('cancel');
      if (!isCanceled) {
        logAuthError(err, 'apple-signin', {});
        const { title, message } = getAuthErrorMessage(err, 'login');
        Alert.alert(title, message);
      }
    }
  };

  // Description: Handles login and navigates to MainTabs (Map tab) on success
  const handleLogin = async () => {
    setError('');
    try {
      const res = await auth().signInWithEmailAndPassword(email, password);
      // Refresh token for returning users (best-effort)
      initPushForUser(res.user.uid).catch(() => {});
      // On successful login, reset navigation to MainTabs (default tab is Map)
      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'MainTabs',
            state: {
              routes: [{ name: 'Map' }],
              index: 0,
            },
          },
        ],
      });
    } catch (e) {
      const debugInfo = {
        code: e?.code,
        message: e?.message,
        nativeErrorCode: e?.nativeErrorCode,
        nativeErrorMessage: e?.nativeErrorMessage,
      };
      console.error(
        '[LoginScreen] signInWithEmailAndPassword failed',
        debugInfo,
      );
      setError(
        debugInfo.nativeErrorMessage ||
          debugInfo.message ||
          'Login failed. Please try again.',
      );
    }
  };

  const handleSignUp = async () => {
    setError('');
    try {
      // Try to sign in first to check if user exists
      try {
        await auth().signInWithEmailAndPassword(email, password);
        setError('An account with this email already exists. Please log in.');
        return;
      } catch (signInErr) {
        if (signInErr && signInErr.code !== 'auth/user-not-found') {
          console.warn(
            '[LoginScreen] pre-signup signInWithEmailAndPassword error',
            {
              code: signInErr?.code,
              message: signInErr?.message,
              nativeErrorCode: signInErr?.nativeErrorCode,
              nativeErrorMessage: signInErr?.nativeErrorMessage,
            },
          );
        }
        if (signInErr.code === 'auth/user-disabled') {
          // User exists but is disabled (soft-deleted)
          Alert.alert(
            'Reactivate Account',
            'An account with this email was previously deleted. Would you like to reactivate it?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Reactivate',
                style: 'default',
                onPress: async () => {
                  try {
                    const {
                      findSoftDeletedUserByEmail,
                      reactivateUser,
                    } = require('../../../profile/api/userService');
                    const softDeleted = await findSoftDeletedUserByEmail(email);
                    if (softDeleted) {
                      await reactivateUser(softDeleted.id, {});
                      Alert.alert(
                        'Account Reactivated',
                        'Your account has been reactivated. Please log in.',
                      );
                    } else {
                      setError('Could not find soft-deleted user.');
                    }
                  } catch (e) {
                    setError('Reactivation failed: ' + e.message);
                  }
                },
              },
            ],
          );
          return;
        } else if (signInErr.code === 'auth/user-not-found') {
          // proceed with normal signup
        } else if (signInErr.code === 'auth/wrong-password') {
          setError('An account with this email already exists. Please log in.');
          return;
        }
      }
      // If we reach here, user does not exist, proceed with normal signup
      const cred = await auth().createUserWithEmailAndPassword(email, password);
      // Request push permission (best-effort); do not block if denied
      const token = await registerForPushTokenAsync().catch(() => null);
      await createUser(cred.user.uid, {
        email,
        deviceToken: token || null,
        pushOptIn: !!token,
      });
      // Best-effort init to store platform and timestamps
      initPushForUser(cred.user.uid).catch(() => {});
    } catch (e) {
      const debugInfo = {
        code: e?.code,
        message: e?.message,
        nativeErrorCode: e?.nativeErrorCode,
        nativeErrorMessage: e?.nativeErrorMessage,
      };
      console.error(
        '[LoginScreen] createUserWithEmailAndPassword failed',
        debugInfo,
      );
      setError(
        debugInfo.nativeErrorMessage ||
          debugInfo.message ||
          'Unable to create the account. Please try again.',
      );
    }
  };

  const onSubmit = mode === 'login' ? handleLogin : handleSignUp;

  const handlePasswordReset = async () => {
    if (!resetEmail) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }
    try {
      await auth().sendPasswordResetEmail(resetEmail);
      Alert.alert('Success', 'Password reset email sent! Check your inbox.');
      setShowReset(false);
      setResetEmail('');
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const isLogin = mode === 'login';
  const heroCopy = HERO_COPY[isLogin ? 'login' : 'signup'];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.heroContainer}>
          <LinearGradient
            colors={['#11092F', '#332266']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.heroTopRow}>
              <View style={styles.heroEyebrow}>
                <Ionicons name='sparkles-outline' size={16} color='#C9C4FF' />
                <Text style={styles.heroEyebrowText}>{heroCopy.eyebrow}</Text>
              </View>
              <Image
                source={require('assets/SocialCircleLogoClear.png')}
                style={styles.heroLogo}
              />
            </View>
            <Text style={styles.heroTitle}>{heroCopy.title}</Text>
            <Text style={styles.heroSubtitle}>{heroCopy.subtitle}</Text>
            <View style={styles.heroStatsRow}>
              {HERO_STATS.map((stat) => (
                <View key={stat.label} style={styles.statCard}>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </View>

        <View style={styles.formSection}>
          <View style={styles.modeSwitch}>
            <TouchableOpacity
              style={[styles.modePill, isLogin && styles.modePillActive]}
              onPress={() => setMode('login')}
            >
              <Text
                style={[
                  styles.modePillText,
                  isLogin && styles.modePillTextActive,
                ]}
              >
                Sign in
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modePill, !isLogin && styles.modePillActive]}
              onPress={() => setMode('signup')}
            >
              <Text
                style={[
                  styles.modePillText,
                  !isLogin && styles.modePillTextActive,
                ]}
              >
                Create account
              </Text>
            </TouchableOpacity>
          </View>

          <BlurView intensity={65} tint='light' style={styles.glassCard}>
            <Text style={styles.sectionLabel}>
              {isLogin ? 'Sign in to continue' : 'Let us know who you are'}
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Email</Text>
              <View style={styles.inputField}>
                <Ionicons
                  name='mail-outline'
                  size={18}
                  color='#8C91A5'
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder='you@example.com'
                  placeholderTextColor='#8C91A5'
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize='none'
                  keyboardType='email-address'
                  keyboardAppearance={keyboardAppearance}
                />
              </View>
            </View>

            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.inputField}>
                <Ionicons
                  name='lock-closed-outline'
                  size={18}
                  color='#8C91A5'
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder='••••••••'
                  placeholderTextColor='#8C91A5'
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  keyboardAppearance={keyboardAppearance}
                />
              </View>
            </View>

            <TouchableOpacity style={styles.primaryCta} onPress={onSubmit}>
              <LinearGradient
                colors={['#F97316', '#C026D3']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.primaryCtaGradient}
              >
                <Text style={styles.primaryCtaText}>
                  {isLogin ? 'Sign in' : 'Create account'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {isLogin && (
                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={handleGoogleSignIn}
                >
                  <Ionicons name='logo-google' size={18} color='#1F1F33' />
                  <Text style={styles.socialButtonText}>
                    Continue with Google
                  </Text>
                </TouchableOpacity>
              )}

            {isLogin && appleAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={
                  AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                }
                buttonStyle={
                  AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={16}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            )}

            <TouchableOpacity
              style={styles.buttonSecondary}
              onPress={() => setMode(isLogin ? 'signup' : 'login')}
            >
              <Text style={styles.buttonTextSecondary}>
                {isLogin
                  ? 'Need an account? Sign up'
                  : 'Already have an account? Sign in'}
              </Text>
            </TouchableOpacity>

            {isLogin && (
              <TouchableOpacity
                style={styles.forgotButton}
                onPress={() => setShowReset(true)}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}
          </BlurView>

          <Text style={styles.helperText}>
            Having trouble? support@socialcircle.app
          </Text>
        </View>

        <View style={styles.footerCopy}>
          <Text style={styles.footerText}>
            By continuing you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>

        <Modal visible={showReset} animationType='fade' transparent>
          <View style={styles.modalContainer}>
            <BlurView intensity={80} tint='default' style={styles.modalContent}>
              <Text style={styles.modalTitle}>Reset password</Text>
              <Text style={styles.modalDescription}>
                Enter the email associated with your account and we will send
                you a reset link.
              </Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Email</Text>
                <View style={styles.inputField}>
                  <Ionicons
                    name='mail-outline'
                    size={18}
                    color='#8C91A5'
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder='you@example.com'
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    autoCapitalize='none'
                    keyboardType='email-address'
                    keyboardAppearance={keyboardAppearance}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={styles.primaryCta}
                onPress={handlePasswordReset}
              >
                <LinearGradient
                  colors={['#F97316', '#C026D3']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryCtaGradient}
                >
                  <Text style={styles.primaryCtaText}>Send reset link</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.buttonSecondary}
                onPress={() => setShowReset(false)}
              >
                <Text style={styles.buttonTextSecondary}>Cancel</Text>
              </TouchableOpacity>
            </BlurView>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080312',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  heroContainer: {
    marginBottom: 28,
  },
  heroGradient: {
    borderRadius: 32,
    padding: 28,
    overflow: 'hidden',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  heroEyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  heroEyebrowText: {
    color: '#C9C4FF',
    marginLeft: 6,
    fontSize: 13,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  heroLogo: {
    width: 42,
    height: 42,
    resizeMode: 'contain',
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F4F3FF',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#D0CEFF',
    lineHeight: 22,
    marginBottom: 24,
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: -6,
  },
  statCard: {
    flex: 1,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#C4C0FF',
  },
  formSection: {
    marginBottom: 24,
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 999,
    padding: 4,
    marginBottom: 16,
  },
  modePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
  },
  modePillActive: {
    backgroundColor: '#FFFFFF',
  },
  modePillText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  modePillTextActive: {
    color: '#0C0A1A',
  },
  glassCard: {
    borderRadius: 28,
    padding: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  sectionLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F1F33',
    marginBottom: 18,
  },
  inputWrapper: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    color: '#6B6F89',
    marginBottom: 6,
  },
  inputField: {
    position: 'relative',
  },
  inputIcon: {
    position: 'absolute',
    top: 14,
    left: 16,
    zIndex: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E3E1F3',
    borderRadius: 16,
    paddingHorizontal: 44,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F1F33',
    backgroundColor: '#FFFFFF',
  },
  primaryCta: {
    marginTop: 8,
  },
  primaryCtaGradient: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryCtaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    color: '#6B6F89',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginHorizontal: 12,
  },
  appleButton: {
    width: '100%',
    height: 48,
    marginTop: 8,
  },
  socialButton: {
    borderWidth: 1,
    borderColor: '#D5D0FF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  socialButtonText: {
    color: '#1F1F33',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  socialButtonDisabled: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FFF5F5',
    flexDirection: 'row',
    alignItems: 'center',
  },
  socialButtonDisabledText: {
    color: '#B91C1C',
    flex: 1,
    fontSize: 14,
    marginLeft: 8,
  },
  buttonSecondary: {
    paddingVertical: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  buttonTextSecondary: {
    color: '#7C3AED',
    fontSize: 15,
    fontWeight: '600',
  },
  error: {
    color: '#E11D48',
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 10,
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '600',
  },
  forgotButton: {
    alignItems: 'center',
    marginTop: 4,
  },
  forgotText: {
    color: '#6B6F89',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  helperText: {
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 20,
  },
  footerCopy: {
    marginTop: 12,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  footerText: {
    color: '#9CA3AF',
    textAlign: 'center',
    fontSize: 13,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    borderRadius: 28,
    padding: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F1F33',
    marginBottom: 6,
  },
  modalDescription: {
    fontSize: 15,
    textAlign: 'center',
    color: '#6B6F89',
    marginBottom: 16,
  },
});

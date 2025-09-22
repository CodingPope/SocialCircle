import React, { useState, useEffect } from 'react';
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
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithCredential,
  fetchSignInMethodsForEmail,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { auth, db } from '../../../../firebase/config';
import * as Google from 'expo-auth-session/providers/google';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useUserStore, useSessionRole } from '../../../profile';
import {
  registerForPushTokenAsync,
  initPushForUser,
} from '../../../notifications/services/pushService';
import {
  updateDoc,
  doc as fsDoc,
  serverTimestamp as fsServerTimestamp,
} from 'firebase/firestore';
import { GOOGLE_CLIENT_ID } from '@env';
import { track as trackClient } from '../../../../lib/analytics';
import { SafeAreaView } from 'react-native-safe-area-context';
import LoadingOverlay from '../../../../components/ui/LoadingOverlay';

export default function AuthScreen({ navigation, route }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [businessMode, setBusinessMode] = useState(!!route?.params?.business);
  const setUser = useUserStore((state) => state.setUser);
  const setProfileComplete = useUserStore((state) => state.setProfileComplete);
  const setRole = useSessionRole((s) => s.setRole);
  const setNextBusinessRoute = useSessionRole((s) => s.setNextBusinessRoute);

  useEffect(() => {
    if (route?.params && 'business' in route.params) {
      // Only affect local UI mode here; do NOT flip sessionRole until auth success
      setBusinessMode(!!route.params.business);
    }
  }, [route?.params?.business]);

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

  useEffect(() => {
    // Description: Handle Google sign-in and create user with full default schema if new
    if (googleResponse?.type === 'success') {
      const { id_token } = googleResponse.params;
      const credential = GoogleAuthProvider.credential(id_token);
      signInWithCredential(auth, credential)
        .then(async (result) => {
          if (result.additionalUserInfo?.isNewUser) {
            const {
              createUser,
            } = require('../../../profile/services/userService');
            const token = await registerForPushTokenAsync().catch(() => null);
            await createUser(result.user.uid, {
              email: result.user.email,
              deviceToken: token || null,
              pushOptIn: !!token,
              // Premium & popularity defaults
              premiumActive: false,
              premiumTier: 'free',
              premiumSince: null,
              premiumUntil: null,
              isPopular: false,
              popularScore: 0,
            });
            if (token) initPushForUser(result.user.uid).catch(() => {});
          } else {
            initPushForUser(result.user.uid).catch(() => {});
          }
        })
        .catch((err) => Alert.alert('Google Sign Up Error', err.message));
    }
  }, [googleResponse]);

  const handleSubmit = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    const emailOk = /.+@+\..+/.test(String(email).trim());
    if (!/.+@.+\..+/.test(String(email).trim())) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }
    if (typeof password !== 'string' || password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const userRef = doc(db, 'users', result.user.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : {};
        setUser({ uid: result.user.uid, ...userData });
        const complete = isProfileComplete(userData);
        setProfileComplete(complete);

        // If user is logging in as business, do not attempt user doc push init
        if (businessMode) {
          setRole('business');
          setNextBusinessRoute('BusinessOnboarding');
          setLoading(false);
          return;
        }

        // Only initialize push for consumer accounts that have a user profile doc
        if (userSnap.exists()) {
          await initPushForUser(result.user.uid).catch(() => {});
        }
      } else if (mode === 'signup') {
        // Check if account already exists
        let methods = [];
        try {
          methods = await fetchSignInMethodsForEmail(auth, email);
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
        const result = await createUserWithEmailAndPassword(
          auth,
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

        // Consumer signup: create minimal, rule-compliant user profile
        const userDocRef = doc(db, 'users', result.user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (!userDocSnap.exists()) {
          try {
            const token = await registerForPushTokenAsync().catch(() => null);
            await setDoc(userDocRef, {
              email: result.user.email,
              createdAt: serverTimestamp(),
              friends: [],
              interests: [],
              firstName: '',
              lastName: '',
              dob: null,
              sex: '',
              location: { latitude: null, longitude: null },
              bio: '',
              profileImage: '',
              status: 'active',
              verified: false,
              attendedEvents: [],
              createdEvents: [],
              followerCount: 0,
              followingCount: 0,
              ratings: {},
              savedCount: 0,
              referralCode: '',
              referredBy: '',
              rating: 0,
              ratingCount: 0,
              eventCount: 0,
              followCount: 0,
              following: [],
              lastActive: serverTimestamp(),
              deviceToken: token || null,
              pushOptIn: !!token,
              isDeleted: false,
              deletedAt: null,
              // IMPORTANT: Do not include restricted keys (premiumTier/premiumSince/premiumUntil/popularScore)
              // Firestore rules will reject creates that attempt to set them client-side.
              premiumActive: false,
              isPopular: false,
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
            const { collection } = require('firebase/firestore');
            const profileviewsRef = collection(userDocRef, 'profileviews');
            await setDoc(doc(profileviewsRef, 'initialSeed'), {
              timestamp: serverTimestamp(),
              viewerId: 'system',
            });
          } catch {}
        }

        // Load into store and continue onboarding for consumers
        const userData = (await getDoc(userDocRef)).data();
        setUser({ uid: result.user.uid, ...userData });
        setProfileComplete(false);
        await initPushForUser(result.user.uid).catch(() => {});
      }
    } catch (err) {
      Alert.alert(
        mode === 'login' ? 'Login failed' : 'Signup failed',
        err.message
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = () => {
    if (!email) {
      Alert.alert('Reset Password', 'Please enter your email first.');
      return;
    }
    sendPasswordResetEmail(auth, email)
      .then(() => Alert.alert('Check your email', 'Password reset link sent!'))
      .catch((err) => Alert.alert('Reset Password', err.message));
  };

  // 🔥 ANIMATED GRADIENT LOGIC
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 6000 }), -1, true);
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const color1 = interpolateColor(
      progress.value,
      [0, 1],
      ['#ff6b6b', '#4dabf7'] // coral -> light blue
    );
    const color2 = interpolateColor(
      progress.value,
      [0, 1],
      ['#f7d794', '#a29bfe'] // peach -> soft purple
    );
    return { color1, color2 };
  });

  return (
    <Animated.View style={[styles.container]}>
      <LinearGradient
        colors={[
          animatedStyle.color1?.backgroundColor || '#ff6b6b',
          animatedStyle.color2?.backgroundColor || '#4dabf7',
        ]}
        style={StyleSheet.absoluteFill}
      />

      {/* Removed SafeAreaView to avoid inset rectangle; use plain View */}
      <View style={{ flex: 1 }}>
        <View style={styles.overlay}>
          {/* Loading overlay */}
          <LoadingOverlay visible={loading} />
          <Image
            source={require('../../../../../assets/SocialCircleLogoClear.png')}
            style={styles.logo}
            resizeMode='contain'
          />

          <View style={styles.card}>
            {businessMode ? (
              <Text style={styles.businessLabel}>business login</Text>
            ) : null}

            <TextInput
              placeholder='Email'
              value={email}
              onChangeText={setEmail}
              autoCapitalize='none'
              keyboardType='email-address'
              style={styles.input}
              placeholderTextColor='#999'
            />
            <TextInput
              placeholder='Password'
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.input}
              placeholderTextColor='#999'
            />

            {loading ? (
              <ActivityIndicator
                size='large'
                color='#ff6b6b'
                style={{ marginVertical: 12 }}
              />
            ) : (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleSubmit}
              >
                <Text style={styles.primaryButtonText}>
                  {mode === 'login' ? 'Login' : 'Create Account'}
                </Text>
              </TouchableOpacity>
            )}

            {mode === 'signup' && (
              <TouchableOpacity
                style={[styles.secondaryButton, { opacity: 0.5 }]}
                disabled
              >
                <Text style={styles.secondaryButtonText}>
                  Sign up with Google (Coming Soon)
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
            >
              <Text style={styles.linkText}>
                {mode === 'login'
                  ? 'Need an account? Sign Up'
                  : 'Already have an account? Login'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={handlePasswordReset}
            >
              <Text style={styles.linkText}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.businessFab}
            accessibilityRole='button'
            accessibilityLabel={businessMode ? 'User login' : 'Business login'}
            onPress={() => {
              const next = !businessMode;
              try {
                navigation.setParams &&
                  navigation.setParams({ business: next });
              } catch {}
              setBusinessMode(next);
            }}
          >
            <Text style={styles.businessFabText}>
              {businessMode ? 'User login' : 'Business login'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.15)', // soft overlay for readability
  },
  logo: {
    width: 220,
    height: 90,
    alignSelf: 'center',
    marginBottom: 30,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  primaryButton: {
    backgroundColor: '#ff6b6b',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: '#4285F4',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  linkButton: {
    marginTop: 14,
    alignItems: 'center',
  },
  linkText: {
    color: '#4285F4',
    fontSize: 14,
  },
  businessLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ff6b6b',
    marginBottom: 8,
    textTransform: 'none',
  },
  businessFab: {
    position: 'absolute',
    left: 16,
    bottom: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  businessFabText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});

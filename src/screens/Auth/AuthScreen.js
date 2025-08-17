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
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import * as Google from 'expo-auth-session/providers/google';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useUserStore } from '../../store/userStore';
import { registerForPushTokenAsync } from '../../lib/push';
import {
  updateDoc,
  doc as fsDoc,
  serverTimestamp as fsServerTimestamp,
} from 'firebase/firestore';

export default function AuthScreen({ navigation }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setUser = useUserStore((state) => state.setUser);
  const setProfileComplete = useUserStore((state) => state.setProfileComplete);

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
      clientId: process.env.GOOGLE_CLIENT_ID,
    });

  useEffect(() => {
    // Description: Handle Google sign-in and create user with full default schema if new
    if (googleResponse?.type === 'success') {
      const { id_token } = googleResponse.params;
      const credential = GoogleAuthProvider.credential(id_token);
      signInWithCredential(auth, credential)
        .then(async (result) => {
          if (result.additionalUserInfo?.isNewUser) {
            // Use createUser utility for full schema
            const { createUser } = require('../../services/userService');
            await createUser(result.user.uid, {
              email: result.user.email,
            });
          }
        })
        .catch((err) => Alert.alert('Google Sign Up Error', err.message));
    }
  }, [googleResponse]);

  async function initPushForUser(uid) {
    try {
      const token = await registerForPushTokenAsync();
      if (!token) return; // user denied / error
      await updateDoc(fsDoc(db, 'users', uid), {
        deviceToken: token,
        pushOptIn: true,
        updatedAt: fsServerTimestamp(),
      });
      // keep Zustand mirror in sync
      const setUserLocal = useUserStore.getState().setUser;
      const userLocal = useUserStore.getState().user || {};
      setUserLocal({ ...userLocal, deviceToken: token, pushOptIn: true });
    } catch (e) {
      console.warn('[push] init token failed:', e?.message || e);
    }
  }

  const handleSubmit = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        // ...existing login logic...
        const result = await signInWithEmailAndPassword(auth, email, password);
        const userDoc = await getDoc(doc(db, 'users', result.user.uid));
        const userData = userDoc.data();
        setUser({ uid: result.user.uid, ...userData });
        const complete = isProfileComplete(userData);
        setProfileComplete(complete);
        await initPushForUser(result.user.uid);
      } else if (mode === 'signup') {
        console.log('[AuthScreen] Signup flow started for:', email);
        // --- Best Practice: Auth Reactivation Flow ---
        // 1. Try to sign in with the email/password
        try {
          const result = await signInWithEmailAndPassword(
            auth,
            email,
            password
          );
          // If sign-in succeeds, user exists and is active
          console.log(
            '[AuthScreen] User exists and is active:',
            result.user.uid
          );
          Alert.alert(
            'Account Exists',
            'An account with this email already exists. Please log in.'
          );
          setLoading(false);
          return;
        } catch (signInErr) {
          console.log(
            '[AuthScreen] signInWithEmailAndPassword error:',
            signInErr.code,
            signInErr.message
          );
          if (signInErr.code === 'auth/user-disabled') {
            // User exists but is disabled (soft-deleted)
            const {
              findSoftDeletedUserByEmail,
              reactivateUser,
            } = require('../../services/userService');
            const softDeleted = await findSoftDeletedUserByEmail(email);
            console.log('[AuthScreen] Soft-deleted user found:', softDeleted);
            if (softDeleted) {
              Alert.alert(
                'Reactivate Account',
                'An account with this email was previously deleted. Would you like to reactivate it and restore your previous data?',
                [
                  {
                    text: 'Cancel',
                    style: 'cancel',
                    onPress: () => setLoading(false),
                  },
                  {
                    text: 'Reactivate',
                    style: 'default',
                    onPress: async () => {
                      try {
                        console.log(
                          '[AuthScreen] Reactivating user:',
                          softDeleted.id
                        );
                        await reactivateUser(softDeleted.id, {});
                        // Poll for Auth user to be enabled
                        let enabled = false;
                        let attempts = 0;
                        const maxAttempts = 8; // ~8 seconds
                        while (!enabled && attempts < maxAttempts) {
                          try {
                            await new Promise((res) => setTimeout(res, 1000));
                            // Try to sign in again
                            await signInWithEmailAndPassword(
                              auth,
                              email,
                              password
                            );
                            enabled = true;
                          } catch (err) {
                            if (err.code === 'auth/user-disabled') {
                              // Still disabled, keep polling
                              attempts++;
                              console.log(
                                '[AuthScreen] Waiting for Auth user to be enabled... attempt',
                                attempts
                              );
                            } else {
                              // Some other error, break and show error
                              throw err;
                            }
                          }
                        }
                        if (enabled) {
                          Alert.alert(
                            'Account Reactivated',
                            'Your account has been reactivated. Logging you in...'
                          );
                          // Fetch user profile and proceed
                          const userDoc = await getDoc(
                            doc(db, 'users', softDeleted.id)
                          );
                          const userData = userDoc.data();
                          setUser({ uid: softDeleted.id, ...userData });
                          const complete = isProfileComplete(userData);
                          setProfileComplete(complete);
                          await initPushForUser(softDeleted.id);
                        } else {
                          Alert.alert(
                            'Reactivation Delayed',
                            'Your account is reactivated, but login is not yet available. Please try again in a few seconds.'
                          );
                        }
                        setLoading(false);
                      } catch (e) {
                        console.log(
                          '[AuthScreen] Reactivation failed:',
                          e.message
                        );
                        Alert.alert('Reactivation Failed', e.message);
                        setLoading(false);
                      }
                    },
                  },
                ]
              );
              return;
            }
          } else if (signInErr.code === 'auth/user-not-found') {
            // User does not exist, proceed with normal signup
            console.log('[AuthScreen] No user found, proceeding with signup.');
            const result = await createUserWithEmailAndPassword(
              auth,
              email,
              password
            );
            const userDocRef = doc(db, 'users', result.user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (!userDocSnap.exists()) {
              try {
                console.log(
                  '[AuthScreen] Creating Firestore user doc for:',
                  result.user.uid
                );
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
                  followingCount: 0,
                  lastActive: serverTimestamp(),
                  deviceToken: '',
                  savedCount: 0,
                  sex: '',
                  status: 'active',
                  isDeleted: false,
                  deletedAt: null,
                  // Add any other fields as needed from the image
                });
                const { collection } = require('firebase/firestore');
                const profileviewsRef = collection(userDocRef, 'profileviews');
                await setDoc(doc(profileviewsRef, 'initialSeed'), {
                  timestamp: serverTimestamp(),
                  viewerId: 'system',
                });
              } catch (err) {
                console.log(
                  '[AuthScreen] Error creating Firestore user doc:',
                  err.message
                );
                Alert.alert(
                  'Account Creation Error',
                  'Could not create user profile. Please try again.'
                );
                setLoading(false);
                return;
              }
            }
            const userData = (await getDoc(userDocRef)).data();
            setUser({ uid: result.user.uid, ...userData });
            setProfileComplete(false);
            await initPushForUser(result.user.uid);
          } else if (signInErr.code === 'auth/wrong-password') {
            console.log('[AuthScreen] Wrong password for existing user.');
            Alert.alert(
              'Account Exists',
              'An account with this email already exists. Please log in.'
            );
            setLoading(false);
            return;
          } else {
            console.log('[AuthScreen] Signup failed:', signInErr.message);
            Alert.alert('Signup failed', signInErr.message);
            setLoading(false);
            return;
          }
        }
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

      <View style={styles.overlay}>
        <Image
          source={require('../../../assets/SocialCircleLogoClear.png')}
          style={styles.logo}
          resizeMode='contain'
        />

        <View style={styles.card}>
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
});

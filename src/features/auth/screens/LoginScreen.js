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
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  GoogleAuthProvider,
  signInWithCredential,
  OAuthProvider,
} from 'firebase/auth';
import * as Google from 'expo-auth-session/providers/google';
import { GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '@env';

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { useUserStore } from '../../profile/userStore';
import {
  registerForPushTokenAsync,
  initPushForUser,
} from '../../notifications/services/pushService';
// Apple Sign-In handler
async function handleAppleSignIn() {
  const appleAuthResponse = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (appleAuthResponse.identityToken) {
    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({
      idToken: appleAuthResponse.identityToken,
    });
    await signInWithCredential(auth, credential);
  }
}
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../../firebase/config';
import { track as trackClient } from '../../../lib/analytics';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // or 'signup'
  const [error, setError] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  // Set up Google sign-in hook at the top level
  // Use platform-specific client ID
  const clientId =
    Platform.OS === 'ios' ? GOOGLE_IOS_CLIENT_ID : GOOGLE_CLIENT_ID;
  const [googleRequest, googleResponse, googlePromptAsync] =
    Google.useIdTokenAuthRequest({
      clientId,
    });
  // console.log('Google Auth Request:', googleRequest);
  useEffect(() => {
    if (googleRequest) trackClient('google_auth_request_ready', {});
  }, [googleRequest]);

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const { id_token } = googleResponse.params;
      const credential = GoogleAuthProvider.credential(id_token);
      signInWithCredential(auth, credential).catch((err) => {
        setError(err.message);
      });
    }
  }, [googleResponse]);

  // Description: Handles login and navigates to MainTabs (Map tab) on success
  const handleLogin = async () => {
    setError('');
    try {
      const res = await signInWithEmailAndPassword(auth, email, password);
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
      setError(e.message);
    }
  };

  const handleSignUp = async () => {
    setError('');
    try {
      // Try to sign in first to check if user exists
      try {
        await signInWithEmailAndPassword(auth, email, password);
        setError('An account with this email already exists. Please log in.');
        return;
      } catch (signInErr) {
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
                    } = require('../../profile/userService');
                    const softDeleted = await findSoftDeletedUserByEmail(email);
                    if (softDeleted) {
                      await reactivateUser(softDeleted.id, {});
                      Alert.alert(
                        'Account Reactivated',
                        'Your account has been reactivated. Please log in.'
                      );
                    } else {
                      setError('Could not find soft-deleted user.');
                    }
                  } catch (e) {
                    setError('Reactivation failed: ' + e.message);
                  }
                },
              },
            ]
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
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Request push permission (best-effort); do not block if denied
      const token = await registerForPushTokenAsync().catch(() => null);
      await setDoc(doc(db, 'users', cred.user.uid), {
        email,
        createdAt: serverTimestamp(),
        isDeleted: false,
        deletedAt: null,
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
      // Best-effort init to store platform and timestamps
      initPushForUser(cred.user.uid).catch(() => {});
    } catch (e) {
      setError(e.message);
    }
  };

  const onSubmit = mode === 'login' ? handleLogin : handleSignUp;

  const handlePasswordReset = async () => {
    if (!resetEmail) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }
    try {
      await auth.sendPasswordResetEmail(resetEmail);
      Alert.alert('Success', 'Password reset email sent! Check your inbox.');
      setShowReset(false);
      setResetEmail('');
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.title}>
          {mode === 'login' ? 'Login' : 'Sign Up'}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TextInput
          style={styles.input}
          placeholder='Email'
          value={email}
          onChangeText={setEmail}
          autoCapitalize='none'
        />
        <TextInput
          style={styles.input}
          placeholder='Password'
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity style={styles.button} onPress={onSubmit}>
          <Text style={styles.buttonText}>
            {mode === 'login' ? 'Login' : 'Create Account'}
          </Text>
        </TouchableOpacity>
        {mode === 'login' &&
          (googleRequest ? (
            <TouchableOpacity
              style={styles.googleButton}
              onPress={() => googlePromptAsync()}
            >
              <Text
                style={{ color: '#DB4437', fontWeight: 'bold', fontSize: 16 }}
              >
                Login with Google
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.googleButton}>
              <Text
                style={{ color: '#DB4437', fontWeight: 'bold', fontSize: 16 }}
              >
                Google login unavailable (check client ID and Expo setup)
              </Text>
            </View>
          ))}
        <TouchableOpacity
          style={styles.buttonSecondary}
          onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
        >
          <Text style={styles.buttonTextSecondary}>
            {mode === 'login'
              ? 'Need an account? Sign Up'
              : 'Have an account? Login'}
          </Text>
        </TouchableOpacity>
        {mode === 'login' && (
          <TouchableOpacity
            style={styles.forgotButton}
            onPress={() => setShowReset(true)}
          >
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>
        )}
        {/* reset password modal */}
        <Modal visible={showReset} animationType='slide' transparent={true}>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <TextInput
                style={styles.input}
                placeholder='Enter your email'
                value={resetEmail}
                onChangeText={setResetEmail}
                autoCapitalize='none'
                keyboardType='email-address'
              />
              <TouchableOpacity
                style={styles.button}
                onPress={handlePasswordReset}
              >
                <Text style={styles.buttonText}>Send Reset Link</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.buttonSecondary}
                onPress={() => setShowReset(false)}
              >
                <Text style={styles.buttonTextSecondary}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: { fontSize: 24, textAlign: 'center', marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    marginVertical: 8,
    padding: 8,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 6,
    marginVertical: 8,
    alignItems: 'center',
  },
  buttonText: { color: 'white', fontSize: 16 },
  buttonSecondary: {
    padding: 12,
    marginVertical: 8,
    alignItems: 'center',
  },
  buttonTextSecondary: {
    color: '#007AFF',
    fontSize: 16,
  },
  error: { color: 'red', textAlign: 'center', marginBottom: 8 },
  forgotButton: {
    alignItems: 'center',
    marginVertical: 8,
  },
  forgotText: {
    color: '#007AFF',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    width: '80%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  googleButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DB4437',
    borderRadius: 6,
    padding: 12,
    marginVertical: 8,
    alignItems: 'center',
  },
});

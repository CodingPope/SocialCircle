// src/screens/Auth/AuthScreen.js
import React, { useState } from 'react';
import {
  View,
  TextInput,
  Button,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import * as Google from 'expo-auth-session/providers/google';

export default function AuthScreen({ navigation }) {
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Google Sign-Up handler
  const [googleRequest, googleResponse, googlePromptAsync] =
    Google.useIdTokenAuthRequest({
      clientId: process.env.GOOGLE_CLIENT_ID,
    });

  React.useEffect(() => {
    if (googleResponse?.type === 'success') {
      const { id_token } = googleResponse.params;
      const credential = GoogleAuthProvider.credential(id_token);
      signInWithCredential(auth, credential)
        .then((result) => {
          // Optionally create Firestore doc for new users
          if (result.additionalUserInfo?.isNewUser) {
            setDoc(doc(db, 'users', result.user.uid), {
              email: result.user.email,
              createdAt: serverTimestamp(),
              friends: [],
              interests: [],
            });
          }
        })
        .catch((err) => {
          Alert.alert('Google Sign Up Error', err.message);
        });
    }
  }, [googleResponse]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const result = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        const user = result.user;
        // create initial Firestore doc (no firstName so onboarding kicks in)
        await setDoc(doc(db, 'users', user.uid), {
          createdAt: serverTimestamp(),
          friends: [],
          interests: [],
        });
      }
      // no manual navigation here—AppNavigator will react to auth/profile changes
    } catch (err) {
      Alert.alert(
        mode === 'login' ? 'Login failed' : 'Signup failed',
        err.message
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        placeholder='Email'
        value={email}
        onChangeText={setEmail}
        autoCapitalize='none'
        keyboardType='email-address'
        style={styles.input}
      />
      <TextInput
        placeholder='Password'
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
      />

      {loading ? (
        <ActivityIndicator style={{ marginVertical: 12 }} />
      ) : (
        <Button
          title={mode === 'login' ? 'Login' : 'Create Account'}
          onPress={handleSubmit}
        />
      )}

      {mode === 'signup' && (
        <Button
          title='Sign up with Google'
          onPress={() => googlePromptAsync()}
        />
      )}

      <View style={{ height: 12 }} />

      <Button
        title={
          mode === 'login'
            ? 'Need an account? Sign Up'
            : 'Have an account? Login'
        }
        onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
      />

      <Button
        title='Forgot Password?'
        onPress={() => {
          if (!email) {
            Alert.alert(
              'Reset Password',
              'Please enter your email above first.'
            );
            return;
          }
          sendPasswordResetEmail(auth, email)
            .then(() => {
              Alert.alert(
                'Reset Password',
                'Password reset email sent! Check your inbox.'
              );
            })
            .catch((err) => {
              Alert.alert('Reset Password', err.message);
            });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center' },
  input: { marginBottom: 16, borderBottomWidth: 1, padding: 8 },
});

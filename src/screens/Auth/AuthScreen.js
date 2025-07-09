import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, ActivityIndicator, StyleSheet } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen({ navigation }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [request, response, promptAsync] = Google.useAuthRequest({
    expoClientId: 'YOUR_EXPO_CLIENT_ID',
  });

  useEffect(() => {
    const completeGoogleSignIn = async () => {
      if (response?.type === 'success') {
        try {
          setLoading(true);
          const { id_token, access_token } = response.authentication;
          const credential = GoogleAuthProvider.credential(id_token, access_token);
          const cred = await signInWithCredential(auth, credential);
          await setDoc(
            doc(db, 'users', cred.user.uid),
            { rating: 0, createdAt: serverTimestamp() },
            { merge: true }
          );
        } catch (e) {
          setError(e.message);
        } finally {
          setLoading(false);
        }
      }
    };
    completeGoogleSignIn();
  }, [response]);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', cred.user.uid), {
          rating: 0,
          createdAt: serverTimestamp(),
        });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{mode === 'login' ? 'Login' : 'Sign Up'}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Button title={mode === 'login' ? 'Login' : 'Create Account'} onPress={handleSubmit} />
      <Button
        title={mode === 'login' ? 'Need an account? Sign Up' : 'Have an account? Login'}
        onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
      />
      <View style={{ marginTop: 20 }}>
        <Button
          title="Continue with Google"
          onPress={() => promptAsync()}
          disabled={!request}
        />
      </View>
      {loading && <ActivityIndicator style={{ marginTop: 10 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, textAlign: 'center', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ccc', marginVertical: 8, padding: 8 },
  error: { color: 'red', textAlign: 'center', marginBottom: 8 },
});

/**
 * Test plan:
 * - Sign up a new user -> redirected to interest selection
 * - Select interests -> redirected into main app
 * - Close and re-open the app -> should go straight into main app as logged in.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // or 'signup'
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSignUp = async () => {
    setError('');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        email,
        createdAt: serverTimestamp(),
      });
      navigation.replace('Interests');
    } catch (e) {
      setError(e.message);
    }
  };

  const onSubmit = mode === 'login' ? handleLogin : handleSignUp;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{mode === 'login' ? 'Login' : 'Sign Up'}</Text>
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
      <Button title={mode === 'login' ? 'Login' : 'Create Account'} onPress={onSubmit} />
      <Button
        title={mode === 'login' ? 'Need an account? Sign Up' : 'Have an account? Login'}
        onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  input: { borderWidth: 1, borderColor: '#ccc', marginVertical: 8, padding: 8 },
  title: { fontSize: 24, textAlign: 'center', marginBottom: 16 },
  error: { color: 'red', textAlign: 'center', marginBottom: 8 },
});

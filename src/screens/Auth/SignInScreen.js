import React, { useState } from 'react';
import { View, Text, TextInput, Button } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../services/firebase';

export default function SignInScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignIn = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigation.replace('Map');
    } catch (err) {
      console.log('Sign in error', err);
    }
  };

  return (
    <View style={styles.container}>
      <Text>Sign In</Text>
      <TextInput
        placeholder='Email'
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />
      <TextInput
        placeholder='Password'
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={styles.input}
      />
      <Button title='Sign In' onPress={handleSignIn} />
      <Button
        title='Go to Sign Up'
        onPress={() => navigation.navigate('SignUp')}
      />
    </View>
  );
}

const styles = {
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  input: { borderWidth: 1, borderColor: '#ccc', marginVertical: 8, padding: 8 },
};

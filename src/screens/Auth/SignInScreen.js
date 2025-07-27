import React, { useState } from 'react';
import { View, Button, ActivityIndicator, Image, Alert } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../../firebase'; // adjust the path as necessary

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // ← NO navigation.replace here
    } catch (err) {
      Alert.alert('Login failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return loading ? (
    <ActivityIndicator style={{ marginTop: 16 }} />
  ) : (
    <View style={{ padding: 20 }}>
      <Image
        source={require('../../../assets/SocialCircleLogoClear.png')}
        style={{
          width: 150,
          height: 150,
          alignSelf: 'center',
          marginBottom: 20,
        }}
      />
      <Button title='Login' onPress={handleSignIn} />
    </View>
  );
}

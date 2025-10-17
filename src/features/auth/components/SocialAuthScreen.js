import React, { useEffect } from 'react';
import { View, Text, Button, StyleSheet, Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import { auth } from '../../../firebase/config';
import * as WebBrowser from 'expo-web-browser';
import { GOOGLE_EXPO_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '@env';
import { track as trackClient } from '../../../lib/analytics';

WebBrowser.maybeCompleteAuthSession();

export default function SocialAuthScreen({ navigation }) {
  const [request, response, promptAsync] = Google.useAuthRequest({
    expoClientId: GOOGLE_EXPO_CLIENT_ID, // your “Web” client
    iosClientId: GOOGLE_IOS_CLIENT_ID, // the one you just created
    androidClientId: GOOGLE_IOS_CLIENT_ID, // also host.exp.exponent
    webClientId: GOOGLE_EXPO_CLIENT_ID, // often same as expoClientId
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token, access_token } = response.authentication;
      const credential = auth.GoogleAuthProvider.credential(
        id_token,
        access_token
      );
      auth()
        .signInWithCredential(credential)
        .catch((error) =>
        console.error('Google sign-in error', error)
      );
    }
  }, [response]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign up or log in</Text>
      <Button title='Continue with Google' onPress={() => promptAsync()} />
      {Platform.OS === 'ios' && (
        <View style={{ marginTop: 10 }}>
          <Text style={{ color: '#6b7280' }}>
            Apple Sign In is not configured for this build. Install the
            `expo-apple-authentication` module to enable the button.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, marginBottom: 20 },
});

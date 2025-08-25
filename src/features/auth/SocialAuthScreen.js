import React, { useEffect } from 'react';
import { View, Text, Button, StyleSheet, Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  GoogleAuthProvider,
  signInWithCredential,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from '../../firebase/config';
import * as WebBrowser from 'expo-web-browser';
import { GOOGLE_EXPO_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '@env';
import { track as trackClient } from '../../lib/analytics';

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
      const credential = GoogleAuthProvider.credential(id_token, access_token);
      signInWithCredential(auth, credential).catch((error) =>
        console.error('Google sign-in error', error)
      );
    }
  }, [response]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign up or log in</Text>
      <Button title='Continue with Google' onPress={() => promptAsync()} />
      {Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={5}
          style={{ width: 200, height: 44, marginTop: 10 }}
          onPress={async () => {
            try {
              const appleCredential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                  AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                  AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
              });

              // TODO: Convert to Firebase credential and sign in
              // console.log('Apple credential:', appleCredential);
              trackClient('apple_auth_credential_received', {
                has_email: !!appleCredential?.email,
              });
            } catch (e) {
              // console.log('Apple sign-in error:', e);
              trackClient('apple_auth_error', { code: e?.code || null });
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, marginBottom: 20 },
});

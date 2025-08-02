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

export default function AuthScreen({ navigation }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Google Auth (disabled for now but kept in)
  const [googleRequest, googleResponse, googlePromptAsync] =
    Google.useIdTokenAuthRequest({
      clientId: process.env.GOOGLE_CLIENT_ID,
    });

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const { id_token } = googleResponse.params;
      const credential = GoogleAuthProvider.credential(id_token);
      signInWithCredential(auth, credential)
        .then((result) => {
          if (result.additionalUserInfo?.isNewUser) {
            setDoc(doc(db, 'users', result.user.uid), {
              email: result.user.email,
              createdAt: serverTimestamp(),
              friends: [],
              interests: [],
            });
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
    setLoading(true);
    try {
      if (mode === 'login') {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const userDoc = await getDoc(doc(db, 'users', result.user.uid));
        if (userDoc.exists()) {
          navigation.replace('Map'); // Navigate to MapScreen for existing users
        } else {
          navigation.replace('NameDobScreen'); // Navigate to onboarding for new users
        }
      } else {
        const result = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        await setDoc(doc(db, 'users', result.user.uid), {
          createdAt: serverTimestamp(),
          friends: [],
          interests: [],
        });
        navigation.replace('NameDobScreen'); // Navigate to onboarding for new users
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

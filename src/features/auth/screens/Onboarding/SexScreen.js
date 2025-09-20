import React, { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { Modal, ActivityIndicator } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { useUserStore } from '../../../../features/profile/userStore';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../../firebase/config';
import AnimatedGradientBackground from '../../../../components/ui/AnimatedGradientBackground';
import { Ionicons } from '@expo/vector-icons';
import { logOnboardingStepComplete } from '../../../../services/onboardingAnalytics';

const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary'];

export default function SexScreen({ navigation }) {
  const user = useUserStore((state) => state.user);
  const [selectedSex, setSelectedSex] = useState('Male');
  const [loading, setLoading] = useState(false);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');

  const buttonScale = new Animated.Value(1);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(buttonScale, {
          toValue: 1.05,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(buttonScale, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      { iterations: 2 }
    ).start();
  }, []);

  const onNext = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { sex: selectedSex });
      await logOnboardingStepComplete('sex', {
        choice: selectedSex?.toLowerCase?.() || 'unknown',
      });
      setLocationModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const handleGetLocation = async () => {
    setLocationLoading(true);
    setLocationError('');
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission is required to continue.');
        setLocationLoading(false);
        return;
      }
      let loc = await Location.getCurrentPositionAsync({});
      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      await updateDoc(doc(db, 'users', user.uid), { location: coords });
      useUserStore.getState().setUser({ ...user, location: coords });
      await logOnboardingStepComplete('location', {
        method: 'gps_prompt',
        granted: true,
      });
      setLocationModalVisible(false);
      navigation.navigate('InterestsScreen');
    } catch (err) {
      setLocationError(err.message || 'Failed to get location.');
    } finally {
      setLocationLoading(false);
    }
  };

  return (
    <AnimatedGradientBackground style={styles.container}>
      <Text style={styles.header}>What's your gender?</Text>
      <TouchableOpacity
        onPress={() => {
          navigation.navigate('NameDob');
        }}
        style={styles.goBackButton}
      >
        <Text style={styles.goBackText}>Go Back</Text>
      </TouchableOpacity>
      <View style={styles.genderContainer}>
        {GENDER_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.genderOption,
              selectedSex === option && styles.selectedOption,
            ]}
            onPress={() => setSelectedSex(option)}
          >
            <Text
              style={[
                styles.genderText,
                selectedSex === option && styles.selectedText,
              ]}
            >
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
        <TouchableOpacity
          style={styles.nextButton}
          onPress={onNext}
          disabled={loading}
        >
          <Text style={styles.nextButtonText}>
            {loading ? 'Saving…' : 'Next'}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Location Modal */}
      <Modal
        visible={locationModalVisible}
        animationType='fade'
        transparent
        onRequestClose={() => {}}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              padding: 28,
              borderRadius: 16,
              width: '85%',
              alignItems: 'center',
            }}
          >
            <Text
              style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}
            >
              Share Your Location
            </Text>
            <Text
              style={{
                fontSize: 15,
                color: '#555',
                marginBottom: 18,
                textAlign: 'center',
              }}
            >
              To help you discover local events and friends, we need your
              location. Your data is private and only used for Social Circle
              features.
            </Text>
            {locationLoading ? (
              <ActivityIndicator
                size='large'
                color='#ff6b6b'
                style={{ marginVertical: 16 }}
              />
            ) : (
              <TouchableOpacity
                style={{
                  backgroundColor: '#ff6b6b',
                  borderRadius: 10,
                  paddingVertical: 14,
                  paddingHorizontal: 32,
                  marginTop: 8,
                }}
                onPress={handleGetLocation}
              >
                <Text
                  style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}
                >
                  Share My Location
                </Text>
              </TouchableOpacity>
            )}
            {locationError ? (
              <View style={{ marginTop: 18, alignItems: 'center' }}>
                <Text style={{ color: '#d00', fontSize: 15, marginBottom: 8 }}>
                  {locationError}
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#4285F4',
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 24,
                  }}
                  onPress={handleGetLocation}
                >
                  <Text
                    style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}
                  >
                    Try Again
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </AnimatedGradientBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 24,
    color: '#1E1E2F',
    marginTop: 32,
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    color: '#1E1E2F',
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 24,
    color: '#2C2C3A',
  },
  genderContainer: {
    marginBottom: 32,
  },
  genderOption: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingVertical: 14,
    borderRadius: 12,
    marginVertical: 8,
    alignItems: 'center',
  },
  selectedOption: {
    backgroundColor: '#007AFF',
  },
  genderText: {
    fontSize: 18,
    color: '#333',
  },
  selectedText: {
    color: '#fff',
    fontWeight: '600',
  },
  nextButton: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 5,
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  goBackButton: {
    position: 'absolute',
    top: 60,
    left: 24,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  goBackText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
  },
});

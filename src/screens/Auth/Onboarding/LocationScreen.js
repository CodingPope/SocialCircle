// Description: Onboarding screen to request location permission and save user location to Firestore
import React, { useState } from 'react';
import { View, Text, Button, ActivityIndicator, Alert } from 'react-native';
import * as Location from 'expo-location';
import { useUserStore } from '../../../store/userStore';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';

export default function LocationScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const user = useUserStore((state) => state.user);

  const handleGetLocation = async () => {
    setLoading(true);
    try {
      // Request location permission
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is required to continue.'
        );
        setLoading(false);
        return;
      }
      // Get current location
      let loc = await Location.getCurrentPositionAsync({});
      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      // Save to Firestore
      await updateDoc(doc(db, 'users', user.uid), {
        location: coords,
      });
      // Update Zustand user state
      useUserStore.getState().setUser({ ...user, location: coords });
      // Navigate to next onboarding screen
      navigation.replace('InterestsScreen');
    } catch (err) {
      Alert.alert('Location Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 16 }}>
        Share Your Location
      </Text>
      <Text style={{ fontSize: 16, color: '#555', marginBottom: 32 }}>
        To help you discover local events and friends, we need your location.
        Your data is private and only used for Social Circle features.
      </Text>
      {loading ? (
        <ActivityIndicator size='large' color='#ff6b6b' />
      ) : (
        <Button
          title='Share My Location'
          onPress={handleGetLocation}
          color='#ff6b6b'
        />
      )}
    </View>
  );
}

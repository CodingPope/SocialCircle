// src/screens/Auth/Onboarding/LocationScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { resetRoot } from '../../../navigation/RootNavigation';
import { useAuth } from '../../../context/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';

export default function LocationScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user.location?.latitude != null && user.location?.longitude != null) {
      // Navigate to MainTabs to include bottom tab navigation
      resetRoot([{ name: 'MainTabs' }]);
      return;
    }
    (async () => {
      console.log('Requesting location permission...');
      let { status } = await Location.requestForegroundPermissionsAsync();
      console.log('Permission status:', status);
      if (status !== 'granted') {
        setError('Location permission denied');
        setLoading(false);
        return;
      }
      console.log('Getting current position...');
      try {
        const { coords } = await Location.getCurrentPositionAsync({});
        console.log('Got coords:', coords);
        // Write lat/lng to Firestore
        await updateDoc(doc(db, 'users', user.uid), {
          location: {
            latitude: coords.latitude,
            longitude: coords.longitude,
          },
        });
        setLoading(false);
        console.log('Location saved, navigating to MainTabs...');
        // Navigate to MainTabs to include bottom tab navigation
        resetRoot([{ name: 'MainTabs' }]);
      } catch (error) {
        console.error('Error getting location:', error);
        setError('Error getting location');
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  return (
    <View style={styles.container}>
      <Text>{error || 'Unable to get location'}</Text>
      <Button
        title='Try Again'
        onPress={() => {
          setError(null);
          setLoading(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});

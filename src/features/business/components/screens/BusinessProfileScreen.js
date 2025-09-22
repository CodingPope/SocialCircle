// Description: Business Profile (brand profile, campaigns, analytics)
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function BusinessProfileScreen() {
  const nav = useNavigation();
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ fontSize: 22, fontWeight: '700' }}>
          Business Profile
        </Text>
        <Text style={{ marginTop: 8 }}>
          Manage brand, campaigns, analytics, locations, team, billing (coming
          soon).
        </Text>
        <TouchableOpacity
          onPress={() => nav.getParent()?.navigate('BusinessOnboarding')}
          style={{
            backgroundColor: '#828282',
            padding: 10,
            borderRadius: 8,
            marginTop: 16,
          }}
        >
          <Text style={{ color: '#fff', textAlign: 'center' }}>
            Edit Business Profile
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

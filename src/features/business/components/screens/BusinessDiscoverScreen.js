// Description: Business Discover (Audience Explorer / Market Watch)
import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function BusinessDiscoverScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ fontSize: 22, fontWeight: '700' }}>
          Audience Explorer
        </Text>
        <Text style={{ marginTop: 8 }}>
          Trending interests, competitor density, best time slots (coming soon).
        </Text>
      </View>
    </SafeAreaView>
  );
}

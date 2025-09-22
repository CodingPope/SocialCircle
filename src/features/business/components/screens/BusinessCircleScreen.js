// Description: Business My Circle (Hosts & Opportunities)
import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function BusinessCircleScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ fontSize: 22, fontWeight: '700' }}>
          Hosts & Opportunities
        </Text>
        <Text style={{ marginTop: 8 }}>
          Find verified hosts and popular users in your niche to offer perks
          (coming soon).
        </Text>
      </View>
    </SafeAreaView>
  );
}

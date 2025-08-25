// Description: Business Map screen with CTA to create Sponsored Event/Ad
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function BusinessMapScreen() {
  const nav = useNavigation();
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ fontSize: 22, fontWeight: '700' }}>Business Map</Text>
        <Text style={{ marginTop: 8 }}>
          Create a Sponsored Event or Ad targeted by location and interest.
        </Text>
        <TouchableOpacity
          onPress={() => nav.navigate('CreateSponsoredEvent')}
          style={{
            marginTop: 16,
            backgroundColor: '#2F80ED',
            padding: 12,
            borderRadius: 8,
          }}
        >
          <Text
            style={{
              color: '#fff',
              textAlign: 'center',
              fontWeight: '600',
            }}
          >
            Create Sponsored Event
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// Description: Placeholder Business Home until full console is built
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function BusinessHomePlaceholder() {
  const navigation = useNavigation();
  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 22, fontWeight: '700' }}>Business Home</Text>
      <Text style={{ marginTop: 8 }}>
        Welcome! Create your first sponsored event.
      </Text>
      <TouchableOpacity
        onPress={() => navigation.navigate('Step1')}
        style={{
          backgroundColor: '#2F80ED',
          padding: 12,
          borderRadius: 8,
          marginTop: 16,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600', textAlign: 'center' }}>
          Edit business profile
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => navigation.navigate('Map')}
        style={{
          backgroundColor: '#27AE60',
          padding: 12,
          borderRadius: 8,
          marginTop: 12,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600', textAlign: 'center' }}>
          Create first event
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// Description: Business My Circle (Hosts & Opportunities) - Temporary logout button
import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { auth } from '../../../../services/firebase/config';

export default function BusinessCircleScreen() {
  const navigation = useNavigation();

  const handleLogout = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your business account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🔴 Signing out business user...');

              // Sign out from Firebase
              await auth().signOut();

              console.log('✅ Sign out successful');

              // Navigation will be handled automatically by auth state change
              // But we can also manually reset just to be sure
              setTimeout(() => {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Auth' }],
                });
              }, 100);
            } catch (error) {
              console.error('❌ Logout error:', error);
              Alert.alert(
                'Error',
                `Failed to sign out: ${error.message || 'Unknown error'}`
              );
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>
          Hosts & Opportunities
        </Text>
        <Text style={{ marginTop: 8, color: '#666', marginBottom: 32 }}>
          Find verified hosts and popular users in your niche to offer perks
          (coming soon).
        </Text>

        {/* Temporary Logout Button */}
        <View
          style={{
            position: 'absolute',
            bottom: 40,
            left: 20,
            right: 20,
          }}
        >
          <TouchableOpacity
            onPress={handleLogout}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#fff0f0',
              borderWidth: 1,
              borderColor: '#ffd6d6',
              padding: 16,
              borderRadius: 12,
              gap: 8,
            }}
          >
            <Ionicons name='log-out-outline' size={20} color='#d11a2a' />
            <Text style={{ color: '#d11a2a', fontWeight: '600', fontSize: 16 }}>
              Sign Out (Temporary)
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function UserHeader({ title, onPress }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onPress} style={styles.iconButton}>
        <Ionicons name='arrow-back' size={24} color='#fff' />
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>
      <TouchableOpacity
        onPress={() => alert('Settings Pressed')}
        style={styles.iconButton}
      >
        <Ionicons name='settings' size={24} color='#fff' />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#f4511e',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  iconButton: {
    padding: 8,
  },
});

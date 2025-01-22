import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

export default function UserHeader({ title, onPress }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onPress}>
        <Icon name='arrow-back' size={24} color='#fff' />
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>
      <TouchableOpacity onPress={() => alert('Settings Pressed')}>
        <Icon name='settings' size={24} color='#fff' />
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
    backgroundColor: '#f4511e', // Change to your desired color
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff', // Change to your desired text color
  },
});

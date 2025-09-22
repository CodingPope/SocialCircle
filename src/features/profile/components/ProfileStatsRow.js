// src/components/profile/ProfileStatsRow.js

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ProfileStatsRow({
  friendsCount = 0,
  eventsCount = 0,
  onFriendsPress,
  onEventsPress,
  onBadgesPress,
}) {
  return (
    <View style={styles.container}>
      <StatItem label='Friends' value={friendsCount} onPress={onFriendsPress} />
      <StatItem label='Events' value={eventsCount} onPress={onEventsPress} />
      <TouchableOpacity style={styles.item} onPress={onBadgesPress}>
        <Ionicons name='star' size={18} color='#000' />
        <Text style={styles.label}>Badges</Text>
      </TouchableOpacity>
    </View>
  );
}

function StatItem({ label, value, onPress }) {
  return (
    <TouchableOpacity style={styles.item} onPress={onPress}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 10,
  },
  item: { alignItems: 'center' },
  value: { fontSize: 18, fontWeight: '700' },
  label: { fontSize: 12, color: '#777', marginTop: 2 },
});

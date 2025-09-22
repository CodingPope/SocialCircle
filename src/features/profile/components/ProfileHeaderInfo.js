// src/components/profile/ProfileHeaderInfo.js

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Avatar from '../../../components/ui/Avatar';
import RatingStars from './RatingStars';

export default function ProfileHeaderInfo({ user }) {
  const createdAt =
    user?.createdAt && !isNaN(new Date(user.createdAt))
      ? new Date(user.createdAt).toLocaleString('default', {
          month: 'short',
          year: 'numeric',
        })
      : 'N/A';

  return (
    <View style={styles.header}>
      <Avatar uri={user?.photoURL} size={90} />
      <Text style={styles.name}>{user?.displayName || 'User'}</Text>
      <RatingStars rating={user?.rating || 0} />
      <Text style={styles.joinDate}>User since {createdAt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginTop: 8,
  },
  joinDate: {
    fontSize: 14,
    color: '#f0f0f0',
    marginTop: 2,
  },
});

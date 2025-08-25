import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Avatar from '../../components/ui/Avatar';

export default function FriendCard({ friend, onPress }) {
  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress(friend)}>
      <Avatar uri={friend.photoURL} size={50} />
      <View style={styles.info}>
        <Text style={styles.name}>{friend.name}</Text>
        {friend.latestUpdate && (
          <Text style={styles.update}>{friend.latestUpdate}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  info: {
    marginLeft: 10,
    flex: 1,
  },
  name: {
    fontWeight: '600',
    fontSize: 16,
  },
  update: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
});

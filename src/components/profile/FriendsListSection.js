// src/components/profile/FriendsListSection.js

import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Avatar from '../ui/Avatar';

export default function FriendsListSection({ friends = [], onPressFriend }) {
  if (!friends.length) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Friends</Text>
      <FlatList
        data={friends}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.friendItem}
            onPress={() => onPressFriend(item)}
          >
            <Avatar uri={item.photoURL} size={55} />
            <Text style={styles.friendName} numberOfLines={1}>
              {item.name || 'Friend'}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 15, marginVertical: 10 },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 5 },
  friendItem: { alignItems: 'center', marginRight: 10 },
  friendName: { fontSize: 12, color: '#333', marginTop: 4, maxWidth: 55 },
});

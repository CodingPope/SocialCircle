import React, { useEffect, useState } from 'react';
import { View, Text, Image, FlatList, StyleSheet } from 'react-native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import smileDefault from '../../assets/smileDefault.png'; // Import the default image

// Description: Displays avatars and names of all users in the attendees array
export default function AttendeeList({ attendees = [] }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    // Fetch user data for all attendee IDs
    const fetchUsers = async () => {
      if (!attendees.length) {
        setUsers([]);
        return;
      }
      try {
        // Firestore 'in' queries limited to 10 items per query
        const chunks = [];
        for (let i = 0; i < attendees.length; i += 10) {
          chunks.push(attendees.slice(i, i + 10));
        }
        let allUsers = [];
        for (const chunk of chunks) {
          const q = query(
            collection(db, 'users'),
            where('__name__', 'in', chunk)
          );
          const snapshot = await getDocs(q);
          allUsers = allUsers.concat(
            snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }))
          );
        }
        setUsers(allUsers);
      } catch (err) {
        console.error('Error fetching attendee users:', err);
      }
    };
    fetchUsers();
  }, [attendees]);

  // Render avatar and name for each attendee
  const renderItem = ({ item }) => (
    <View style={styles.attendee}>
      <Image
        source={
          item.profileImageUrl ? { uri: item.profileImageUrl } : smileDefault
        }
        style={styles.avatar}
        accessibilityLabel={`${item.displayName || 'User'} avatar`}
      />
      <Text style={styles.name}>{item.displayName || 'User'}</Text>
    </View>
  );

  if (!users.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No attendees yet</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={users}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  attendee: {
    alignItems: 'center',
    marginRight: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#eee',
    marginBottom: 4,
  },
  name: {
    fontSize: 12,
    color: '#333',
    maxWidth: 60,
    textAlign: 'center',
  },
  emptyContainer: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
  },
});

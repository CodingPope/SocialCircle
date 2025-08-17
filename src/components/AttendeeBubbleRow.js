// Description: Displays a horizontal row (stack) of up to 3 attendee avatars with slight overlap, then a total count
import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet, Text } from 'react-native';
import smileDefault from '../../assets/smileDefault.png';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function AttendeeBubbleRow({ attendees = [] }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    async function fetchAttendeeUsers() {
      if (!attendees.length) {
        setUsers([]);
        return;
      }
      try {
        // Firestore 'in' query supports up to 10 items per chunk
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
            snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          );
        }
        setUsers(allUsers);
      } catch (err) {
        console.error(
          '[AttendeeBubbleRow] Error fetching attendee users:',
          err
        );
        setUsers([]);
      }
    }
    fetchAttendeeUsers();
  }, [attendees]);

  if (!users.length) {
    return (
      <View style={styles.bubbleRowEmpty} accessibilityLabel='No attendees yet'>
        <Text style={styles.emptyText}>No attendees yet</Text>
      </View>
    );
  }

  // Description: Only show up to 3 avatars, overlapped, then show total count
  const displayedUsers = users.slice(0, 3);

  return (
    <View
      style={styles.bubbleRow}
      accessibilityRole='image'
      accessibilityLabel={`${users.length} attendees joined`}
    >
      <View style={styles.avatarStack}>
        {displayedUsers.map((user, index) => (
          <Image
            key={user.id}
            source={
              user.profileImage
                ? { uri: user.profileImage }
                : user.avatarURL
                ? { uri: user.avatarURL }
                : smileDefault
            }
            style={[styles.avatar, index > 0 && styles.avatarOverlap]}
            accessibilityIgnoresInvertColors
            accessibilityLabel={`Attendee ${index + 1}`}
          />
        ))}
      </View>
      <Text style={styles.countText}>{users.length} joined</Text>
    </View>
  );
}

const AVATAR_SIZE = 32;
const OVERLAP_PERCENT = 0.2; // 20% overlap
const OVERLAP_OFFSET = -(AVATAR_SIZE * OVERLAP_PERCENT); // negative marginLeft for overlap

const styles = StyleSheet.create({
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 2,
  },
  bubbleRowEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 2,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: 8,
    backgroundColor: '#eee',
    borderWidth: 2, // Description: subtle border to distinguish overlaps
    borderColor: '#fff',
  },
  avatarOverlap: {
    marginLeft: OVERLAP_OFFSET,
  },
  countText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
    marginLeft: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
  },
});

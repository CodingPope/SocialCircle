// Description: Displays a horizontal row (stack) of up to 3 attendee avatars with slight overlap
import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet, Text } from 'react-native';
import smileDefault from '../../../assets/smileDefault.png';
import { useUserSnippetStore } from '../profile/userSnippetStore';

export default function AttendeeBubbleRow({
  attendees = [],
  snippets = null,
  countOverride = null,
}) {
  const [users, setUsers] = useState([]);
  const ensureSnippets = useUserSnippetStore((s) => s.ensureSnippets);

  // Stable string keys to avoid effect loops from array identity
  const attendeesKey = JSON.stringify(attendees || []);
  const snippetsKey = snippets
    ? Array.isArray(snippets)
      ? JSON.stringify(
          snippets
            .map((s) => s?.uid)
            .filter(Boolean)
            .sort()
        )
      : JSON.stringify(Object.keys(snippets).sort())
    : 'none';

  useEffect(() => {
    async function hydrateFromSnippets() {
      // Prefer denormalized snippets when provided
      if (
        snippets &&
        (Array.isArray(snippets) || typeof snippets === 'object')
      ) {
        const arr = Array.isArray(snippets)
          ? snippets
          : Object.values(snippets || {});
        // Normalize to minimal user shape expected by UI
        const mapped = arr
          .filter((s) => s && s.uid)
          .map((s) => ({
            id: s.uid,
            profileImage: s.photoURL || null,
            avatarURL: null,
            displayName: s.name || 'User',
          }));
        setUsers((prev) => {
          // Avoid redundant setState
          const same =
            prev.length === mapped.length &&
            prev.every((p, i) => p.id === mapped[i].id);
          return same ? prev : mapped;
        });
        return true;
      }
      return false;
    }

    async function fetchAttendeeUsers() {
      const ids = Array.isArray(attendees) ? attendees : [];
      if (!ids.length) {
        setUsers((prev) => (prev.length ? [] : prev));
        return;
      }
      try {
        const map = await ensureSnippets(ids);
        const mapped = ids
          .map((uid) => map.get(uid))
          .filter(Boolean)
          .map((s) => ({
            id: s.uid,
            profileImage: s.photoURL || null,
            avatarURL: null,
            displayName: s.name || 'User',
          }));
        setUsers((prev) => {
          const same =
            prev.length === mapped.length &&
            prev.every((p, i) => p.id === mapped[i].id);
          return same ? prev : mapped;
        });
      } catch (err) {
        console.error(
          '[AttendeeBubbleRow] Error fetching attendee users:',
          err
        );
        setUsers([]);
      }
    }

    hydrateFromSnippets().then((usedSnippets) => {
      if (!usedSnippets) fetchAttendeeUsers();
    });
  }, [attendeesKey, snippetsKey]);

  const totalCount =
    typeof countOverride === 'number' && countOverride >= 0
      ? countOverride
      : users.length;

  if (!totalCount) {
    return (
      <View style={styles.bubbleRowEmpty} accessibilityLabel='No attendees yet'>
        <Text style={styles.emptyText}>No attendees yet</Text>
      </View>
    );
  }

  // Description: Only show up to 3 avatars, overlapped
  const displayedUsers = users.slice(0, 3);

  return (
    <View
      style={styles.bubbleRow}
      accessibilityRole='image'
      accessibilityLabel={'Attending users'}
    >
      <View style={styles.avatarStack}>
        {displayedUsers.map((user, index) => (
          <Image
            key={user.id || index}
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
  emptyText: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
  },
});

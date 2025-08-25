// src/components/profile/EventTimelineList.js

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PostCard from '../PostCard';
import { track as trackClient } from '../../lib/analytics';

export default function EventTimelineList({ events = [] }) {
  if (!events.length) {
    return (
      <Text style={styles.emptyText}>
        You haven’t joined or created any events yet.
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Event Timeline</Text>
      {events.map((event) => (
        <PostCard
          key={event.id}
          event={event}
          onPress={() =>
            trackClient('timeline_event_open', { event_id: event.id })
          }
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 10 },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 10,
  },
});

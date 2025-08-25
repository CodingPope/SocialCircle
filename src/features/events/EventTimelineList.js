import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PostCard from '../events/PostCard';

export default function EventTimelineList({ events = [] }) {
  return (
    <View>
      {events.map((event) => (
        <PostCard key={event.id} event={event} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // ...existing code...
});

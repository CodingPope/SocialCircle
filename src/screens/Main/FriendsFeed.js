// src/screens/Main/FeedScreen.js
import React from 'react';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

const mockEvents = [
  { id: 'e1', title: 'Coffee Meetup', description: 'Meet at local cafe' },
  { id: 'e2', title: 'Concert Night', description: 'Live music at the park' },
];

export default function FriendsFeed({ navigation }) {
  return (
    <View style={styles.container}>
      <FlatList
        data={mockEvents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() =>
              navigation.navigate('EventDetail', { eventId: item.id })
            }
          >
            <Text style={styles.eventTitle}>{item.title}</Text>
            <Text>{item.description}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  eventTitle: { fontSize: 18, fontWeight: 'bold', marginVertical: 10 },
});

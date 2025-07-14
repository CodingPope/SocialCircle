import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

const EventListView = ({ events, onEventPress }) => {
  return (
    <View style={styles.container}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.eventItem}
            onPress={() => onEventPress(item)}
          >
            <Text style={styles.eventTitle}>{item.title}</Text>
            <Text style={styles.eventDetails}>{item.details}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 10,
  },
  eventItem: {
    padding: 15,
    marginVertical: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  eventDetails: {
    fontSize: 14,
    color: '#555',
  },
});

export default EventListView;

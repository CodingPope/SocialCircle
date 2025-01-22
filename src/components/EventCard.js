import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

export default function EventCard({ title, details }) {
  return (
    <View style={styles.eventCard}>
      <View style={styles.eventImagePlaceholder} />
      <View style={{ flex: 1 }}>
        <Text style={styles.eventTitle}>{title}</Text>
        <Text style={styles.eventDetails}>{details}</Text>
      </View>
      <View>
        <TouchableOpacity style={styles.hamburgerButton}>
          <Icon name='share-outline' size={20} color='#000' />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eventCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  eventImagePlaceholder: {
    width: 50,
    height: 50,
    backgroundColor: '#ddd',
    borderRadius: 8,
    marginRight: 12,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  eventDetails: {
    fontSize: 13,
    color: '#555',
  },
});

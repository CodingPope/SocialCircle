import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';

const EventListView = ({ events, onEventPress }) => {
  const renderEventItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onEventPress({ ...item, imageUrl: item.imageUrl })}
    >
      {item.imageUrl ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.image}
          resizeMode='cover'
        />
      ) : (
        <View style={styles.noImageContainer}>
          <View style={styles.userInfoContainer}>
            {item.user && (
              <Image
                source={{
                  uri:
                    item.user.profilePicture ||
                    'https://placehold.co/60x40/orange/white',
                }}
                style={styles.userImage}
              />
            )}
          </View>
          <View style={styles.eventDetailsContainer}>
            <Text style={styles.title}>{item.title || 'Untitled Event'}</Text>
            {item.category && (
              <Text style={styles.categoryTag}>{item.category}</Text>
            )}
            <Text style={styles.address}>
              {item.location?.address || 'Address not available'}
            </Text>
            <TouchableOpacity style={styles.joinButton}>
              <Text style={styles.joinButtonText}>Join</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.containerWithPadding}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={renderEventItem}
        contentContainerStyle={styles.listContainer}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  containerWithPadding: {
    backgroundColor: '#f8f8f8',
    paddingTop: 90, // Adjust padding for dynamic island
  },
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  listContainer: {
    padding: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 5,
  },
  image: {
    width: '100%',
    height: 150,
  },
  noImageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  userInfoContainer: {
    marginRight: 10,
  },
  eventDetailsContainer: {
    flex: 1,
  },
  joinButton: {
    marginTop: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#007BFF',
    borderRadius: 5,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  categoryTag: {
    fontSize: 14,
    color: '#007BFF',
    fontWeight: 'bold',
    marginBottom: 5,
  },
  description: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
  },
  address: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
  },
  interested: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
  },
  going: {
    fontSize: 14,
    color: '#555',
  },
});

export default EventListView;

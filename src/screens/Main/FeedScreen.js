import React from 'react';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import EventCard from '../../components/EventCard';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';

const mockEvents = [
  { id: 'e1', title: 'Coffee Meetup', description: 'Meet at local cafe' },
  { id: 'e2', title: 'Concert Night', description: 'Live music at the park' },
];
const Tab = createMaterialTopTabNavigator();

function Notifications() {
  return (
    <View style={styles.header}>
      <Text>'Hello world'</Text>
    </View>
  );
}

function FeedScreen({ navigation }) {
  return (
    <View>
      <Text>
        This page will have events you're currently a part of {'\n'}
        and Notifications
      </Text>
      <FlatList
        data={mockEvents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() =>
              navigation.navigate('EventDetail', { eventId: item.id })
            }
          >
            <EventCard title={item.title} details={item.details} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

export default function ExplorePage({ navigation }) {
  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <Tab.Navigator
          screenOptions={{
            tabBarLabelStyle: { fontSize: 14, fontWeight: '600' },
            tabBarIndicatorStyle: { backgroundColor: 'black' },
            tabBarStyle: { backgroundColor: '#f0f0f0' },
          }}
        >
          <Tab.Screen name='FeedScreen' component={FeedScreen} />
          {/* <Tab.Screen name='Notifications' component={Notifications} /> */}
        </Tab.Navigator>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  eventTitle: { fontSize: 18, fontWeight: 'bold', marginVertical: 10 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    marginHorizontal: 6,
    paddingTop: 30,
    backgroundColor: 'white',
    elevation: 2, // Shadow effect on Android
    marginTop: 25, // Optional: push it down a bit on iOS
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  body: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 30,
    flex: 1,
    backgroundColor: 'white',
    elevation: 2, // Shadow effect on Android
    marginTop: 25, // Optional: push it down a bit on iOS
  },
});

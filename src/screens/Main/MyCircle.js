import React from 'react';
import { View, Text, ScrollView } from 'react-native';

// Description: Stub components for each feed section
function HostingEvents() {
  // TODO: Fetch and display events the user is hosting
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ fontWeight: 'bold', fontSize: 18 }}>Hosting</Text>
      <Text style={{ color: '#888', marginTop: 8 }}>
        You aren't hosting any events yet.
      </Text>
    </View>
  );
}

function AttendingEvents() {
  // TODO: Fetch and display events the user is attending
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ fontWeight: 'bold', fontSize: 18 }}>Attending</Text>
      <Text style={{ color: '#888', marginTop: 8 }}>
        You haven't joined any events yet.
      </Text>
    </View>
  );
}

function FriendsEvents() {
  // TODO: Fetch and display events users in the 'friends' array are attending
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ fontWeight: 'bold', fontSize: 18 }}>Friends' Events</Text>
      <Text style={{ color: '#888', marginTop: 8 }}>
        Events attended by your friends will show up here.
      </Text>
    </View>
  );
}

export default function MyCircle({ navigation }) {
  // Description: Social feed hub for user's circle and events
  return (
    <ScrollView style={{ flex: 1, padding: 20 }}>
      {/* Description: Page header */}
      <View style={{ alignItems: 'center', marginTop: 30 }}>
        <Text style={{ fontSize: 28, fontWeight: 'bold' }}>My Circle</Text>
        {/* Description: Separator line directly below header */}
        <View
          style={{
            width: '100%',
            height: 1,
            backgroundColor: '#000',
            marginTop: 10,
            marginBottom: 24,
          }}
        />
      </View>
      {/* Description: Modular feed sections */}
      <HostingEvents />
      <AttendingEvents />
      <FriendsEvents />
      {/* TODO: Add recommended events, calendar integration, highlights */}
    </ScrollView>
  );
}

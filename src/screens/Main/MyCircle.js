import React from 'react';
import { View, Text } from 'react-native';
export default function MyCircle({ navigation }) {
  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text>
        This screen should have events that the users friend are attending,
        recommeded events to attend.
      </Text>
    </View>
  );
}

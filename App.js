import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MapScreen from './src/screens/Main/MapScreen';
import FeedScreen from './src/screens/Main/FeedScreen';
import FriendsScreen from './src/screens/Main/FriendsScreen';
import ProfileScreen from './src/screens/Main/ProfileScreen';
import Icon from 'react-native-vector-icons/Ionicons'; // Import the icon library

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen
          name='Map'
          component={MapScreen}
          options={{
            tabBarIcon: ({ focused, color, size }) => (
              <Icon
                name={focused ? 'map' : 'map-outline'}
                color={color}
                size={size}
              />
            ),
            headerShown: false,
          }}
        />
        <Tab.Screen
          name='Feed'
          component={FeedScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Icon name='list-outline' color={color} size={size} />
            ),
            headerShown: false,
          }}
        />
        <Tab.Screen
          name='Friends'
          component={FriendsScreen}
          options={{
            tabBarIcon: ({ focused, color, size }) => (
              <Icon
                name={focused ? 'people' : 'people-outline'}
                color={color}
                size={size}
              />
            ),
          }}
        />
        <Tab.Screen
          name='Profile'
          component={ProfileScreen}
          options={{
            tabBarIcon: ({ focused, color, size }) => (
              <Icon
                name={focused ? 'person' : 'person-outline'}
                color={color}
                size={size}
              />
            ),
            headerShown: false,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

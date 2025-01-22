// src/App.js or wherever your navigator is defined
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SignInScreen from '../screens/Auth/SignInScreen';
import SignUpScreen from '../screens/Auth/SignUpScreen';
import MapScreen from '../screens/Main/MapScreen';
import FeedScreen from '../screens/Main/FeedScreen';
import EventDetailScreen from '../screens/Main/EventDetailScreen';
import ProfileScreen from '../screens/Main/ProfileScreen';
import CreateEventScreen from '../screens/CreateEventScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: '#f0f0f0', // Change this to your desired color
          },
          headerTintColor: '#000', // Change the color of the header text
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        {/* Auth screens */}
        {/* <Stack.Screen name='SignIn' component={SignInScreen} />
        <Stack.Screen name='SignUp' component={SignUpScreen} /> */}

        {/* Main screens (logged in) */}
        <Stack.Screen name='Map' component={MapScreen} />
        <Stack.Screen name='Feed' component={FeedScreen} />
        <Stack.Screen name='EventDetail' component={EventDetailScreen} />
        <Stack.Screen name='Profile' component={ProfileScreen} />
        <Stack.Screen name='CreateEvent' component={CreateEventScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

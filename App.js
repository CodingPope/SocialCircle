import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from './src/context/AuthContext';
import MapScreen from './src/screens/Main/MapScreen';
import FeedScreen from './src/screens/Main/FeedScreen';
import FriendsScreen from './src/screens/Main/FriendsScreen';
import ProfileScreen from './src/screens/Main/ProfileScreen';
import LoginScreen from './src/screens/Auth/LoginScreen';
import InterestScreen from './src/screens/Auth/InterestScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const MainTabs = () => (
  <Tab.Navigator>
    <Tab.Screen
      name='Map'
      component={MapScreen}
      options={{
        tabBarIcon: ({ focused, color, size }) => (
          <Icon name={focused ? 'map' : 'map-outline'} color={color} size={size} />
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
          <Icon name={focused ? 'people' : 'people-outline'} color={color} size={size} />
        ),
      }}
    />
    <Tab.Screen
      name='Profile'
      component={ProfileScreen}
      options={{
        tabBarIcon: ({ focused, color, size }) => (
          <Icon name={focused ? 'person' : 'person-outline'} color={color} size={size} />
        ),
        headerShown: false,
      }}
    />
  </Tab.Navigator>
);

export default function App() {
  const { user } = useAuth();

  return (
    <NavigationContainer>
      {user ? (
        <MainTabs />
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name='Login' component={LoginScreen} />
          <Stack.Screen name='Interests' component={InterestScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

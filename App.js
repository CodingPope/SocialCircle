import React, { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from './src/context/AuthContext';
import { db } from './src/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import MapScreen from './src/screens/Main/MapScreen';
import FeedScreen from './src/screens/Main/FeedScreen';
import FriendsScreen from './src/screens/Main/FriendsScreen';
import ProfileScreen from './src/screens/Main/ProfileScreen';
import AuthScreen from './src/screens/Auth/AuthScreen';
import NameDobScreen from './src/screens/Auth/Onboarding/NameDobScreen';
import LocationScreen from './src/screens/Auth/Onboarding/LocationScreen';
import InterestsScreen from './src/screens/Auth/Onboarding/InterestsScreen';
import SexScreen from './src/screens/Auth/Onboarding/SexScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const MainTabs = () => (
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
);

const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name='Auth' component={AuthScreen} />
  </Stack.Navigator>
);

const OnboardingStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name='NameDob' component={NameDobScreen} />
    <Stack.Screen name='Sex' component={SexScreen} />
    <Stack.Screen name='Location' component={LocationScreen} />
    <Stack.Screen name='Interests' component={InterestsScreen} />
  </Stack.Navigator>
);

export default function App() {
  const { user } = useAuth();
  const [profileComplete, setProfileComplete] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          const isOnboarded =
            data.firstName &&
            data.lastName &&
            data.dob &&
            data.sex &&
            Array.isArray(data.interests) &&
            data.interests.length > 0 &&
            data.location?.latitude != null &&
            data.location?.longitude != null;
          setProfileComplete(isOnboarded);
        } else {
          setProfileComplete(false);
        }
      }
      setChecking(false);
    };
    check();
  }, [user]);

  if (checking) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  }

  return (
    <NavigationContainer>
      {!user && <AuthStack />}
      {user && (profileComplete ? <MainTabs /> : <OnboardingStack />)}
    </NavigationContainer>
  );
}

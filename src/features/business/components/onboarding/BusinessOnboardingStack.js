// Description: Stack navigator for business onboarding steps
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  Step0ChooseType,
  Step1Basics,
  Step2Brand,
  Step3Location,
  Step4Audience,
  Step5Verify,
  Step8Review,
} from './screens';

const Stack = createNativeStackNavigator();

export default function BusinessOnboardingStack() {
  return (
    <Stack.Navigator
      // Enable header to show native back button on top-left
      screenOptions={{ headerShown: true, headerBackTitle: 'Back' }}
      initialRouteName='Step0'
    >
      <Stack.Screen
        name='Step0'
        component={Step0ChooseType}
        options={{ title: 'Business Type' }}
      />
      <Stack.Screen
        name='Step1'
        component={Step1Basics}
        options={{ title: 'Business Basics' }}
      />
      <Stack.Screen
        name='Step2'
        component={Step2Brand}
        options={{ title: 'Brand Assets' }}
      />
      <Stack.Screen
        name='Step3'
        component={Step3Location}
        options={{ title: 'Locations' }}
      />
      {/* Step4 kept exported but not used; interests are handled in Step1 now */}
      {/* <Stack.Screen name='Step4' component={Step4Audience} /> */}
      <Stack.Screen
        name='Step5'
        component={Step5Verify}
        options={{ title: 'Verification' }}
      />
      {/* Removed team and privacy steps */}
      <Stack.Screen
        name='Step8'
        component={Step8Review}
        options={{ title: 'Review' }}
      />
    </Stack.Navigator>
  );
}

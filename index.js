import 'react-native-get-random-values';
// Import tslib to provide TypeScript runtime helpers including __extends
import 'tslib';

// Description: Initialize Firebase app before any other Firebase imports
import '@react-native-firebase/app';

import { registerRootComponent } from 'expo';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import App from './App';

const Root = () => (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <App />
  </GestureHandlerRootView>
);

registerRootComponent(Root);

import { Platform } from 'react-native';
import logger from '../../../lib/logger';

// Safely load @env values (works in Expo / native)
let USE_FIREBASE_EMULATORS = '0';
let FIREBASE_EMULATOR_HOST = '';
let FORCE_FIREBASE_APPCHECK_DEBUG = '0';
let DISABLE_FIREBASE_APPCHECK =
  typeof __DEV__ !== 'undefined' && __DEV__ ? '1' : '0';

try {
  const envVars = require('@env');
  if (envVars?.USE_FIREBASE_EMULATORS) {
    USE_FIREBASE_EMULATORS = envVars.USE_FIREBASE_EMULATORS;
  }
  if (envVars?.FIREBASE_EMULATOR_HOST) {
    FIREBASE_EMULATOR_HOST = envVars.FIREBASE_EMULATOR_HOST;
  }
  if (envVars?.FORCE_FIREBASE_APPCHECK_DEBUG) {
    FORCE_FIREBASE_APPCHECK_DEBUG = envVars.FORCE_FIREBASE_APPCHECK_DEBUG;
  }
  if (envVars?.DISABLE_FIREBASE_APPCHECK) {
    DISABLE_FIREBASE_APPCHECK = envVars.DISABLE_FIREBASE_APPCHECK;
  }
  logger?.debug?.('[Firebase] Environment variables loaded');
} catch (error) {
  logger?.debug?.('[Firebase] @env not available, using defaults');
}

export const isDevBuild = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
export const APP_CHECK_DISABLED = DISABLE_FIREBASE_APPCHECK === '1';

export const env = {
  USE_FIREBASE_EMULATORS,
  FIREBASE_EMULATOR_HOST,
  FORCE_FIREBASE_APPCHECK_DEBUG,
  DISABLE_FIREBASE_APPCHECK,
  APP_CHECK_DISABLED,
  isDevBuild,
  platform: Platform.OS,
};

export default env;

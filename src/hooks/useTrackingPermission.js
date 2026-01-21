// Description: Hook to request and manage App Tracking Transparency (ATT) permission for iOS
// This implements Apple's Guideline 5.1.2 requirement to use the native ATT framework
// instead of custom tracking consent prompts.
//
// Usage:
//   const { requestPermission, status, canPrompt } = useTrackingPermission();
//
//   // Request permission (shows native iOS ATT prompt)
//   await requestPermission();
//
//   // Check current status
//   if (status === 'granted') {
//     // User granted tracking permission
//   }

import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import logger from '../lib/logger';

let trackingModule = null;
let moduleLoadAttempted = false;

// Description: Lazy load expo-tracking-transparency to avoid crashes when module is not configured
async function getTrackingModule() {
  if (moduleLoadAttempted) return trackingModule;
  moduleLoadAttempted = true;

  try {
    // Only attempt to load on iOS
    if (Platform.OS !== 'ios') {
      logger.debug('[ATT] Tracking transparency only available on iOS');
      return null;
    }

    // Dynamic import to avoid crashes in environments without the module
    const module = require('expo-tracking-transparency');
    trackingModule = module;
    logger.debug('[ATT] Module loaded successfully');
    return module;
  } catch (error) {
    logger.warn('[ATT] Module not available:', error?.message || error);
    trackingModule = null;
    return null;
  }
}

/**
 * Hook to manage App Tracking Transparency permission
 *
 * @returns {Object} ATT permission state and methods
 * @property {string} status - Current permission status: 'undetermined', 'denied', 'granted', 'restricted', 'unavailable'
 * @property {boolean} canPrompt - Whether the native prompt can be shown (only true when status is 'undetermined')
 * @property {Function} requestPermission - Function to request tracking permission (shows native iOS prompt)
 * @property {boolean} loading - Whether permission check is in progress
 */
export default function useTrackingPermission() {
  const [status, setStatus] = useState('undetermined');
  const [loading, setLoading] = useState(true);
  const [canPrompt, setCanPrompt] = useState(false);

  // Description: Check current permission status on mount and when app becomes active
  const checkStatus = useCallback(async () => {
    try {
      const module = await getTrackingModule();

      if (!module) {
        // Module not available (Android, Expo Go, or missing dependency)
        setStatus('unavailable');
        setCanPrompt(false);
        setLoading(false);
        return;
      }

      const { getTrackingPermissionsAsync } = module;
      const result = await getTrackingPermissionsAsync();

      const newStatus = result?.status || 'undetermined';
      setStatus(newStatus);
      setCanPrompt(newStatus === 'undetermined');

      logger.debug('[ATT] Permission status:', newStatus);
    } catch (error) {
      logger.error('[ATT] Failed to check permission status:', {
        code: error?.code,
        message: error?.message,
      });
      setStatus('unavailable');
      setCanPrompt(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Check status on mount
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Description: Request tracking permission - shows native iOS ATT prompt
  // Can only be called once per app install. Returns the user's choice.
  const requestPermission = useCallback(async () => {
    try {
      const module = await getTrackingModule();

      if (!module) {
        logger.warn('[ATT] Cannot request permission - module unavailable');
        return { status: 'unavailable', granted: false };
      }

      const { requestTrackingPermissionsAsync } = module;

      logger.debug('[ATT] Requesting tracking permission (native prompt)');
      const result = await requestTrackingPermissionsAsync();

      const newStatus = result?.status || 'denied';
      setStatus(newStatus);
      setCanPrompt(false); // Can only prompt once

      const granted = newStatus === 'granted';
      logger.debug('[ATT] User response:', newStatus);

      return { status: newStatus, granted };
    } catch (error) {
      logger.error('[ATT] Failed to request permission:', {
        code: error?.code,
        message: error?.message,
      });

      // On error, default to denied
      setStatus('denied');
      setCanPrompt(false);
      return { status: 'denied', granted: false };
    }
  }, []);

  return {
    status,
    canPrompt,
    requestPermission,
    loading,
  };
}

import React, {
  useRef,
  useCallback,
  useMemo,
  useState,
  useEffect,
} from 'react';
import { TouchableOpacity, StyleSheet, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../theme';
import { useAuth } from '../../auth/context/AuthContext';
import { db } from '../../../services/firebase';
import BusinessCreateSheet from './BusinessCreateSheet';

// Description: Floating action button for business mode - appears on Overview and Profile tabs only
export default function BusinessFab() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();
  const bottomSheetRef = useRef(null);

  const [business, setBusiness] = useState(null);
  const [hasAnchor, setHasAnchor] = useState(false);

  const businessId = user?.businessId;

  // Load business data to check for anchors
  useEffect(() => {
    if (!businessId) {
      setBusiness(null);
      setHasAnchor(false);
      return;
    }

    let active = true;

    const unsub = db
      .collection('businesses')
      .doc(businessId)
      .onSnapshot(
        async (snap) => {
          if (!active) return;

          if (snap.exists) {
            const bizData = { id: snap.id, ...snap.data() };
            setBusiness(bizData);

            try {
              // Check if business has at least one location or service area
              const locsSnap = await db
                .collection('businesses')
                .doc(businessId)
                .collection('locations')
                .where('isActive', '==', true)
                .limit(1)
                .get();

              const areasSnap = await db
                .collection('businesses')
                .doc(businessId)
                .collection('serviceAreas')
                .where('isActive', '==', true)
                .limit(1)
                .get();

              if (active) {
                setHasAnchor(!locsSnap.empty || !areasSnap.empty);
              }
            } catch (error) {
              console.error('[BusinessFab] Error checking anchors:', error);
              if (active) {
                setHasAnchor(false);
              }
            }
          } else {
            // Business deleted
            if (active) {
              setBusiness(null);
              setHasAnchor(false);
            }
          }
        },
        (error) => {
          console.error('[BusinessFab] Error loading business:', error);
          if (active) {
            setBusiness(null);
            setHasAnchor(false);
          }
        },
      );

    return () => {
      active = false;
      unsub?.();
    };
  }, [businessId]);

  // Get the currently active tab route name
  const currentRouteName = useNavigationState((state) => {
    if (!state) return null;
    const route = state.routes[state.index];
    // If we're in a tab navigator, get the active tab's route
    if (route?.state) {
      const tabRoute = route.state.routes[route.state.index];
      return tabRoute?.name;
    }
    return route?.name;
  });

  // Only show FAB on Overview and Profile tabs
  const shouldShow =
    currentRouteName === 'BusinessOverview' ||
    currentRouteName === 'BusinessProfile';

  const handlePress = useCallback(() => {
    bottomSheetRef.current?.snapToIndex(0);
  }, []);

  const handleCreateEvent = useCallback(() => {
    navigation.navigate('BusinessEventForm', {
      businessId,
      businessTier: business?.tier || business?.businessTier,
    });
  }, [navigation, businessId, business]);

  const handleCreatePerk = useCallback(() => {
    navigation.navigate('BusinessPerkForm', {
      businessId,
      businessTier: business?.tier || business?.businessTier,
    });
  }, [navigation, businessId, business]);

  const handleCompleteSetup = useCallback(() => {
    // Navigate to business onboarding/setup
    navigation.navigate('BusinessOnboarding');
  }, [navigation]);

  if (!shouldShow) {
    return null;
  }

  return (
    <>
      <View
        style={[styles.container, { bottom: insets.bottom + 80 }]}
        pointerEvents='box-none'
      >
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
          onPress={handlePress}
          activeOpacity={0.8}
        >
          <Ionicons name='add' size={28} color='#FFFFFF' />
        </TouchableOpacity>
      </View>

      <BusinessCreateSheet
        ref={bottomSheetRef}
        businessId={businessId}
        businessTier={business?.tier || business?.businessTier}
        hasAnchor={hasAnchor}
        onSelectEvent={handleCreateEvent}
        onSelectPerk={handleCreatePerk}
        onCompleteSetup={handleCompleteSetup}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    zIndex: 1000,
    pointerEvents: 'box-none',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    ...Platform.select({
      ios: {
        shadowOpacity: 0.3,
      },
      android: {
        elevation: 8,
      },
    }),
  },
});

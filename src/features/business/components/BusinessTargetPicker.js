import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../theme';
import { db } from '../../../services/firebase';

// Description: Reusable picker for selecting business location or service area as event/perk target
export default function BusinessTargetPicker({
  businessId,
  selectedId,
  onSelect,
  onClose,
}) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]);
  const [serviceAreas, setServiceAreas] = useState([]);

  useEffect(() => {
    if (!businessId) {
      setLoading(false);
      return;
    }

    let active = true;

    const loadTargets = async () => {
      try {
        setLoading(true);

        // Load business locations
        const locsSnap = await db
          .collection('businesses')
          .doc(businessId)
          .collection('locations')
          .where('isActive', '==', true)
          .get();

        const locs = locsSnap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            type: 'location',
            coordinates: data?.coordinates || null,
            geohash: data?.geohash || null,
            address: data?.address || null,
            displayName: data?.name || data?.displayName || null,
            raw: data,
          };
        });

        // Load service areas
        const areasSnap = await db
          .collection('businesses')
          .doc(businessId)
          .collection('serviceAreas')
          .where('isActive', '==', true)
          .get();

        const areas = areasSnap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            type: 'serviceArea',
            coordinates: data?.centerPoint || null,
            radiusMiles: data?.radiusMiles || null,
            address: data?.name || null,
            displayName: data?.name || data?.label || null,
            raw: data,
          };
        });

        if (active) {
          setLocations(locs);
          setServiceAreas(areas);
          setLoading(false);
        }
      } catch (error) {
        console.error('[BusinessTargetPicker] Error loading targets:', error);
        if (active) {
          setLoading(false);
        }
      }
    };

    loadTargets();

    return () => {
      active = false;
    };
  }, [businessId]);

  const allTargets = [...locations, ...serviceAreas];

  const renderTarget = ({ item }) => {
    const isSelected = selectedId === item.id;
    const icon = item.type === 'location' ? 'location' : 'navigate-circle';

    return (
      <TouchableOpacity
        style={[
          styles.targetItem,
          {
            backgroundColor: theme.colors.backgroundSecondary,
            borderColor: isSelected
              ? theme.colors.primary
              : theme.colors.border,
            borderWidth: isSelected ? 2 : 1,
          },
        ]}
        onPress={() => onSelect?.(item)}
      >
        <View style={styles.targetIcon}>
          <Ionicons
            name={icon}
            size={24}
            color={
              isSelected ? theme.colors.primary : theme.colors.textSecondary
            }
          />
        </View>
        <View style={styles.targetContent}>
          <Text style={[styles.targetName, { color: theme.colors.text }]}>
            {item.displayName || item.name || 'Unnamed'}
          </Text>
          <Text
            style={[styles.targetType, { color: theme.colors.textSecondary }]}
          >
            {item.type === 'location' ? 'Business Location' : 'Service Area'}
          </Text>
          {item.address && (
            <Text
              style={[
                styles.targetAddress,
                { color: theme.colors.textSecondary },
              ]}
            >
              {item.address}
            </Text>
          )}
        </View>
        {isSelected && (
          <Ionicons
            name='checkmark-circle'
            size={24}
            color={theme.colors.primary}
          />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name='close' size={28} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          Select Target
        </Text>
        <View style={styles.closeButton} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size='large' color={theme.colors.primary} />
          <Text
            style={[styles.loadingText, { color: theme.colors.textSecondary }]}
          >
            Loading targets...
          </Text>
        </View>
      ) : allTargets.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name='location-outline'
            size={64}
            color={theme.colors.textSecondary}
          />
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
            No Targets Available
          </Text>
          <Text
            style={[
              styles.emptySubtitle,
              { color: theme.colors.textSecondary },
            ]}
          >
            Add a business location or service area first
          </Text>
        </View>
      ) : (
        <FlatList
          data={allTargets}
          renderItem={renderTarget}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  listContent: {
    padding: 16,
  },
  targetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  targetIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  targetContent: {
    flex: 1,
  },
  targetName: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  targetType: {
    fontSize: 13,
    marginBottom: 2,
  },
  targetAddress: {
    fontSize: 13,
  },
});

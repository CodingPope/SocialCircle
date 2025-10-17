import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from '@gorhom/bottom-sheet';
import EventPopUpCard from './EventPopUpCard';
import PostCard from './PostCard';
import { getUserById } from '../../profile/services/userService';
import { useUserSnippetStore } from '../../profile/stores/userSnippetStore';
import {
  track as trackClient,
  trackCardClick,
  trackCardImpression,
} from '../../../lib/analytics';
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';

const EventListView = ({ events, onCloseListView }) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [enhancedEvents, setEnhancedEvents] = useState([]);
  const bottomSheetRef = useRef(null);
  const snapPoints = useMemo(() => ['90%'], []);
  const ensureSnippets = useUserSnippetStore((s) => s.ensureSnippets);
  const seenImpressionsRef = useRef(new Set());

  // Description: Deduplicate incoming events by id to prevent double rendering
  const uniqueEvents = useMemo(() => {
    const map = new Map();
    (events || []).forEach((ev) => {
      if (ev && ev.id && !map.has(ev.id)) map.set(ev.id, ev);
    });
    return Array.from(map.values());
  }, [events]);

  // Stable key for dependency to avoid array identity churn
  const uniqueIdsKey = useMemo(
    () => uniqueEvents.map((e) => e.id).join('|'),
    [uniqueEvents]
  );

  const handleEventPress = (event) => {
    // Track card_click before opening popup
    try {
      trackCardClick({
        card_type: 'event',
        card_id: event.id,
        surface: 'discover',
        interest: event?.interest,
        category: event?.category,
      });
    } catch {}
    setSelectedEvent(event);
  };
  const closeModal = () => setSelectedEvent(null);

  // Fire basic impressions when list is computed (approximation without viewport observer)
  useEffect(() => {
    // Only track once per session per id to avoid spamming
    const set = seenImpressionsRef.current;
    enhancedEvents.forEach((ev, idx) => {
      if (!ev?.id || set.has(ev.id)) return;
      set.add(ev.id);
      try {
        trackCardImpression({
          card_type: 'event',
          card_id: ev.id,
          position: idx,
          surface: 'discover',
          feed_type: 'list',
          interest: ev?.interest,
          category: ev?.category,
        });
      } catch {}
    });
  }, [enhancedEvents]);

  // Description: Batch fetch host snippets for all unique ownerIds via shared cache
  const fetchHostSnippets = async () => {
    try {
      const ownerIds = [
        ...new Set(uniqueEvents.map((e) => e?.ownerId).filter(Boolean)),
      ];
      if (!ownerIds.length) {
        setEnhancedEvents(uniqueEvents);
        return;
      }

      const map = await ensureSnippets(ownerIds);

      const enhanced = uniqueEvents.map((event) => {
        const s = map.get(event.ownerId);
        const hostName = s?.name || event.ownerName || 'Unknown Host';
        return {
          ...event,
          hostPhoto: s?.photoURL || null,
          hostRating: typeof s?.rating === 'number' ? s.rating : 0,
          hostName,
        };
      });

      // Final de-duplication by id to prevent doubles in UI
      const finalMap = new Map();
      for (const ev of enhanced) if (ev?.id) finalMap.set(ev.id, ev);
      const next = Array.from(finalMap.values());

      setEnhancedEvents((prev) => {
        if (
          prev.length === next.length &&
          prev.every((p, i) => p.id === next[i].id)
        ) {
          return prev; // avoid unnecessary state update
        }
        return next;
      });
    } catch (err) {
      console.warn('[EventListView] Failed to fetch host snippets:', err);
      setEnhancedEvents(uniqueEvents);
    }
  };

  useEffect(() => {
    fetchHostSnippets();
  }, [uniqueIdsKey]);

  const renderHeader = () => (
    <View style={styles.sheetHeader}>
      <View style={styles.dragBarContainer}>
        <View style={styles.dragBar} />
      </View>
      <Text style={styles.sheetTitle}>List view</Text>
    </View>
  );

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onCloseListView}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior='close'
        />
      )}
      backgroundStyle={styles.bottomSheetBg}
      handleComponent={renderHeader}
    >
      <BottomSheetFlatList
        data={enhancedEvents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        renderItem={({ item, index }) => (
          <PostCard
            event={{
              ...item,
              address: item.address, // Pass address directly
              location: item.location, // Pass location for fallback
              formattedDate: item.formattedDate, // Ensure date is passed
              interest: item.interest, // Pass interest
              attendees: item.attendees, // Pass attendees
            }}
            onPress={() => handleEventPress(item)}
            onJoinPress={() =>
              trackClient('list_join_tap', { event_id: item.id })
            }
            onEllipsisPress={() =>
              trackClient('list_ellipsis_tap', { event_id: item.id })
            }
          />
        )}
      />

      {selectedEvent && (
        <EventPopUpCard
          event={selectedEvent}
          onClose={closeModal}
          onJoin={() => {
            trackClient('popup_join_tap', { event_id: selectedEvent.id });
            closeModal();
          }}
          source='card'
          surface='discover'
        />
      )}
    </BottomSheet>
  );
};

// Description: Create theme-aware styles for EventListView
const createStyles = (theme) =>
  StyleSheet.create({
    bottomSheetBg: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      backgroundColor: theme.colors.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: theme.isDark ? 0.3 : 0.12,
      shadowRadius: 8,
      elevation: 8,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 6,
      backgroundColor: theme.colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      justifyContent: 'center',
    },
    dragBarContainer: {
      position: 'absolute',
      top: 4,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 20,
    },
    dragBar: {
      width: 40,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: theme.isDark ? '#64748B' : '#e0e0e0',
      marginBottom: 4,
    },
    sheetTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginLeft: 12,
      color: theme.colors.text,
      marginTop: 8,
    },
    listContainer: {
      padding: 10,
    },
  });

export default EventListView;

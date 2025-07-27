import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from '@gorhom/bottom-sheet';
import EventPopUpCard from './EventPopUpCard';
import PostCard from './PostCard';
import { db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { getUserById } from '../services/userService';

const EventListView = ({ events, onCloseListView }) => {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [enhancedEvents, setEnhancedEvents] = useState([]);
  const bottomSheetRef = useRef(null);
  const snapPoints = useMemo(() => ['93%', '50%'], []);

  const handleEventPress = (event) => setSelectedEvent(event);
  const closeModal = () => setSelectedEvent(null);

  const fetchHostPhotosAndRatings = async () => {
    const updated = await Promise.all(
      events.map(async (event) => {
        if (!event.ownerId)
          return {
            ...event,
            hostPhoto: null,
            hostRating: 0,
            hostName: 'Unknown Host',
          };

        const userData = await getUserById(event.ownerId);

        return {
          ...event,
          hostPhoto: userData?.profileImage || userData?.avatarURL || null,
          hostRating: userData?.rating || 0,
          hostName:
            userData?.displayName ||
            userData?.username ||
            userData?.name || // ✅ added
            userData?.fullName || // ✅ added
            `${userData?.firstName || ''} ${userData?.lastName || ''}`.trim() || // ✅ added
            event.ownerName || // ✅ fallback if event already stores host name
            'Unknown Host',
        };
      })
    );
    setEnhancedEvents(updated);
  };

  useEffect(() => {
    fetchHostPhotosAndRatings();
  }, [events]);

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
        renderItem={({ item }) =>
          item.imageUrl ? (
            <PostCard
              event={item}
              onPress={() => handleEventPress(item)}
              onJoinPress={() => console.log('Join event logic')}
            />
          ) : (
            <PostCard
              event={item}
              onPress={() => handleEventPress(item)}
              onJoinPress={() => console.log('Join event logic')}
              onEllipsisPress={() => console.log('Ellipsis logic')}
            />
          )
        }
      />

      {selectedEvent && (
        <EventPopUpCard
          event={selectedEvent}
          onClose={closeModal}
          onJoin={() => {
            console.log('Join event logic here');
            closeModal();
          }}
        />
      )}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  bottomSheetBg: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: '#fff',
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
    backgroundColor: '#e0e0e0',
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
    color: '#222',
    marginTop: 8,
  },
  listContainer: {
    padding: 10,
  },
});

export default EventListView;

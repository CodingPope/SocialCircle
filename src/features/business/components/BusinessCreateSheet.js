import React, { forwardRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../theme';
import { getBusinessCapabilities } from '../../../lib/business/businessCapabilities';

// Description: Bottom sheet launcher for creating business events or perks
const BusinessCreateSheet = forwardRef(
  (
    {
      businessId,
      businessTier,
      hasAnchor,
      onSelectEvent,
      onSelectPerk,
      onCompleteSetup,
    },
    ref,
  ) => {
    const theme = useTheme();
    const snapPoints = useMemo(() => ['35%'], []);

    const capabilities = useMemo(
      () => getBusinessCapabilities(businessTier || 'TIER_1_FREE'),
      [businessTier],
    );

    const renderBackdrop = useCallback(
      (props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.5}
        />
      ),
      [],
    );

    const handleCreateEvent = useCallback(() => {
      if (!hasAnchor) {
        ref?.current?.close();
        setTimeout(() => onCompleteSetup?.(), 300);
        return;
      }
      ref?.current?.close();
      setTimeout(() => onSelectEvent?.(), 300);
    }, [hasAnchor, onCompleteSetup, onSelectEvent, ref]);

    const handleCreatePerk = useCallback(() => {
      if (!hasAnchor) {
        ref?.current?.close();
        setTimeout(() => onCompleteSetup?.(), 300);
        return;
      }
      ref?.current?.close();
      setTimeout(() => onSelectPerk?.(), 300);
    }, [hasAnchor, onCompleteSetup, onSelectPerk, ref]);

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: theme.colors.card }}
        handleIndicatorStyle={{ backgroundColor: theme.colors.textSecondary }}
      >
        <View
          style={[styles.container, { backgroundColor: theme.colors.card }]}
        >
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {hasAnchor ? 'Create Content' : 'Complete Setup First'}
          </Text>

          {!hasAnchor ? (
            <View style={styles.warningBox}>
              <Ionicons name='warning-outline' size={24} color='#F59E0B' />
              <Text style={[styles.warningText, { color: theme.colors.text }]}>
                Add a business location or service area before creating events
                or perks
              </Text>
              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: theme.colors.primary },
                ]}
                onPress={onCompleteSetup}
              >
                <Ionicons name='location-outline' size={20} color='#FFFFFF' />
                <Text style={styles.buttonText}>Complete Setup</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  styles.option,
                  { borderBottomColor: theme.colors.border },
                ]}
                onPress={handleCreateEvent}
              >
                <View style={styles.optionIcon}>
                  <Ionicons
                    name='calendar-outline'
                    size={24}
                    color={theme.colors.primary}
                  />
                </View>
                <View style={styles.optionContent}>
                  <Text
                    style={[styles.optionTitle, { color: theme.colors.text }]}
                  >
                    Create Event
                  </Text>
                  <Text
                    style={[
                      styles.optionSubtitle,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    Host an in-person gathering
                  </Text>
                </View>
                <Ionicons
                  name='chevron-forward'
                  size={20}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.option,
                  !capabilities.canCreatePerk && styles.optionDisabled,
                ]}
                onPress={capabilities.canCreatePerk ? handleCreatePerk : null}
                disabled={!capabilities.canCreatePerk}
              >
                <View style={styles.optionIcon}>
                  <Ionicons
                    name='gift-outline'
                    size={24}
                    color={
                      capabilities.canCreatePerk
                        ? theme.colors.primary
                        : theme.colors.textSecondary
                    }
                  />
                </View>
                <View style={styles.optionContent}>
                  <Text
                    style={[
                      styles.optionTitle,
                      {
                        color: capabilities.canCreatePerk
                          ? theme.colors.text
                          : theme.colors.textSecondary,
                      },
                    ]}
                  >
                    Create Perk
                  </Text>
                  <Text
                    style={[
                      styles.optionSubtitle,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    {capabilities.canCreatePerk
                      ? 'Offer exclusive deals or rewards'
                      : 'Available on Growth tier and above'}
                  </Text>
                </View>
                {capabilities.canCreatePerk && (
                  <Ionicons
                    name='chevron-forward'
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </BottomSheet>
    );
  },
);

BusinessCreateSheet.displayName = 'BusinessCreateSheet';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  warningBox: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  warningText: {
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 2,
  },
  optionSubtitle: {
    fontSize: 14,
  },
});

export default BusinessCreateSheet;

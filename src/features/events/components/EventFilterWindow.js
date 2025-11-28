import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TouchableWithoutFeedback,
  Animated,
  PanResponder, // Added for swipe gesture
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { db } from '../../../services/firebase/config';
import { collection, getDocs } from '../../../services/firebase/firestoreCompat';
import InterestSelector from '../../profile/components/InterestSelector';
import { trackFilterApplySafe } from '../../../services/analyticsService';
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';

const MAX_RANGE_OFFSET_DAYS = 6; // inclusive; today + 6 = 7-day window

const formatDateForFilter = (dateObj) => {
  if (!(dateObj instanceof Date)) return null;
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseISOToDate = (isoString) => {
  if (!isoString || typeof isoString !== 'string') return null;
  const [year, month, day] = isoString.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const normalizeDateRange = (range) => {
  if (!range) return null;
  const startCandidate = range.start || range.end;
  const endCandidate = range.end || range.start;
  if (!startCandidate && !endCandidate) return null;

  const startDate = parseISOToDate(startCandidate);
  const endDate = parseISOToDate(endCandidate);

  if (!startDate && !endDate) return null;
  if (!startDate) return { start: endCandidate, end: endCandidate };
  if (!endDate) return { start: startCandidate, end: startCandidate };

  if (startDate <= endDate) {
    return {
      start: formatDateForFilter(startDate),
      end: formatDateForFilter(endDate),
    };
  }

  return {
    start: formatDateForFilter(endDate),
    end: formatDateForFilter(startDate),
  };
};

const formatDisplayDate = (iso) => {
  const dateObj = parseISOToDate(iso);
  if (!dateObj) return '--';
  return dateObj.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

const EventFilterWindow = ({
  isVisible,
  onClose,
  onApplyFilters,
  selectedFilters,
  currentUserGender,
  userInterests,
  updateSelectedFilters,
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const initialRange = normalizeDateRange(
    selectedFilters?.dateRange ||
      (selectedFilters?.date
        ? { start: selectedFilters.date, end: selectedFilters.date }
        : null)
  );
  const [selectedRange, setSelectedRange] = useState(initialRange);
  const [selectedInterests, setSelectedInterests] = useState(
    selectedFilters?.interests || userInterests || []
  );
  const [genderOnly, setGenderOnly] = useState(
    selectedFilters?.genderOnly || false
  );
  const [activePicker, setActivePicker] = useState(null);
  const slideAnim = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (isVisible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 500,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible, slideAnim]);

  // Stable memo of selectedFilters primitives
  const filtersKey = useMemo(
    () =>
      JSON.stringify({
        dateRange: selectedFilters?.dateRange || null,
        date: selectedFilters?.date || null,
        interests: (selectedFilters?.interests || []).slice().sort(),
        genderOnly: !!selectedFilters?.genderOnly,
        userInterests: (userInterests || []).slice().sort(),
      }),
    [selectedFilters, userInterests]
  );

  useEffect(() => {
    if (selectedFilters) {
      setSelectedRange(
        normalizeDateRange(
          selectedFilters.dateRange ||
            (selectedFilters.date
              ? { start: selectedFilters.date, end: selectedFilters.date }
              : null)
        )
      );
      setSelectedInterests(selectedFilters.interests || userInterests || []);
      setGenderOnly(selectedFilters.genderOnly || false);
    } else {
      setSelectedRange(null);
      setSelectedInterests(userInterests || []);
      setGenderOnly(false);
    }
    // Only re-run when the stable key changes
  }, [filtersKey]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (e, gestureState) => {
        if (gestureState.dy > 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (e, gestureState) => {
        if (gestureState.dy > 100) {
          onClose();
        } else {
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (!isVisible) return;
    // Live update filters with a slight debounce to avoid excessive re-renders
    const updated = {
      dateRange: selectedRange ? { ...selectedRange } : null,
      date: selectedRange?.start || null,
      interests: selectedInterests,
      genderOnly: genderOnly ? currentUserGender : null,
    };
    const timer = setTimeout(() => {
      try {
        if (typeof updateSelectedFilters === 'function') {
          updateSelectedFilters(updated);
        }
      } catch (e) {
        // no-op
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [
    JSON.stringify(selectedRange || {}),
    JSON.stringify(selectedInterests),
    genderOnly,
    currentUserGender,
    isVisible,
  ]);

  if (!isVisible) return null;

  const handleApplyFilters = () => {
    const updatedFilters = {
      dateRange: selectedRange ? { ...selectedRange } : null,
      date: selectedRange?.start || null,
      interests: selectedInterests,
      genderOnly: genderOnly ? currentUserGender : null,
    };
    onApplyFilters(updatedFilters);
    updateSelectedFilters(updatedFilters);
  };

  const handleClearFilters = () => {
    setSelectedRange(null);
    setSelectedInterests([]);
    setGenderOnly(false);
    setActivePicker(null);
  };

  const handleResetFilters = () => {
    setSelectedRange(null);
    setSelectedInterests(userInterests || []);
    setGenderOnly(false);
    setActivePicker(null);
  };

  const today = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return base;
  }, []);

  const maxSelectableDate = useMemo(() => {
    const limit = new Date(today);
    limit.setDate(today.getDate() + MAX_RANGE_OFFSET_DAYS);
    return limit;
  }, [today]);

  const clampWithinBounds = (dateObj) => {
    if (!(dateObj instanceof Date)) return null;
    const candidate = new Date(dateObj);
    if (candidate < today) return new Date(today);
    if (candidate > maxSelectableDate) return new Date(maxSelectableDate);
    candidate.setHours(0, 0, 0, 0);
    return candidate;
  };

  const handleRangeSelection = (type, dateObj) => {
    const clamped = clampWithinBounds(dateObj);
    if (!clamped) return;
    const isoValue = formatDateForFilter(clamped);
    setSelectedRange((prev) => {
      const next = { ...(prev || {}) };
      if (type === 'start') {
        next.start = isoValue;
        if (!next.end || next.end < isoValue) {
          next.end = isoValue;
        }
      } else {
        next.end = isoValue;
        if (!next.start || next.start > isoValue) {
          next.start = isoValue;
        }
      }
      return next;
    });
  };

  const startDateValue = selectedRange?.start
    ? parseISOToDate(selectedRange.start)
    : new Date(today);
  const endDateValue = selectedRange?.end
    ? parseISOToDate(selectedRange.end)
    : selectedRange?.start
    ? parseISOToDate(selectedRange.start)
    : new Date(today);
  const endMinimumDate = selectedRange?.start
    ? parseISOToDate(selectedRange.start)
    : new Date(today);
  const fallbackEndLabel = formatDisplayDate(
    formatDateForFilter(maxSelectableDate)
  );

  const toggleInterest = (interest) => {
    setSelectedInterests((prevSelected) =>
      prevSelected.includes(interest)
        ? prevSelected.filter((i) => i !== interest)
        : [...prevSelected, interest]
    );
  };

  return (
    <View style={styles.overlay}>
      {/* Backdrop captures outside taps only */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={{
          transform: [{ translateY: slideAnim }],
          ...styles.container,
        }}
      >
        {/* Attach panHandlers ONLY to the drag bar to avoid blocking inner scrolls */}
        <View {...panResponder.panHandlers} style={styles.dragBarContainer}>
          <View style={styles.dragBar} />
        </View>

        {/* Make content scrollable for smaller screens */}
        <ScrollView
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Filter Events</Text>

          <Text style={styles.sectionTitle}>Date Range</Text>
          <View style={styles.dateRangeRow}>
            <TouchableOpacity
              style={[
                styles.dateRangeButton,
                styles.dateRangeButtonStart,
                activePicker === 'start' && styles.dateRangeButtonActive,
              ]}
              onPress={() =>
                setActivePicker((prev) => (prev === 'start' ? null : 'start'))
              }
            >
              <Text style={styles.dateRangeLabel}>Start</Text>
              <Text style={styles.dateRangeValue}>
                {selectedRange?.start
                  ? formatDisplayDate(selectedRange.start)
                  : 'Today'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.dateRangeButton,
                styles.dateRangeButtonEnd,
                activePicker === 'end' && styles.dateRangeButtonActive,
              ]}
              onPress={() =>
                setActivePicker((prev) => (prev === 'end' ? null : 'end'))
              }
            >
              <Text style={styles.dateRangeLabel}>End</Text>
              <Text style={styles.dateRangeValue}>
                {selectedRange?.end
                  ? formatDisplayDate(selectedRange.end)
                  : selectedRange?.start
                  ? formatDisplayDate(selectedRange.start)
                  : fallbackEndLabel}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.dateRangeMetaRow}>
            <Text style={styles.dateRangeHelperText}>
              Within the next 7 days from today.
            </Text>
            {selectedRange && (
              <TouchableOpacity
                onPress={() => {
                  setSelectedRange(null);
                  setActivePicker(null);
                }}
                style={styles.clearDateRangeButton}
              >
                <Text style={styles.clearDateRangeText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          {activePicker && (
            <View style={styles.datePickerContainer}>
              <DateTimePicker
                value={
                  activePicker === 'start'
                    ? startDateValue
                    : endDateValue || startDateValue
                }
                mode='date'
                display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                minimumDate={
                  activePicker === 'start'
                    ? new Date(today)
                    : endMinimumDate || new Date(today)
                }
                maximumDate={maxSelectableDate}
                onChange={(event, date) => {
                  if (event?.type === 'dismissed') {
                    setActivePicker(null);
                    return;
                  }
                  if (date) {
                    handleRangeSelection(activePicker, date);
                  }
                  if (Platform.OS !== 'ios') {
                    setActivePicker(null);
                  }
                }}
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={styles.datePickerDoneButton}
                  onPress={() => setActivePicker(null)}
                >
                  <Text style={styles.datePickerDoneText}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <Text style={styles.sectionTitle}>Interests</Text>
          <InterestSelector
            selectedInterests={selectedInterests}
            toggleInterest={toggleInterest}
          />

          <Text style={styles.sectionTitle}>Privacy</Text>
          <TouchableOpacity
            style={[
              styles.genderFilterButton,
              genderOnly && styles.genderFilterButtonActive,
            ]}
            onPress={() => setGenderOnly((prev) => !prev)}
          >
            <Text
              style={{
                color: genderOnly ? '#fff' : theme.colors.text,
                fontWeight: 'bold',
              }}
            >
              {currentUserGender === 'male'
                ? 'Male Only'
                : currentUserGender === 'female'
                ? 'Women Only'
                : 'Non-Binary Only'}
            </Text>
          </TouchableOpacity>

          <View style={styles.filterButtonsContainer}>
            <TouchableOpacity
              style={styles.clearFilterButton}
              onPress={handleClearFilters}
            >
              <Text style={styles.clearButtonText}>Clear Filters</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={handleResetFilters}
            >
              <Text style={styles.resetButtonText}>Reset Filters</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.applyButton}
            onPress={() => {
              trackFilterApplySafe({
                interestsCount: (selectedInterests || []).length,
                genderOnly,
              }).catch(() => {});
              handleApplyFilters();
            }}
          >
            <Text style={styles.applyButtonText}>Apply Filters</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </View>
  );
};

// Description: Create theme-aware styles for EventFilterWindow
const createStyles = (theme) =>
  StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.isDark
        ? 'rgba(0, 0, 0, 0.7)'
        : 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
      zIndex: 90,
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    container: {
      padding: 20,
      backgroundColor: theme.colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: theme.isDark ? 0.4 : 0.1,
      shadowRadius: 4,
      width: '100%',
      elevation: 5,
      zIndex: 11,
      maxHeight: '85%',
    },
    contentContainer: {
      paddingBottom: 24,
    },
    title: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 10,
      color: theme.colors.text,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      marginVertical: 10,
      color: theme.colors.text,
    },
    dateRangeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    dateRangeButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: theme.colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    dateRangeButtonStart: {
      marginRight: 8,
    },
    dateRangeButtonEnd: {
      marginLeft: 8,
    },
    dateRangeButtonActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.isDark ? 'rgba(59,130,246,0.15)' : '#E8F0FF',
    },
    dateRangeLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    dateRangeValue: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
    },
    dateRangeMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      marginBottom: 16,
    },
    dateRangeHelperText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    clearDateRangeButton: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 12,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    clearDateRangeText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.primary,
      textTransform: 'uppercase',
    },
    datePickerContainer: {
      marginBottom: 16,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: theme.colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    datePickerDoneButton: {
      paddingVertical: 10,
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      backgroundColor: theme.colors.card,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    datePickerDoneText: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.primary,
    },
    searchBoxContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 6,
      paddingHorizontal: 10,
      marginBottom: 10,
      backgroundColor: theme.colors.card,
    },
    searchBox: {
      flex: 1,
      paddingVertical: 8,
      color: theme.colors.text,
    },
    clearButton: {
      padding: 10,
      borderRadius: 8,
      alignItems: 'center',
    },
    clearButtonText: {
      color: theme.colors.text,
      fontWeight: 'bold',
    },
    filterButtonsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    clearFilterButton: {
      flex: 1,
      padding: 10,
      borderRadius: 8,
      backgroundColor: theme.colors.backgroundSecondary,
      alignItems: 'center',
      marginRight: 10,
    },
    resetButton: {
      flex: 1,
      padding: 10,
      borderRadius: 8,
      backgroundColor: theme.colors.backgroundSecondary,
      alignItems: 'center',
    },
    resetButtonText: {
      color: theme.colors.text,
      fontWeight: 'bold',
    },
    interestSelector: { maxHeight: 200, marginBottom: 20 },
    interestItem: {
      padding: 10,
      borderRadius: 8,
      marginBottom: 10,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    selectedInterest: { backgroundColor: theme.colors.primary },
    genderFilterButton: {
      padding: 10,
      borderRadius: 8,
      marginBottom: 20,
      backgroundColor: theme.colors.backgroundSecondary,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    genderFilterButtonActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    applyButton: {
      marginTop: 20,
      padding: 15,
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
      alignItems: 'center',
    },
    applyButtonText: { color: '#fff', fontWeight: 'bold' },
    dragBarContainer: {
      alignItems: 'center',
      marginBottom: 10,
      paddingTop: 6,
      paddingBottom: 6,
    },
    dragBar: {
      width: 40,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: theme.isDark ? '#64748B' : '#e0e0e0',
    },
  });

export default EventFilterWindow;

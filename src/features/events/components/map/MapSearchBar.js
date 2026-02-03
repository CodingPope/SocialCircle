/**
 * MapSearchBar - Google Places autocomplete search for map
 * Extracted from MapScreen for better organization
 */
import React, { forwardRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { Ionicons } from '@expo/vector-icons';
import { GOOGLE_MAPS_API_KEY } from '@env';

const MapSearchBar = forwardRef(function MapSearchBar(
  {
    onPlaceSelect,
    onFocus,
    onBlur,
    theme,
    topInset = 0,
    placeholder = 'Search location...',
  },
  ref,
) {
  const styles = createStyles(theme);

  return (
    <View style={[styles.container, { top: topInset + 10 }]}>
      <GooglePlacesAutocomplete
        ref={ref}
        placeholder={placeholder}
        onPress={(data, details = null) => {
          if (details?.geometry?.location) {
            onPlaceSelect?.({
              data,
              details,
              coords: {
                latitude: details.geometry.location.lat,
                longitude: details.geometry.location.lng,
              },
            });
          }
        }}
        fetchDetails
        query={{
          key: GOOGLE_MAPS_API_KEY,
          language: 'en',
        }}
        textInputProps={{
          placeholderTextColor: theme.colors.textSecondary,
          onFocus,
          onBlur,
        }}
        enablePoweredByContainer={false}
        styles={{
          container: styles.autocompleteContainer,
          textInput: styles.textInput,
          textInputContainer: styles.textInputContainer,
          listView: styles.listView,
          row: styles.row,
          description: styles.description,
          separator: styles.separator,
        }}
        renderLeftButton={() => (
          <View style={styles.searchIcon}>
            <Ionicons
              name='search'
              size={18}
              color={theme.colors.textSecondary}
            />
          </View>
        )}
        renderRightButton={() => null}
        debounce={300}
        minLength={2}
        nearbyPlacesAPI='GooglePlacesSearch'
        keyboardShouldPersistTaps='handled'
      />
    </View>
  );
});

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      left: 16,
      right: 16,
      zIndex: 200,
    },
    autocompleteContainer: {
      flex: 0,
    },
    textInputContainer: {
      backgroundColor: 'transparent',
      flexDirection: 'row',
      alignItems: 'center',
    },
    textInput: {
      height: 44,
      backgroundColor: theme.colors.card,
      borderRadius: 10,
      paddingHorizontal: 36,
      fontSize: 15,
      color: theme.colors.text,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.isDark ? 0.3 : 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    listView: {
      backgroundColor: theme.colors.card,
      borderRadius: 10,
      marginTop: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: theme.isDark ? 0.4 : 0.15,
      shadowRadius: 8,
      elevation: 5,
    },
    row: {
      backgroundColor: theme.colors.card,
      padding: 14,
    },
    description: {
      color: theme.colors.text,
      fontSize: 14,
    },
    separator: {
      backgroundColor: theme.colors.border,
      height: StyleSheet.hairlineWidth,
    },
    searchIcon: {
      position: 'absolute',
      left: 10,
      top: 13,
      zIndex: 1,
    },
  });

export default MapSearchBar;

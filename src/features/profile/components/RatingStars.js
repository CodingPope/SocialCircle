// src/components/profile/RatingStars.js

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function RatingStars({ rating = 0 }) {
  const stars =
    '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));

  return (
    <View style={styles.container}>
      <Text style={styles.stars}>{stars}</Text>
      <Text style={styles.text}>
        ({rating > 0 ? rating.toFixed(1) : 'Not rated'})
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  stars: { color: '#FFD700', fontSize: 14, marginRight: 4 },
  text: { fontSize: 12, color: '#777' },
});

import React from 'react';
import { Image, StyleSheet } from 'react-native';

export default function Avatar({ uri, size = 40 }) {
  return (
    <Image
      source={{ uri }}
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 4 },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: '#ccc',
    borderRadius: 10,
  },
});

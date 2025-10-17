import React, { useMemo, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import fallbackAvatar from '../../../assets/smileDefault.png';

export default function Avatar({ uri, size = 40 }) {
  const [errored, setErrored] = useState(false);

  const source = useMemo(() => {
    if (!uri || errored) return fallbackAvatar;
    return { uri };
  }, [uri, errored]);

  return (
    <Image
      source={source}
      defaultSource={fallbackAvatar}
      onError={() => setErrored(true)}
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

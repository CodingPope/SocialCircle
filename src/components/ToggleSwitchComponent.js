import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';

const ToggleSwitchComponent = ({ label, value, onValueChange }) => {
  return (
    <View style={styles.toggleSwitchContainer}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
};

const styles = StyleSheet.create({
  toggleSwitchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  label: {
    marginRight: 10,
    fontSize: 16,
    color: '#333',
  },
});

export default ToggleSwitchComponent;

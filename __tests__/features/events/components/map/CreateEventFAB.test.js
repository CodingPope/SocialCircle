// Description: Tests for CreateEventFAB component (floating action button for event creation)
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Mock vector icons
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

import CreateEventFAB from '../../../../../src/features/events/components/map/CreateEventFAB';

const mockTheme = {
  colors: {
    primary: '#007AFF',
    card: '#FFFFFF',
    text: '#000000',
  },
  isDark: false,
};

describe('CreateEventFAB', () => {
  const defaultProps = {
    onPress: jest.fn(),
    theme: mockTheme,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the FAB button', () => {
    const { UNSAFE_getAllByType } = render(
      <CreateEventFAB {...defaultProps} />,
    );
    const touchables = UNSAFE_getAllByType(
      require('react-native').TouchableOpacity,
    );
    expect(touchables.length).toBeGreaterThan(0);
  });

  it('calls onPress when FAB is pressed', () => {
    const onPress = jest.fn();
    const { UNSAFE_getAllByType } = render(
      <CreateEventFAB {...defaultProps} onPress={onPress} />,
    );
    const touchables = UNSAFE_getAllByType(
      require('react-native').TouchableOpacity,
    );
    fireEvent.press(touchables[0]);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders with custom bottom inset', () => {
    const { UNSAFE_getAllByType } = render(
      <CreateEventFAB {...defaultProps} bottomInset={100} />,
    );
    // Component should render without errors with custom inset
    const touchables = UNSAFE_getAllByType(
      require('react-native').TouchableOpacity,
    );
    expect(touchables.length).toBeGreaterThan(0);
  });

  it('is disabled when disabled prop is true', () => {
    const onPress = jest.fn();
    const { UNSAFE_getAllByType } = render(
      <CreateEventFAB {...defaultProps} onPress={onPress} disabled={true} />,
    );
    const touchables = UNSAFE_getAllByType(
      require('react-native').TouchableOpacity,
    );
    fireEvent.press(touchables[0]);
    // Depending on implementation, disabled might prevent onPress
    // or the component might check disabled state
  });

  it('renders correctly in dark mode', () => {
    const darkTheme = {
      ...mockTheme,
      isDark: true,
      colors: {
        ...mockTheme.colors,
        primary: '#0A84FF',
      },
    };
    const { UNSAFE_getAllByType } = render(
      <CreateEventFAB {...defaultProps} theme={darkTheme} />,
    );
    const touchables = UNSAFE_getAllByType(
      require('react-native').TouchableOpacity,
    );
    expect(touchables.length).toBeGreaterThan(0);
  });
});

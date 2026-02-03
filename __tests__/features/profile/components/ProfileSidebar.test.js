// Description: Tests for ProfileSidebar component (settings menu with options)
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Animated } from 'react-native';

// Mock dependencies
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }) => children,
}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');

import ProfileSidebar from '../../../../src/features/profile/components/ProfileSidebar';

const mockTheme = {
  colors: {
    card: '#FFFFFF',
    text: '#000000',
    textSecondary: '#666666',
    background: '#F5F5F5',
    backgroundSecondary: '#FAFAFA',
    border: '#E0E0E0',
    primary: '#007AFF',
    overlay: 'rgba(0,0,0,0.5)',
  },
  isDark: false,
};

describe('ProfileSidebar', () => {
  const sidebarAnim = new Animated.Value(0);
  const defaultProps = {
    visible: true,
    sidebarAnim,
    panHandlers: {},
    onClose: jest.fn(),
    mode: 'personal',
    theme: mockTheme,
    themeMode: 'light',
    toggleTheme: jest.fn(),
    hasBusinessProfile: false,
    verified: false,
    onOptionSelect: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when not visible', () => {
    const { toJSON } = render(
      <ProfileSidebar {...defaultProps} visible={false} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders Settings header when visible', () => {
    const { getByText } = render(<ProfileSidebar {...defaultProps} />);
    expect(getByText('Settings')).toBeTruthy();
  });

  it('shows personal mode options', () => {
    const { getByText } = render(<ProfileSidebar {...defaultProps} />);
    expect(getByText('Edit Profile')).toBeTruthy();
    expect(getByText('Manage Interests')).toBeTruthy();
    expect(getByText('Logout')).toBeTruthy();
    expect(getByText('Privacy and Info')).toBeTruthy();
  });

  it('shows business mode options', () => {
    const { getByText, queryByText } = render(
      <ProfileSidebar {...defaultProps} mode='business' />,
    );
    expect(getByText('Switch to personal')).toBeTruthy();
    expect(getByText('Logout')).toBeTruthy();
    expect(getByText('Privacy and Info')).toBeTruthy();
    // Should not show personal-only options
    expect(queryByText('Edit Profile')).toBeNull();
    expect(queryByText('Manage Interests')).toBeNull();
  });

  it('shows Switch to Business when user has business profile', () => {
    const { getByText } = render(
      <ProfileSidebar {...defaultProps} hasBusinessProfile={true} />,
    );
    expect(getByText('Switch to Business')).toBeTruthy();
  });

  it('shows Get Verified when not verified and not business', () => {
    const { getByText } = render(
      <ProfileSidebar {...defaultProps} verified={false} mode='personal' />,
    );
    expect(getByText('Get Verified')).toBeTruthy();
  });

  it('hides Get Verified when already verified', () => {
    const { queryByText } = render(
      <ProfileSidebar {...defaultProps} verified={true} />,
    );
    expect(queryByText('Get Verified')).toBeNull();
  });

  it('hides Get Verified in business mode', () => {
    const { queryByText } = render(
      <ProfileSidebar {...defaultProps} mode='business' verified={false} />,
    );
    expect(queryByText('Get Verified')).toBeNull();
  });

  it('shows Dark Mode toggle', () => {
    const { getByText } = render(<ProfileSidebar {...defaultProps} />);
    expect(getByText('Dark Mode')).toBeTruthy();
  });

  it('calls onClose when backdrop is pressed', () => {
    const onClose = jest.fn();
    const { UNSAFE_getAllByType } = render(
      <ProfileSidebar {...defaultProps} onClose={onClose} />,
    );
    // First TouchableOpacity is the backdrop
    const touchables = UNSAFE_getAllByType(
      require('react-native').TouchableOpacity,
    );
    fireEvent.press(touchables[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onOptionSelect with option name when option is pressed', () => {
    jest.useFakeTimers();
    const onOptionSelect = jest.fn();
    const onClose = jest.fn();
    const { getByText } = render(
      <ProfileSidebar
        {...defaultProps}
        onOptionSelect={onOptionSelect}
        onClose={onClose}
      />,
    );

    fireEvent.press(getByText('Edit Profile'));
    expect(onClose).toHaveBeenCalled();

    // Option select is called after 200ms delay
    jest.advanceTimersByTime(200);
    expect(onOptionSelect).toHaveBeenCalledWith('Edit Profile');

    jest.useRealTimers();
  });

  it('calls toggleTheme when dark mode switch is toggled', () => {
    const toggleTheme = jest.fn();
    const { UNSAFE_getAllByType } = render(
      <ProfileSidebar {...defaultProps} toggleTheme={toggleTheme} />,
    );
    const switches = UNSAFE_getAllByType(require('react-native').Switch);
    expect(switches.length).toBe(1);

    fireEvent(switches[0], 'onValueChange', true);
    expect(toggleTheme).toHaveBeenCalled();
  });

  it('shows Delete Account option in personal mode', () => {
    const { getByText } = render(
      <ProfileSidebar {...defaultProps} mode='personal' />,
    );
    expect(getByText('Delete Account')).toBeTruthy();
  });

  it('hides Delete Account in business mode', () => {
    const { queryByText } = render(
      <ProfileSidebar {...defaultProps} mode='business' />,
    );
    expect(queryByText('Delete Account')).toBeNull();
  });
});

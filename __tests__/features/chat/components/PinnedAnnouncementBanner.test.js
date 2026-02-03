// Description: Tests for PinnedAnnouncementBanner component (pinned message display + editor modal)
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Mock vector icons
jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');

import {
  PinnedBanner,
  PinnedEditorModal,
} from '../../../../src/features/chat/components/PinnedAnnouncementBanner';

const mockTheme = {
  colors: {
    primary: '#007AFF',
    text: '#000000',
    textSecondary: '#666666',
    card: '#FFFFFF',
    background: '#F5F5F5',
    border: '#E0E0E0',
    error: '#FF3B30',
    overlay: 'rgba(0,0,0,0.5)',
  },
  isDark: false,
};

describe('PinnedBanner', () => {
  it('returns null when no pinned text', () => {
    const { toJSON } = render(
      <PinnedBanner pinned={null} onPress={jest.fn()} theme={mockTheme} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('returns null when pinned.text is empty', () => {
    const { toJSON } = render(
      <PinnedBanner
        pinned={{ text: '' }}
        onPress={jest.fn()}
        theme={mockTheme}
      />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders pinned announcement text', () => {
    const { getByText } = render(
      <PinnedBanner
        pinned={{ text: 'Important: Bring snacks!' }}
        onPress={jest.fn()}
        theme={mockTheme}
      />,
    );
    expect(getByText('Pinned Announcement')).toBeTruthy();
    expect(getByText('Important: Bring snacks!')).toBeTruthy();
  });

  it('calls onPress when banner is tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <PinnedBanner
        pinned={{ text: 'Test announcement' }}
        onPress={onPress}
        theme={mockTheme}
      />,
    );
    fireEvent.press(getByText('Test announcement'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when dismiss button is pressed', () => {
    const onDismiss = jest.fn();
    const { UNSAFE_getAllByType } = render(
      <PinnedBanner
        pinned={{ text: 'Dismissable' }}
        onPress={jest.fn()}
        onDismiss={onDismiss}
        theme={mockTheme}
      />,
    );
    // Find the dismiss TouchableOpacity (second one in the component)
    const touchables = UNSAFE_getAllByType(
      require('react-native').TouchableOpacity,
    );
    // The dismiss button is the inner TouchableOpacity
    const dismissButton = touchables[touchables.length - 1];
    fireEvent.press(dismissButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('PinnedEditorModal', () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    onSave: jest.fn(),
    initialText: '',
    theme: mockTheme,
    saving: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Modal component when visible is false (but content may be hidden)', () => {
    const { UNSAFE_getByType } = render(
      <PinnedEditorModal {...defaultProps} visible={false} />,
    );
    // Modal component exists even when not visible
    const Modal = require('react-native').Modal;
    expect(UNSAFE_getByType(Modal)).toBeTruthy();
  });

  it('renders with "Pin Announcement" title when no initial text', () => {
    const { getByText } = render(<PinnedEditorModal {...defaultProps} />);
    expect(getByText('Pin Announcement')).toBeTruthy();
  });

  it('renders with "Edit Announcement" title when has initial text', () => {
    const { getByText } = render(
      <PinnedEditorModal {...defaultProps} initialText='Existing' />,
    );
    expect(getByText('Edit Announcement')).toBeTruthy();
  });

  it('calls onClose when close button is pressed', () => {
    const onClose = jest.fn();
    const { UNSAFE_getAllByType } = render(
      <PinnedEditorModal {...defaultProps} onClose={onClose} />,
    );
    // Find close button (first TouchableOpacity in header)
    const touchables = UNSAFE_getAllByType(
      require('react-native').TouchableOpacity,
    );
    fireEvent.press(touchables[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('updates text input value', () => {
    const { getByPlaceholderText } = render(
      <PinnedEditorModal {...defaultProps} />,
    );
    const input = getByPlaceholderText('Enter your announcement...');
    fireEvent.changeText(input, 'New announcement');
    expect(input.props.value).toBe('New announcement');
  });

  it('shows character count', () => {
    const { getByText, getByPlaceholderText } = render(
      <PinnedEditorModal {...defaultProps} />,
    );
    expect(getByText('0/500 characters')).toBeTruthy();

    const input = getByPlaceholderText('Enter your announcement...');
    fireEvent.changeText(input, 'Hello');
    expect(getByText('5/500 characters')).toBeTruthy();
  });

  it('shows Remove button when editing existing announcement', () => {
    const { getByText } = render(
      <PinnedEditorModal {...defaultProps} initialText='Existing text' />,
    );
    expect(getByText('Remove')).toBeTruthy();
  });

  it('does not show Remove button for new announcement', () => {
    const { queryByText } = render(
      <PinnedEditorModal {...defaultProps} initialText='' />,
    );
    expect(queryByText('Remove')).toBeNull();
  });

  it('disables save button when text unchanged', () => {
    const onSave = jest.fn();
    const { getByText, getByPlaceholderText } = render(
      <PinnedEditorModal
        {...defaultProps}
        onSave={onSave}
        initialText='Original'
      />,
    );
    // Reset to original text
    const input = getByPlaceholderText('Enter your announcement...');
    fireEvent.changeText(input, 'Original');

    // Try to press Update - should be disabled
    // The button text shows "Update" for existing, "Pin" for new
    const updateButton = getByText('Update').parent.parent;
    fireEvent.press(updateButton);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows loading indicator when saving', () => {
    const { UNSAFE_getAllByType } = render(
      <PinnedEditorModal {...defaultProps} saving={true} />,
    );
    const indicators = UNSAFE_getAllByType(
      require('react-native').ActivityIndicator,
    );
    expect(indicators.length).toBeGreaterThan(0);
  });
});

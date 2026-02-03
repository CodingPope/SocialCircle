// Description: Tests for MapTutorialOverlay component (first-time user map tutorial)
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Animated } from 'react-native';

import MapTutorialOverlay from '../../../../../src/features/events/components/map/MapTutorialOverlay';

describe('MapTutorialOverlay', () => {
  const defaultProps = {
    visible: true,
    highlightStyle: {
      top: 100,
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
    },
    tooltipPosition: { top: 170, right: 20, width: 260 },
    copy: {
      title: 'Create Event',
      description: 'Tap here to create a new event and invite friends!',
      cta: 'Got it',
    },
    opacity: new Animated.Value(1),
    onDismiss: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when not visible', () => {
    const { toJSON } = render(
      <MapTutorialOverlay {...defaultProps} visible={false} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders when visible', () => {
    const { getByText } = render(<MapTutorialOverlay {...defaultProps} />);
    expect(getByText('Create Event')).toBeTruthy();
  });

  it('displays the tutorial title from copy prop', () => {
    const { getByText } = render(<MapTutorialOverlay {...defaultProps} />);
    expect(getByText('Create Event')).toBeTruthy();
  });

  it('displays the tutorial description from copy prop', () => {
    const { getByText } = render(<MapTutorialOverlay {...defaultProps} />);
    expect(
      getByText('Tap here to create a new event and invite friends!'),
    ).toBeTruthy();
  });

  it('displays the CTA button text from copy prop', () => {
    const { getByText } = render(<MapTutorialOverlay {...defaultProps} />);
    expect(getByText('Got it')).toBeTruthy();
  });

  it('calls onDismiss when CTA button is pressed', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(
      <MapTutorialOverlay {...defaultProps} onDismiss={onDismiss} />,
    );
    fireEvent.press(getByText('Got it'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders without highlight when highlightStyle is null', () => {
    const { getByText } = render(
      <MapTutorialOverlay {...defaultProps} highlightStyle={null} />,
    );
    expect(getByText('Create Event')).toBeTruthy();
  });

  it('does not render tooltip when copy is null', () => {
    const { queryByText } = render(
      <MapTutorialOverlay {...defaultProps} copy={null} />,
    );
    expect(queryByText('Create Event')).toBeNull();
  });

  it('does not render tooltip when tooltipPosition is null', () => {
    const { queryByText } = render(
      <MapTutorialOverlay {...defaultProps} tooltipPosition={null} />,
    );
    expect(queryByText('Create Event')).toBeNull();
  });

  it('has correct accessibility label on tooltip', () => {
    const { getByLabelText } = render(<MapTutorialOverlay {...defaultProps} />);
    expect(getByLabelText('Create Event tutorial tooltip')).toBeTruthy();
  });

  it('has correct accessibility label on dismiss button', () => {
    const { getByLabelText } = render(<MapTutorialOverlay {...defaultProps} />);
    expect(getByLabelText('Got it, close tutorial')).toBeTruthy();
  });

  it('renders with different copy for filter tutorial', () => {
    const filterCopy = {
      title: 'Filter Events',
      description: 'Use filters to find events that match your interests.',
      cta: 'Next',
    };
    const { getByText } = render(
      <MapTutorialOverlay {...defaultProps} copy={filterCopy} />,
    );
    expect(getByText('Filter Events')).toBeTruthy();
    expect(
      getByText('Use filters to find events that match your interests.'),
    ).toBeTruthy();
    expect(getByText('Next')).toBeTruthy();
  });

  it('uses Animated.View for fade animations', () => {
    const { UNSAFE_getAllByType } = render(
      <MapTutorialOverlay {...defaultProps} />,
    );
    const animatedViews = UNSAFE_getAllByType(Animated.View);
    // Should have backdrop and tooltip as animated views
    expect(animatedViews.length).toBeGreaterThanOrEqual(1);
  });
});

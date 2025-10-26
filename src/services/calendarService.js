// Description: Calendar integration service for adding events to device calendar
import * as Calendar from 'expo-calendar';
import { Platform, Alert } from 'react-native';

/**
 * Request calendar permissions
 * @returns {Promise<boolean>} True if permission granted
 */
export async function requestCalendarPermissions() {
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status === 'granted') {
      return true;
    }

    Alert.alert(
      'Calendar Access Required',
      'Please grant calendar access in Settings to add events to your calendar.',
      [{ text: 'OK' }]
    );
    return false;
  } catch (error) {
    console.error('[calendarService] Permission request failed:', error);
    return false;
  }
}

/**
 * Get the default calendar ID for the device
 * @returns {Promise<string|null>} Calendar ID or null
 */
async function getDefaultCalendarId() {
  try {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    if (defaultCalendar?.id) {
      return defaultCalendar.id;
    }

    // Fallback: get first available calendar
    const calendars = await Calendar.getCalendarsAsync(
      Calendar.EntityTypes.EVENT
    );

    if (calendars && calendars.length > 0) {
      // Prefer writable calendars
      const writableCalendar = calendars.find((cal) => cal.allowsModifications);
      return writableCalendar?.id || calendars[0].id;
    }

    return null;
  } catch (error) {
    console.error('[calendarService] Get calendar ID failed:', error);
    return null;
  }
}

/**
 * Add an event to the device calendar
 * @param {Object} eventDetails - Event details
 * @param {string} eventDetails.title - Event title
 * @param {Date} eventDetails.startDate - Event start date
 * @param {Date} eventDetails.endDate - Event end date
 * @param {string} eventDetails.location - Event location
 * @param {string} eventDetails.description - Event description
 * @param {string} eventDetails.notes - Additional notes
 * @returns {Promise<{success: boolean, eventId?: string, error?: string}>}
 */
export async function addEventToCalendar(eventDetails) {
  try {
    // Request permissions
    const hasPermission = await requestCalendarPermissions();
    if (!hasPermission) {
      return { success: false, error: 'Permission denied' };
    }

    // Get calendar ID
    const calendarId = await getDefaultCalendarId();
    if (!calendarId) {
      Alert.alert(
        'Calendar Not Found',
        'No writable calendar found on your device.'
      );
      return { success: false, error: 'No calendar available' };
    }

    // Prepare event data
    const eventData = {
      title: eventDetails.title || 'Social Circle Event',
      startDate: eventDetails.startDate,
      endDate: eventDetails.endDate,
      location: eventDetails.location || '',
      notes: eventDetails.description || eventDetails.notes || '',
      timeZone: eventDetails.timeZone || 'America/Denver', // Default timezone
      alarms: [
        { relativeOffset: -60 }, // 1 hour before
        { relativeOffset: -1440 }, // 1 day before
      ],
    };

    // Create the calendar event
    const eventId = await Calendar.createEventAsync(calendarId, eventData);

    if (eventId) {
      Alert.alert(
        '✅ Added to Calendar',
        `"${eventDetails.title}" has been added to your calendar with reminders.`
      );
      return { success: true, eventId };
    }

    return { success: false, error: 'Failed to create event' };
  } catch (error) {
    console.error('[calendarService] Add event failed:', error);

    let errorMessage = 'Could not add event to calendar.';
    if (error.message?.includes('permission')) {
      errorMessage = 'Calendar access was denied.';
    } else if (error.message?.includes('calendar')) {
      errorMessage = 'No calendar available to add events.';
    }

    Alert.alert('Calendar Error', errorMessage);
    return { success: false, error: error.message };
  }
}

/**
 * Format a Social Circle event for calendar export
 * @param {Object} event - Social Circle event object
 * @returns {Object} Formatted event details
 */
export function formatEventForCalendar(event) {
  // Parse event date (Firestore timestamp)
  let startDate = new Date();
  if (event?.date?.seconds) {
    startDate = new Date(event.date.seconds * 1000);
  } else if (event?.date instanceof Date) {
    startDate = event.date;
  }

  // Calculate end date (default to 2 hours after start)
  let endDate = new Date(startDate);
  if (event?.endTime?.seconds) {
    endDate = new Date(event.endTime.seconds * 1000);
  } else {
    endDate.setHours(endDate.getHours() + 2);
  }

  // Format location
  let location = '';
  if (event?.location?.address) {
    location = event.location.address;
  } else if (event?.address) {
    location = event.address;
  }

  // Build description with event details
  const descriptionParts = [];
  if (event?.description) {
    descriptionParts.push(event.description);
  }
  if (event?.hostName) {
    descriptionParts.push(`\nHost: ${event.hostName}`);
  }
  if (event?.capacity) {
    const attendeeCount = event?.attendees?.length || 0;
    descriptionParts.push(
      `\nCapacity: ${attendeeCount}/${event.capacity} joined`
    );
  }
  descriptionParts.push(`\nEvent ID: ${event?.id || 'N/A'}`);
  descriptionParts.push('\n📱 Opened via Social Circle');

  return {
    title: event?.title || 'Social Circle Event',
    startDate,
    endDate,
    location,
    description: descriptionParts.join(''),
    notes: event?.notes || '',
  };
}

/**
 * Add a Social Circle event to calendar (convenience function)
 * @param {Object} event - Social Circle event object
 * @returns {Promise<{success: boolean, eventId?: string, error?: string}>}
 */
export async function addSocialCircleEventToCalendar(event) {
  if (!event) {
    Alert.alert('Error', 'No event provided');
    return { success: false, error: 'No event' };
  }

  const formattedEvent = formatEventForCalendar(event);
  return await addEventToCalendar(formattedEvent);
}

// Centralized route name constants to prevent typos and ease refactors

export const ROUTES = Object.freeze({
  // Auth & Onboarding
  AUTH: 'Auth',
  NAME_DOB: 'NameDob',
  SEX: 'Sex',
  TOS: 'TOS',
  LOCATION: 'Location',
  INTERESTS: 'InterestsScreen',

  // Profile stack
  PROFILE: 'Profile',
  OTHER_USER_PROFILE: 'OtherUserProfile',

  // Main tabs
  MAP: 'Map',
  DISCOVERY: 'Discovery',
  MY_CIRCLE: 'MyCircle',
  PROFILE_STACK: 'ProfileStack',
  MAIN_TABS: 'MainTabs',

  // Consumer root stack
  EVENT_CHAT: 'EventChat',
  NOTIFICATIONS: 'Notifications',
  INTEREST_POST: 'InterestPost',
  INTERESTS_MANAGE: 'Interests',
  MANAGE_INTERESTS_SCREEN: 'ManageInterestsScreen',
  ACCOUNT_TYPE: 'AccountType',
  PRIVACY_INFO: 'PrivacyInfo',
  INFO_ARTICLE: 'InfoArticle',
  TOS_ACCEPTANCE: 'TOSAcceptance',
  CONFIRMATION: 'ConfirmationScreen',

  // Business
  BUSINESS_TABS: 'BusinessTabs',
  BUSINESS_ONBOARDING: 'BusinessOnboarding',
  BUSINESS_EVENT_FORM: 'BusinessEventForm',
  BUSINESS_PERK_FORM: 'BusinessPerkForm',
  BUSINESS_SETTINGS: 'BusinessSettings',
  BUSINESS_UPGRADE: 'BusinessUpgrade',
});

export default ROUTES;

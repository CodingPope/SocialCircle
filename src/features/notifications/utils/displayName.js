export default function displayNameFromUser(user = {}) {
  if (!user || typeof user !== 'object') return 'Someone';
  if (typeof user.displayName === 'string' && user.displayName.trim()) {
    return user.displayName.trim();
  }
  if (typeof user.name === 'string' && user.name.trim()) {
    return user.name.trim();
  }
  const first = typeof user.firstName === 'string' ? user.firstName.trim() : '';
  const last = typeof user.lastName === 'string' ? user.lastName.trim() : '';
  const combined = [first, last].filter(Boolean).join(' ');
  return combined || 'Someone';
}

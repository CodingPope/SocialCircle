export const normalizeSex = (value) => {
  const raw = (value || '').toString().trim().toLowerCase();
  if (!raw) return 'unknown';
  if (['male', 'm', 'man'].includes(raw)) return 'male';
  if (['female', 'f', 'woman', 'women'].includes(raw)) return 'female';
  if (['nonbinary', 'non-binary', 'non binary', 'nb'].includes(raw))
    return 'nonbinary';
  return raw;
};

export const eventPassesGenderGate = (event = {}, user = {}) => {
  const privacy = (event?.privacy || 'public').toString().toLowerCase();
  const userSex = normalizeSex(user?.sex || user?.gender);

  // Description: Gender-restricted events are hidden from users who haven't set gender
  if (privacy === 'male-only') return userSex === 'male';
  if (privacy === 'female-only') return userSex === 'female';
  if (privacy === 'nonbinary-only') return userSex === 'nonbinary';
  return true; // public/rsvp/private → everyone sees it
};

// Preset usernames and colors for collaborative sessions
const SAMPLE_NAMES = [
  'Alex', 'Jordan', 'Sam', 'Taylor', 'Chris', 'Morgan', 
  'Casey', 'Robin', 'Riley', 'Dev', 'Avery', 'Jamie'
];

export const PRESET_COLORS = [
  { name: 'Sky Blue', color: '#38bdf8', colorLight: '#38bdf833' },
  { name: 'Green', color: '#10b981', colorLight: '#10b98133' },
  { name: 'Purple', color: '#a855f7', colorLight: '#a855f733' },
  { name: 'Rose', color: '#f43f5e', colorLight: '#f43f5e33' },
  { name: 'Orange', color: '#f59e0b', colorLight: '#f59e0b33' },
  { name: 'Cyan', color: '#06b6d4', colorLight: '#06b6d433' },
  { name: 'Pink', color: '#d946ef', colorLight: '#d946ef33' },
  { name: 'Teal', color: '#14b8a6', colorLight: '#14b8a633' },
];

export function generateRandomUser() {
  const randomName = SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)];
  const randomNum = Math.floor(100 + Math.random() * 900);
  const fullName = `${randomName}_${randomNum}`;
  const colorObj = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];

  return {
    name: fullName,
    color: colorObj.color,
    colorLight: colorObj.colorLight,
    avatar: randomName.substring(0, 2).toUpperCase()
  };
}

const STORAGE_KEY = 'sync_md_session_user';

export function getStoredUser() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.name && parsed.color) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error loading session user:', err);
  }
  
  const defaultUser = generateRandomUser();
  saveStoredUser(defaultUser);
  return defaultUser;
}

export function saveStoredUser(user) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch (err) {
    console.error('Error saving user profile to session:', err);
  }
}

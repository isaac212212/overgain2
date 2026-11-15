export const PROFILE_VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Somente eu' },
  { value: 'following', label: 'Pessoas que eu sigo' },
  { value: 'groups', label: 'Pessoas dos meus grupos' },
  { value: 'public', label: 'Público' }
];

export const DEFAULT_PROFILE_VISIBILITY = {
  measurements: 'private',
  trainingVolume: 'private',
  personalRecords: 'private',
  trainingActivity: 'public'
};

const isValidAudience = value => PROFILE_VISIBILITY_OPTIONS.some(option => option.value === value);

export const getProfileVisibility = (privacy = {}) => {
  const saved = privacy.profileVisibility || {};
  const resolve = (key, fallback) => (
    isValidAudience(saved[key]) ? saved[key] : fallback
  );

  return {
    measurements: resolve('measurements', privacy.publicMeasurements === true ? 'public' : DEFAULT_PROFILE_VISIBILITY.measurements),
    trainingVolume: resolve('trainingVolume', DEFAULT_PROFILE_VISIBILITY.trainingVolume),
    personalRecords: resolve('personalRecords', privacy.publicPRs === true ? 'public' : DEFAULT_PROFILE_VISIBILITY.personalRecords),
    trainingActivity: resolve('trainingActivity', DEFAULT_PROFILE_VISIBILITY.trainingActivity)
  };
};

export const isVisibleToGroup = audience => audience === 'groups' || audience === 'public';

import { createClient } from '@supabase/supabase-js';
import { showToast } from '../contexts/ToastContext';
import { generateId } from '../utils/storage';

// Safe Fallback Auth & Client for Mobile WebViews / APK when Supabase keys are not configured
const fallbackAuth = {
  getSession: async () => ({ data: { session: null }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  signInWithPassword: async () => ({ data: { user: null, session: null }, error: new Error('Nuvem não configurada') }),
  signUp: async () => ({ data: { user: null, session: null }, error: new Error('Nuvem não configurada') }),
  signOut: async () => ({ error: null }),
  getUser: async () => ({ data: { user: null }, error: null }),
  resetPasswordForEmail: async () => ({ data: {}, error: null }),
  updateUser: async () => ({ data: { user: null }, error: null })
};

const fallbackSupabase = {
  auth: fallbackAuth,
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error: null }),
        order: () => Promise.resolve({ data: [], error: null }),
        then: (resolve) => resolve({ data: [], error: null })
      }),
      order: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve) => resolve({ data: [], error: null })
    }),
    upsert: async () => ({ data: null, error: null }),
    delete: () => ({
      eq: async () => ({ data: null, error: null })
    })
  })
};


const cleanSupabaseUrl = (rawUrl) => {
  if (!rawUrl) return '';
  let url = rawUrl.trim();
  return url.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
};

const getSupabaseConfig = () => {
  let envUrl = '';
  let envKey = '';

  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      envUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.REACT_APP_SUPABASE_URL || '';
      envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.REACT_APP_SUPABASE_ANON_KEY || '';
    }
  } catch (e) {
    console.warn('Could not read import.meta.env:', e);
  }

  if (!envUrl && typeof window !== 'undefined' && window.__ENV__) {
    envUrl = window.__ENV__.VITE_SUPABASE_URL || '';
    envKey = window.__ENV__.VITE_SUPABASE_ANON_KEY || '';
  }

  let storedUrl = '';
  let storedKey = '';
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      storedUrl = window.localStorage.getItem('og_supabase_url') || '';
      storedKey = window.localStorage.getItem('og_supabase_anon_key') || '';
    }
  } catch {
    // Ignore storage restrictions
  }

  const rawUrl = envUrl || storedUrl;
  const url = cleanSupabaseUrl(rawUrl);
  const key = (envKey || storedKey).trim();
  const isValidUrl = url.startsWith('http://') || url.startsWith('https://');

  return { url, key, isConfigured: Boolean(isValidUrl && key) };
};

const config = getSupabaseConfig();

let realClient = null;
if (config.isConfigured) {
  try {
    realClient = createClient(config.url, config.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    realClient = null;
  }
}

export const supabase = realClient || fallbackSupabase;

export const isCloudEnabled = () => Boolean(realClient);

export const setSupabaseCredentials = (url, key) => {
  try {
    if (url && key) {
      localStorage.setItem('og_supabase_url', url.trim());
      localStorage.setItem('og_supabase_anon_key', key.trim());
    } else {
      localStorage.removeItem('og_supabase_url');
      localStorage.removeItem('og_supabase_anon_key');
    }
  } catch (e) {
    console.warn('Could not save Supabase credentials:', e);
  }
  window.location.reload();
};

// Helper to safely parse jsonb payload or data
const parseJsonData = (val, defaultValue = null) => {
  if (val === undefined || val === null) return defaultValue;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
};

const syncUserData = async (userId, dataKey, payload) => {
  const { data, error } = await supabase
    .from('user_data')
    .upsert({
      user_id: userId,
      data_key: dataKey,
      payload,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,data_key' })
    .select();

  if (error) throw error;
  return data;
};

const fetchUserData = async (userId, dataKey, defaultValue = null) => {
  const { data, error } = await supabase
    .from('user_data')
    .select('payload')
    .eq('user_id', userId)
    .eq('data_key', dataKey)
    .maybeSingle();

  if (error) throw error;
  return data ? parseJsonData(data.payload, defaultValue) : defaultValue;
};

// ============================================================================
// 1. ROUTINES (TREINOS / ROTINAS)
// ============================================================================
export const syncRoutinesToCloud = async (userId, routines) => {
  if (!supabase || !userId) return null;
  try {
    return await syncUserData(userId, 'routines', routines || []);
  } catch (err) {
    console.error('Erro ao sincronizar rotinas no Supabase:', err);
    showToast('Erro de conexão ao salvar rotinas.', 'error');
    return null;
  }
};

export const fetchCloudRoutines = async (userId) => {
  if (!supabase || !userId) return null;
  try {
    return await fetchUserData(userId, 'routines', null);
  } catch (err) {
    console.error('Erro ao buscar rotinas no Supabase:', err);
    return null;
  }
};

// ============================================================================
// 2. CARDIO ROUTINES
// ============================================================================
export const syncCardioRoutinesToCloud = async (userId, cardioRoutines) => {
  if (!supabase || !userId) return null;
  try {
    return await syncUserData(userId, 'cardio_routines', cardioRoutines || []);
  } catch (err) {
    console.error('Erro ao sincronizar cardios no Supabase:', err);
    showToast('Erro ao salvar cardios na nuvem.', 'error');
    return null;
  }
};

export const fetchCloudCardioRoutines = async (userId) => {
  if (!supabase || !userId) return null;
  try {
    return await fetchUserData(userId, 'cardio_routines', null);
  } catch (err) {
    console.error('Erro ao buscar cardios no Supabase:', err);
    return null;
  }
};

// ============================================================================
// 3. WEEKLY SCHEDULE (CRONOGRAMA SEMANAL)
// ============================================================================
export const syncScheduleToCloud = async (userId, schedule) => {
  if (!supabase || !userId) return null;
  try {
    return await syncUserData(userId, 'schedule', schedule || {});
  } catch (err) {
    console.error('Erro ao sincronizar cronograma no Supabase:', err);
    return null;
  }
};

export const fetchCloudSchedule = async (userId) => {
  if (!supabase || !userId) return null;
  try {
    return await fetchUserData(userId, 'schedule', null);
  } catch (err) {
    console.error('Erro ao buscar cronograma no Supabase:', err);
    return null;
  }
};

// ============================================================================
// 4. CHECK-INS / HISTÓRICO DE TREINOS E CARDIOS
// ============================================================================
export const syncCheckinsToCloud = async (userId, checkins) => {
  if (!supabase || !userId) return null;
  try {
    return await syncUserData(userId, 'checkins', checkins || []);
  } catch (err) {
    console.error('Erro ao sincronizar check-ins no Supabase:', err);
    showToast('Erro ao salvar check-in na nuvem.', 'error');
    return null;
  }
};

export const syncCheckinToCloud = async (checkinData) => {
  if (!supabase || !checkinData || !checkinData.userId) return null;
  try {
    // 1. Fetch current checkins list
    const current = await fetchCloudCheckins(checkinData.userId);
    const exists = current.some(c => c.id === checkinData.id);
    const updated = exists
      ? current.map(c => c.id === checkinData.id ? checkinData : c)
      : [checkinData, ...current];

    return await syncCheckinsToCloud(checkinData.userId, updated);
  } catch (err) {
    console.error('Exceção ao salvar checkin individual no Supabase:', err);
    return null;
  }
};

export const fetchCloudCheckins = async (userId) => {
  if (!supabase || !userId) return [];
  try {
    return await fetchUserData(userId, 'checkins', []);
  } catch (err) {
    console.error('Erro ao buscar checkins no Supabase:', err);
    return null;
  }
};

const createSharedWorkoutPayload = (checkin) => {
  const payload = {
    ...checkin,
    totalVolumeKg: checkin.showWeights === false ? undefined : checkin.totalVolumeKg,
    muscleStats: checkin.showMuscleStats === false
      ? {}
      : checkin.showWeights === false
      ? Object.fromEntries(Object.entries(checkin.muscleStats || {}).map(([muscle, stats]) => {
        const visibleStats = { ...stats };
        delete visibleStats.volume;
        return [muscle, visibleStats];
      }))
      : checkin.muscleStats,
    exercises: (checkin.exercises || []).map(exercise => ({
      ...exercise,
      sets: (exercise.sets || []).filter(set => {
        const weight = set.weight === undefined || set.weight === null || set.weight === '' ? 0 : Number(set.weight);
        const durationSeconds = Number(set.durationSeconds);
        const isTimedSet = Number.isFinite(durationSeconds) && durationSeconds > 0;
        const isStrengthSet = Number.isFinite(weight) && weight >= 0 && Number(set.reps) > 0;
        return set.completed && (isTimedSet || isStrengthSet);
      }).map(set => {
        const visibleSet = { ...set };
          if (checkin.showWeights === false) delete visibleSet.weight;
          if (checkin.sharePRs !== true) {
            delete visibleSet.isPR;
            delete visibleSet.prType;
          }
        return visibleSet;
      })
    }))
  };
  if (typeof payload.photoUrl !== 'string' || payload.photoUrl.startsWith('data:')) {
    delete payload.photoUrl;
  }
  return payload;
};

export const syncPublicWorkoutToCloud = async (checkin, visibility) => {
  if (!supabase || !checkin?.id) return null;
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = sessionData.session?.user?.id;
    if (!userId || String(checkin.userId) !== userId) {
      throw new Error('Não é possível publicar um treino de outra conta.');
    }

    if (visibility !== 'public') {
      const { error } = await supabase
        .from('public_workouts')
        .delete()
        .eq('id', String(checkin.id))
        .eq('user_id', userId);
      if (error) throw error;
      return [];
    }

    const payload = createSharedWorkoutPayload(checkin);
    const { data, error } = await supabase
      .from('public_workouts')
      .upsert({
        id: String(checkin.id),
        user_id: userId,
        payload,
        created_at: checkin.date || new Date().toISOString()
      }, { onConflict: 'id' })
      .select('payload')
      .single();
    if (error) throw error;
    return data?.payload || null;
  } catch (error) {
    console.error('Não foi possível sincronizar o treino público:', error);
    showToast('Não foi possível atualizar a publicação pública do treino.', 'error');
    return null;
  }
};

export const deletePublicWorkoutFromCloud = async (checkinId) => {
  if (!supabase || !checkinId) return null;
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = sessionData.session?.user?.id;
    if (!userId) throw new Error('É necessário entrar para remover um treino público.');
    const { error } = await supabase
      .from('public_workouts')
      .delete()
      .eq('id', String(checkinId))
      .eq('user_id', userId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Não foi possível remover o treino público:', error);
    showToast('Não foi possível remover o treino público da nuvem.', 'error');
    return null;
  }
};

export const fetchPublicWorkouts = async (limit = 20) => {
  if (!supabase || !isCloudEnabled()) return [];
  const { data, error } = await supabase
    .from('public_workouts')
    .select('id,user_id,payload,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = data || [];
  if (!rows.length) return [];
  const workoutIds = rows.map(row => String(row.id));
  const [{ data: likes, error: likesError }, { data: comments, error: commentsError }] = await Promise.all([
    supabase.from('public_workout_likes').select('workout_id,user_id').in('workout_id', workoutIds),
    supabase
      .from('public_workout_comments')
      .select('id,workout_id,user_id,text,created_at')
      .in('workout_id', workoutIds)
      .order('created_at', { ascending: true })
  ]);
  if (likesError) throw likesError;
  if (commentsError) throw commentsError;

  const commentUserIds = [...new Set((comments || []).map(comment => comment.user_id))];
  const { data: profiles, error: profilesError } = commentUserIds.length
    ? await supabase.from('profiles').select('id,name,avatar_url').in('id', commentUserIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;

  const profilesById = new Map((profiles || []).map(profile => [profile.id, profile]));
  const likesByWorkout = new Map();
  (likes || []).forEach(like => {
    const workoutId = String(like.workout_id);
    likesByWorkout.set(workoutId, [...(likesByWorkout.get(workoutId) || []), like.user_id]);
  });
  const commentsByWorkout = new Map();
  (comments || []).forEach(comment => {
    const workoutId = String(comment.workout_id);
    const profile = profilesById.get(comment.user_id);
    commentsByWorkout.set(workoutId, [...(commentsByWorkout.get(workoutId) || []), {
      id: comment.id,
      userId: comment.user_id,
      userName: profile?.name || 'Atleta',
      userAvatar: profile?.avatar_url,
      text: comment.text,
      date: comment.created_at
    }]);
  });

  return rows.map(row => {
    const workoutId = String(row.id);
    const payload = parseJsonData(row.payload, null);
    if (!payload) return null;
    const likedBy = likesByWorkout.get(workoutId) || [];
    return {
      ...payload,
      id: workoutId,
      userId: row.user_id,
      date: payload.date || row.created_at,
      likedBy,
      likes: likedBy.length,
      comments: commentsByWorkout.get(workoutId) || []
    };
  }).filter(Boolean);
};

export const togglePublicWorkoutLike = async (workoutId) => {
  if (!supabase || !isCloudEnabled() || !workoutId) {
    throw new Error('O feed público não está conectado ao Supabase.');
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error('Entre na sua conta para curtir um treino.');

  const normalizedWorkoutId = String(workoutId);
  const { data: existingLike, error: lookupError } = await supabase
    .from('public_workout_likes')
    .select('workout_id')
    .eq('workout_id', normalizedWorkoutId)
    .eq('user_id', userId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existingLike) {
    const { error } = await supabase
      .from('public_workout_likes')
      .delete()
      .eq('workout_id', normalizedWorkoutId)
      .eq('user_id', userId);
    if (error) throw error;
    return { liked: false, userId };
  }

  const { error } = await supabase
    .from('public_workout_likes')
    .insert({ workout_id: normalizedWorkoutId, user_id: userId });
  if (error) throw error;
  return { liked: true, userId };
};

export const addPublicWorkoutComment = async (workoutId, text) => {
  const commentText = String(text || '').trim();
  if (!supabase || !isCloudEnabled() || !workoutId) {
    throw new Error('O feed público não está conectado ao Supabase.');
  }
  if (!commentText || commentText.length > 1000) {
    throw new Error('O comentário deve ter entre 1 e 1.000 caracteres.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const user = sessionData.session?.user;
  if (!user?.id) throw new Error('Entre na sua conta para comentar.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('name,avatar_url')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  const comment = {
    id: generateId(),
    workout_id: String(workoutId),
    user_id: user.id,
    text: commentText
  };
  const { data, error } = await supabase
    .from('public_workout_comments')
    .insert(comment)
    .select('id,workout_id,user_id,text,created_at')
    .single();
  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    userName: profile?.name || user.user_metadata?.name || 'Atleta',
    userAvatar: profile?.avatar_url,
    text: data.text,
    date: data.created_at
  };
};

export const uploadPublicWorkoutPhoto = async (dataUrl, workoutId) => {
  const bucketName = 'public-workout-photos';
  if (!isCloudEnabled()) throw new Error('Conecte o projeto Supabase antes de publicar uma foto.');
  if (!dataUrl || !workoutId) throw new Error('Escolha uma foto válida para publicar o treino.');

  try {
    const response = await fetch(dataUrl);
    const file = await response.blob();
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
      throw new Error('A foto deve ser JPG, PNG ou WebP e ter até 5 MB.');
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = sessionData.session?.user?.id;
    if (!userId) throw new Error('Entre na sua conta para publicar uma foto.');

    const extension = file.type.split('/')[1].replace('jpeg', 'jpg');
    const path = `${userId}/${generateId()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error('O Supabase não retornou o endereço da foto publicada.');
    return data.publicUrl;
  } catch (error) {
    console.error('Não foi possível enviar a foto do treino:', error);
    throw error;
  }
};

export const deletePublicWorkoutPhoto = async (photoUrl) => {
  const bucketName = 'public-workout-photos';
  if (!photoUrl) return true;
  if (!supabase || !isCloudEnabled()) {
    showToast('Conecte o Supabase para remover esta foto pública.', 'error');
    return false;
  }

  const marker = `/${bucketName}/`;
  const markerIndex = String(photoUrl).indexOf(marker);
  if (markerIndex < 0) return true;

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = sessionData.session?.user?.id;
    const path = decodeURIComponent(String(photoUrl).slice(markerIndex + marker.length).split('?')[0]);
    const pathSegments = path.split('/');
    if (!userId || pathSegments.length !== 2 || pathSegments[0] !== userId) {
      throw new Error('Não é possível remover a foto de outra conta.');
    }

    const { error } = await supabase.storage.from(bucketName).remove([path]);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Não foi possível remover a foto pública do treino:', error);
    showToast('Não foi possível remover a foto pública do treino.', 'error');
    return false;
  }
};

export const fetchCloudPublicProfile = async (profileId) => {
  if (!isCloudEnabled() || !profileId) return null;
  const { data, error } = await supabase.rpc('get_shared_profile_data', {
    p_profile_id: profileId
  });
  if (error) throw error;
  return data || null;
};

export const fetchCloudSharedProfiles = async (profileIds) => {
  if (!isCloudEnabled() || !Array.isArray(profileIds)) return {};
  const validIds = [...new Set(profileIds.filter(profileId => (
    /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(String(profileId || ''))
  )))];
  if (validIds.length === 0) return {};

  const { data, error } = await supabase.rpc('get_shared_profile_data_batch', {
    p_profile_ids: validIds
  });
  if (error) throw error;
  return data || {};
};

export const syncProfileTrainingMetrics = async (userId, metrics) => {
  if (!supabase || !userId) return null;
  try {
    const { error } = await supabase
      .from('profile_training_metrics')
      .upsert({
        user_id: userId,
        payload: metrics || {},
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Não foi possível sincronizar as métricas privadas do perfil:', error);
    return null;
  }
};

// ============================================================================
// 5. MEASUREMENTS (MEDIDAS CORPORAIS)
// ============================================================================
export const syncMeasurementsToCloud = async (userId, measurements) => {
  if (!supabase || !userId) return null;
  try {
    return await syncUserData(userId, 'measurements', measurements || []);
  } catch (err) {
    console.error('Erro ao sincronizar medidas no Supabase:', err);
    showToast('Erro ao salvar medidas na nuvem.', 'error');
    return null;
  }
};

export const fetchCloudMeasurements = async (userId) => {
  if (!supabase || !userId) return [];
  try {
    return await fetchUserData(userId, 'measurements', []);
  } catch (err) {
    console.error('Erro ao buscar medidas no Supabase:', err);
    return null;
  }
};

// ============================================================================
// 6. GROUPS & FEED (GRUPOS E COMUNIDADES)
// ============================================================================
export const leaveCloudGroup = async (groupId) => {
  if (!supabase || !groupId) return null;
  try {
    const { data, error } = await supabase.rpc('leave_group', {
      p_group_id: String(groupId)
    });
    if (error) throw error;
    if (!data || !Array.isArray(data.members)) {
      throw new Error('Resposta inválida ao sair do grupo.');
    }
    return data;
  } catch (error) {
    console.error('Não foi possível sair do grupo no Supabase:', error);
    return null;
  }
};

export const syncGroupsToCloud = async (groupsList) => {
  if (!supabase) return null;
  try {
    const groups = Array.isArray(groupsList) ? groupsList : [];
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = sessionData.session?.user?.id;
    if (!userId) throw new Error('É necessário entrar para sincronizar grupos.');

    const { data: ownedGroups, error: ownedGroupsError } = await supabase
      .from('groups')
      .select('id')
      .eq('created_by', userId);
    if (ownedGroupsError) throw ownedGroupsError;
    const requestedIds = new Set(groups.map(group => String(group.id)));
    const removedIds = (ownedGroups || [])
      .map(group => group.id)
      .filter(id => !requestedIds.has(String(id)));
    if (removedIds.length > 0) {
      const { error: deleteError } = await supabase.from('groups').delete().in('id', removedIds);
      if (deleteError) throw deleteError;
    }
    const manageableGroups = groups.filter(group => (
      String(group.createdBy || group.created_by || '') === userId
      || (group.members || []).some(member => String(member.id) === userId)
    ));
    if (manageableGroups.length === 0) return [];

    const rows = manageableGroups.map(group => ({
      id: group.id,
      name: group.name,
      description: group.description || '',
      invite_code: group.inviteCode || group.invite_code || '',
      photo_url: group.photoUrl || group.photo_url || null,
      pin: group.pin || null,
      category: group.category || 'Geral',
      created_by: group.createdBy || group.created_by,
      payload: group
    }));
    const { data, error } = await supabase.from('groups').upsert(rows).select('payload');
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Exceção ao sincronizar grupos no Supabase:', err);
    showToast('Erro ao atualizar dados do grupo na nuvem.', 'error');
    return null;
  }
};

export const syncGroupToCloud = async (groupData) => {
  if (!supabase || !groupData?.id) return null;
  try {
    const rows = [{
      id: groupData.id,
      name: groupData.name,
      description: groupData.description || '',
      invite_code: groupData.inviteCode || groupData.invite_code || '',
      photo_url: groupData.photoUrl || groupData.photo_url || null,
      pin: groupData.pin || null,
      category: groupData.category || 'Geral',
      created_by: groupData.createdBy || groupData.created_by,
      payload: groupData
    }];
    const { data, error } = await supabase.from('groups').upsert(rows).select('payload');
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Exceção ao sincronizar grupo individual no Supabase:', err);
    showToast('Erro ao atualizar dados do grupo na nuvem.', 'error');
    return null;
  }
};

export const fetchCloudGroups = async () => {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('groups')
      .select('payload')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar grupos no Supabase:', error.message || error);
      return null;
    }
    return (data || []).map(row => parseJsonData(row.payload, null)).filter(Boolean);
  } catch (err) {
    console.error('Exceção ao buscar grupos no Supabase:', err);
    return null;
  }
};

export const deleteCloudGroup = async (groupId) => {
  if (!supabase || !groupId) return null;
  try {
    const { error } = await supabase.from('groups').delete().eq('id', groupId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Exceção ao deletar grupo no Supabase:', err);
    return null;
  }
};

// ============================================================================
// 7. GROUP CHAT MESSAGES
// ============================================================================
export const syncMessagesToCloud = async (groupId, messages) => {
  if (!supabase || !groupId) return null;
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = sessionData.session?.user?.id;
    if (!userId) throw new Error('É necessário entrar para sincronizar mensagens.');
    const rows = (messages || []).filter(message => message.userId === userId).map(message => ({
      id: String(message.id),
      group_id: groupId,
      user_id: userId,
      payload: message
    }));
    if (rows.length === 0) return [];
    const { data, error } = await supabase
      .from('group_messages')
      .upsert(rows, { onConflict: 'id' })
      .select('payload');
    if (error) {
      console.error('Erro ao sincronizar mensagens no Supabase:', error.message || error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Exceção ao sincronizar mensagens no Supabase:', err);
    return null;
  }
};

export const uploadGroupChatImage = async (file, groupId) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const maxBytes = 5 * 1024 * 1024;
  if (!file || !groupId || !allowedTypes.includes(file.type) || file.size > maxBytes) {
    showToast('Escolha uma imagem JPG, PNG, WebP ou GIF de até 5 MB.', 'error');
    return null;
  }
  if (!supabase) {
    showToast('O armazenamento do chat não está configurado.', 'error');
    return null;
  }

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = sessionData.session?.user?.id;
    if (!userId) throw new Error('É necessário entrar para enviar imagens.');

    const extension = file.type.split('/')[1].replace('jpeg', 'jpg');
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    const path = `${groupId}/${userId}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from('group-chat-images')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase.storage
      .from('group-chat-images')
      .createSignedUrl(path, 60 * 60);
    if (error) throw error;
    return { path, url: data.signedUrl, signedAt: new Date().toISOString() };
  } catch (error) {
    console.error('Não foi possível enviar imagem ao chat:', error);
    showToast('Não foi possível enviar a imagem. Verifique a conexão e o schema do Supabase.', 'error');
    return null;
  }
};

export const deleteGroupChatImage = async (path) => {
  if (!supabase || !path) return null;
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = sessionData.session?.user?.id;
    if (!userId || path.split('/')[1] !== userId) {
      throw new Error('Não é possível remover uma imagem de outra conta.');
    }
    const { error } = await supabase.storage.from('group-chat-images').remove([path]);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Não foi possível remover imagem do chat:', error);
    showToast('A mensagem foi apagada, mas a imagem não pôde ser removida do armazenamento.', 'error');
    return null;
  }
};

export const fetchCloudMessages = async (groupId) => {
  if (!supabase || !groupId) return [];
  try {
    const { data, error } = await supabase
      .from('group_messages')
      .select('payload')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    const messages = (data || []).map(row => parseJsonData(row.payload, null)).filter(Boolean);
    return await Promise.all(messages.map(async message => {
      if (!message.imagePath || message.deleted) return message;
      const signedAt = Date.parse(message.imageSignedAt);
      if (message.imageUrl && Number.isFinite(signedAt) && Date.now() - signedAt < 50 * 60 * 1000) {
        return message;
      }
      const { data: signedUrl, error: signedUrlError } = await supabase.storage
        .from('group-chat-images')
        .createSignedUrl(message.imagePath, 60 * 60);
      if (signedUrlError) {
        console.error('Não foi possível gerar URL da imagem do chat:', signedUrlError);
        return { ...message, imageUrl: null };
      }
      return {
        ...message,
        imageUrl: signedUrl?.signedUrl || null,
        imageSignedAt: new Date().toISOString()
      };
    }));
  } catch (err) {
    console.error('Exceção ao buscar mensagens no Supabase:', err);
    throw err;
  }
};

// ============================================================================
// 8. FULL ACCOUNT & AUTHENTICATION REGISTRY (CROSS-DEVICE LOGIN)
// ============================================================================
export const syncFullAccountToCloud = async (user) => {
  if (!supabase || !user?.id) return null;
  const cleanUser = {
    id: user.id,
    name: user.name,
    username: user.username,
    email: (user.email || '').toLowerCase().trim(),
    pin: user.pin,
    gender: user.gender,
    avatar: user.avatar,
    weeklyGoal: user.weeklyGoal,
    weeklySchedule: user.weeklySchedule,
    privacy: user.privacy,
    measurementsHistory: user.measurementsHistory || [],
    onboarded: user.onboarded !== undefined ? user.onboarded : true,
    updatedAt: new Date().toISOString()
  };

  try {
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: cleanUser.id,
      name: cleanUser.name,
      username: cleanUser.username,
      avatar_url: cleanUser.avatar,
      updated_at: cleanUser.updatedAt
    });
    if (profileError) {
      console.warn('Aviso ao sincronizar profiles (ignorado):', profileError.message);
    }
  } catch (pErr) {
    console.warn('Exceção ao sincronizar profiles:', pErr);
  }

  await syncUserData(user.id, 'account_data', cleanUser);
  return cleanUser;
};

export const fetchCloudAccount = async (userId) => {
  if (!supabase || !userId) return null;
  try {
    const [profileRes, accountData] = await Promise.all([
      supabase.from('profiles').select('id,name,username,avatar_url').eq('id', userId).maybeSingle().catch(e => ({ error: e })),
      fetchUserData(userId, 'account_data', {}).catch(() => ({}))
    ]);
    const profile = profileRes?.data;
    if (!profile && !accountData) return null;
    return {
      ...accountData,
      id: userId,
      name: profile?.name || accountData?.name,
      username: profile?.username || accountData?.username,
      avatar: profile?.avatar_url || accountData?.avatar || null,
      gender: accountData?.gender || 'Masculino',
      weeklyGoal: accountData?.weeklyGoal || 4
    };
  } catch (err) {
    console.error('Exceção ao buscar conta por ID no Supabase:', err);
    return null;
  }
};

export const syncProfileToCloud = async (userProfile) => {
  return await syncFullAccountToCloud(userProfile);
};

export const fetchCloudProfile = async (userId) => {
  return await fetchCloudAccount(userId);
};

export const fetchUserFollowSummary = async (profileId, viewerId) => {
  if (!isCloudEnabled()) throw new Error('O seguimento em nuvem não está configurado.');
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(String(profileId || ''))) {
    throw new Error('Perfil inválido para carregar seguidores.');
  }

  const { data, error } = await supabase
    .from('user_follows')
    .select('follower_id,following_id')
    .or(`following_id.eq.${profileId},follower_id.eq.${profileId}`);
  if (error) throw error;

  const follows = data || [];
  return {
    followers: follows.filter(follow => follow.following_id === profileId).length,
    following: follows.filter(follow => follow.follower_id === profileId).length,
    isFollowing: Boolean(viewerId && follows.some(follow => (
      follow.follower_id === viewerId && follow.following_id === profileId
    )))
  };
};

export const setUserFollow = async (profileId, shouldFollow) => {
  if (!isCloudEnabled()) throw new Error('O seguimento em nuvem não está configurado.');
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(String(profileId || ''))) {
    throw new Error('Perfil inválido para atualizar seguimento.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const viewerId = sessionData.session?.user?.id;
  if (!viewerId) throw new Error('Entre na sua conta para seguir atletas.');
  if (viewerId === profileId) throw new Error('Não é possível seguir seu próprio perfil.');

  if (shouldFollow) {
    const { error } = await supabase
      .from('user_follows')
      .upsert(
        { follower_id: viewerId, following_id: profileId },
        { onConflict: 'follower_id,following_id', ignoreDuplicates: true }
      );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('user_follows')
      .delete()
      .eq('follower_id', viewerId)
      .eq('following_id', profileId);
    if (error) throw error;
  }

  return fetchUserFollowSummary(profileId, viewerId);
};

// ============================================================================
// 9. VALIDATION: USERNAME OR NAME UNIQUENESS
// ============================================================================
export const isUsernameOrNameTaken = async (name, username, excludeUserId = null) => {
  if (!supabase) return { isTaken: false };
  const cleanName = (name || '').trim().toLowerCase();
  const cleanUser = (username || '').trim().toLowerCase();
  try {
    const { data, error } = await supabase.from('profiles').select('id,name,username');
    if (error) {
      console.warn('isUsernameOrNameTaken aviso (ignorado):', error.message);
      return { isTaken: false };
    }

    for (const profile of data || []) {
      if (excludeUserId && String(profile.id) === String(excludeUserId)) continue;
      if (profile.name?.trim().toLowerCase() === cleanName) {
        return { isTaken: true, field: 'name', message: 'Este nome de perfil já está em uso por outro atleta. Escolha outro.' };
      }
      if (profile.username?.trim().toLowerCase() === cleanUser) {
        return { isTaken: true, field: 'username', message: 'Este nome de usuário (@' + profile.username + ') já está em uso. Escolha outro.' };
      }
    }
  } catch (err) {
    console.warn('isUsernameOrNameTaken catch (ignorado):', err);
  }
  return { isTaken: false };
};

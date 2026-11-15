import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { generateId, storage } from '../utils/storage';
import { DEFAULT_WEEKLY_SCHEDULE } from '../utils/initialData';
import { isValidCompletedSet, markWorkoutPRs, recalculateWorkoutPRs } from '../utils/workoutMetrics';
import { calculateGroupMemberMetrics } from '../utils/groupMetrics';
import { getProfileVisibility } from '../utils/profilePrivacy';
import { formatExerciseDuration } from '../utils/workoutFeedMetrics';
import { 
  fetchCloudGroups, 
  syncGroupsToCloud,
  syncGroupToCloud, 
  deleteCloudGroup, 
  leaveCloudGroup,
  fetchCloudCheckins, 
  syncCheckinsToCloud,
  syncCheckinToCloud, 
  fetchCloudRoutines, 
  syncRoutinesToCloud, 
  fetchCloudCardioRoutines, 
  syncCardioRoutinesToCloud, 
  fetchCloudSchedule, 
  syncScheduleToCloud, 
  fetchCloudMessages, 
  syncMessagesToCloud,
  deleteGroupChatImage,
  deletePublicWorkoutPhoto,
  syncPublicWorkoutToCloud,
  deletePublicWorkoutFromCloud,
  syncProfileTrainingMetrics,
  isCloudEnabled,
  supabase 
} from '../lib/supabase';
import { dispatchPushEvent } from '../lib/notificationService';
import { showToast } from './ToastContext';

const DataContext = createContext();

const createSharedWorkout = (checkin, includePRs = checkin.sharePRs === true) => ({
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
    sets: (exercise.sets || []).filter(isValidCompletedSet).map(set => {
      const visibleSet = { ...set };
      if (checkin.showWeights === false) delete visibleSet.weight;
      if (!includePRs) {
        delete visibleSet.isPR;
        delete visibleSet.prType;
      }
      return visibleSet;
    })
  }))
});

const getWorkoutVisibility = (checkin) => (
  checkin.visibility || (checkin.isPublic ? 'public' : checkin.shareToGroup ? 'group' : 'private')
);

const dispatchPushEventWithFeedback = async (event, enqueueNotification) => {
  const sent = await dispatchPushEvent(event);
  if (!sent) {
    enqueueNotification?.();
    showToast('Os dados foram salvos, mas o push não foi enviado. Confira a configuração do Firebase e da Edge Function.', 'info', 6000);
  }
  return sent;
};

export function DataProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id || null;
  const activeWorkoutStorageKey = userId ? `active_workout_${userId}` : null;

  // ---- USER DATA STATES (SINGLE SOURCE OF TRUTH: SUPABASE CLOUD) ----
  const [routines, setRoutines] = useState([]);
  const [cardioRoutines, setCardioRoutines] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [weeklySchedule, setWeeklySchedule] = useState(DEFAULT_WEEKLY_SCHEDULE);
  const [activeWorkout, setActiveWorkout] = useState(null);
  const [isActiveWorkoutLoaded, setIsActiveWorkoutLoaded] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  // ---- GLOBAL SHARED GROUPS & MESSAGES DATABASE ----
  const [allGroups, setAllGroups] = useState([]);
  const [allMessages, setAllMessages] = useState([]);

  const activeWorkoutRef = useRef(null);

  // Queue ref for pending offline syncs
  const isSyncingRef = useRef(false);
  const lastQueueNoticeAtRef = useRef(0);

  const filterLegacyMockCardios = (cardios) => {
    if (!Array.isArray(cardios)) return [];
    return cardios.filter(c => c && c.id !== 'cardio_natacao' && c.id !== 'cardio_esteira' && c.id !== 'cardio_bike');
  };

  // =========================================================================
  // 1. OFFLINE QUEUE & RETRY ENGINE
  // =========================================================================
  const getOfflineQueue = useCallback(() => {
    return storage.get('offline_sync_queue', []);
  }, []);

  const addToOfflineQueue = useCallback((action) => {
    const current = storage.get('offline_sync_queue', []);
    const updated = [...current, { id: generateId(), timestamp: Date.now(), ...action }];
    storage.set('offline_sync_queue', updated);
    const now = Date.now();
    if (now - lastQueueNoticeAtRef.current >= 4000) {
      const message = navigator.onLine
        ? 'Falha ao sincronizar com a nuvem. Os dados ficaram guardados neste aparelho e aguardam nova tentativa.'
        : 'Salvo em modo offline. Será sincronizado ao reconectar.';
      showToast(message, 'info', 4000);
      lastQueueNoticeAtRef.current = now;
    }
  }, []);

  const processOfflineQueue = useCallback(async () => {
    if (isSyncingRef.current) return;
    const queue = storage.get('offline_sync_queue', []);
    if (!queue || queue.length === 0) return;

    isSyncingRef.current = true;
    showToast('Conexão restabelecida! Sincronizando dados pendentes...', 'info', 3000);

    const remaining = [];
    for (const item of queue) {
      try {
        let result;
        if (item.type === 'checkins' && item.userId) {
          result = await syncCheckinsToCloud(item.userId, item.payload);
        } else if (item.type === 'routines' && item.userId) {
          result = await syncRoutinesToCloud(item.userId, item.payload);
        } else if (item.type === 'cardio' && item.userId) {
          result = await syncCardioRoutinesToCloud(item.userId, item.payload);
        } else if (item.type === 'schedule' && item.userId) {
          result = await syncScheduleToCloud(item.userId, item.payload);
        } else if (item.type === 'groups') {
          result = await syncGroupsToCloud(item.payload);
        } else if (item.type === 'messages' && item.groupId) {
          result = await syncMessagesToCloud(item.groupId, item.payload);
        } else if (item.type === 'public_workout' && item.payload) {
          result = await syncPublicWorkoutToCloud(item.payload, item.visibility);
        } else if (item.type === 'notification_event' && item.payload) {
          result = await dispatchPushEvent(item.payload);
        } else if (item.type === 'chat_image_delete' && item.path) {
          result = await deleteGroupChatImage(item.path);
        } else if (item.type === 'public_workout_photo_delete' && item.photoUrl) {
          result = await deletePublicWorkoutPhoto(item.photoUrl);
        } else if (item.type === 'profile_metrics' && item.userId) {
          result = await syncProfileTrainingMetrics(item.userId, item.payload);
        } else {
          throw new Error(`Unsupported or incomplete offline sync item: ${item.type || 'unknown'}`);
        }
        if (result === null || result === false) {
          throw new Error(`Cloud sync failed for ${item.type}.`);
        }
        if (item.notificationEvent) {
          const notificationSent = await dispatchPushEvent(item.notificationEvent);
          if (!notificationSent) {
            showToast('Os dados foram sincronizados, mas uma notificação ainda aguarda envio.', 'info', 6000);
            remaining.push({
              id: `${item.id}-notification`,
              timestamp: Date.now(),
              type: 'notification_event',
              payload: item.notificationEvent
            });
          }
        }
      } catch (err) {
        console.error('Falha ao processar item da fila offline:', {
          id: item.id,
          type: item.type,
          message: err?.message
        });
        remaining.push(item);
      }
    }

    storage.set('offline_sync_queue', remaining);
    isSyncingRef.current = false;

    if (remaining.length === 0) {
      showToast('Todos os treinos e dados foram sincronizados na nuvem!', 'success', 4000);
      syncWithCloud();
    } else {
      showToast(
        `${remaining.length} item(ns) continuam aguardando sincronização. Os dados permanecem neste aparelho.`,
        'error',
        5000
      );
    }
  }, []);

  // Listen to network status changes
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processOfflineQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
      showToast('Você está sem conexão. Os treinos serão salvos localmente.', 'info', 4000);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    if (navigator.onLine) {
      processOfflineQueue();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [processOfflineQueue]);

  // =========================================================================
  // 2. SUPABASE DIRECT CLOUD FETCH (CROSS-DEVICE: PC <-> MOBILE)
  // =========================================================================
  const syncWithCloud = useCallback(async () => {
    if (!navigator.onLine) {
      setIsDataLoading(false);
      return;
    }

    try {
      // 1. Fetch Global Groups from Supabase
      const cloudGroups = await fetchCloudGroups();
      if (Array.isArray(cloudGroups)) {
        setAllGroups(cloudGroups);
      }

      // 2. Fetch User-Specific Data directly from Supabase
      if (user?.id) {
        const [cloudCheckins, cloudRoutines, cloudCardios, cloudSchedule] = await Promise.all([
          fetchCloudCheckins(user.id),
          fetchCloudRoutines(user.id),
          fetchCloudCardioRoutines(user.id),
          fetchCloudSchedule(user.id)
        ]);

        if (Array.isArray(cloudCheckins)) {
          setCheckins(cloudCheckins);
        }

        if (Array.isArray(cloudRoutines)) {
          setRoutines(cloudRoutines);
        }

        if (Array.isArray(cloudCardios)) {
          setCardioRoutines(filterLegacyMockCardios(cloudCardios));
        }

        if (cloudSchedule && typeof cloudSchedule === 'object') {
          setWeeklySchedule(cloudSchedule);
        }

      }
    } catch (err) {
      console.error('Erro ao sincronizar com o Supabase:', err);
    } finally {
      setIsDataLoading(false);
    }
  }, [user?.id]);

  const updateGroupsWithMemberMetrics = useCallback(async (updatedCheckins, feedItem = null, removedCheckin = null) => {
    if (!user?.id) return;

    const metrics = calculateGroupMemberMetrics(
      updatedCheckins,
      weeklySchedule,
      new Date()
    );
    const profileVisibility = getProfileVisibility(user.privacy);
    if (isCloudEnabled()) {
      if (navigator.onLine) {
        const syncedProfileMetrics = await syncProfileTrainingMetrics(user.id, metrics);
        if (syncedProfileMetrics === null) {
          addToOfflineQueue({ type: 'profile_metrics', userId: user.id, payload: metrics });
        }
      } else {
        addToOfflineQueue({ type: 'profile_metrics', userId: user.id, payload: metrics });
      }
    }
    const groupMetrics = { ...metrics };
    if (profileVisibility.trainingActivity !== 'public') {
      ['weeklyCheckins', 'streak', 'weeklyStreak'].forEach(key => delete groupMetrics[key]);
    }
    if (profileVisibility.trainingVolume !== 'public') {
      ['weeklySetsByMuscleGroup', 'maxLiftsByMuscleGroup', 'weeklyVolumeKg'].forEach(key => delete groupMetrics[key]);
    }
    if (profileVisibility.personalRecords !== 'public') {
      delete groupMetrics.prsCount;
    }
    const hiddenGroupMetricKeys = [
      ...(profileVisibility.trainingActivity !== 'public'
        ? ['weeklyCheckins', 'streak', 'weeklyStreak', 'weeklyGoal']
        : []),
      ...(profileVisibility.trainingVolume !== 'public'
        ? ['weeklySetsByMuscleGroup', 'maxLiftsByMuscleGroup', 'weeklyVolumeKg']
        : []),
      ...(profileVisibility.personalRecords !== 'public' ? ['prsCount'] : [])
    ];
    const groupMetricKeys = [
      'weeklyCheckins', 'streak', 'weeklyStreak', 'prsCount',
      'weeklySetsByMuscleGroup', 'maxLiftsByMuscleGroup', 'weeklyVolumeKg', 'weeklyGoal'
    ];
    let hasGroupUpdates = false;
    const updatedGroups = allGroups.map(group => {
      const members = (group.members || []).map(member => {
        if (member.id !== user.id) return member;

        const nextMember = {
          ...member,
          ...groupMetrics,
          profileVisibility
        };
        hiddenGroupMetricKeys.forEach(key => delete nextMember[key]);
        if (profileVisibility.trainingActivity === 'public') {
          nextMember.weeklyGoal = Number(user.weeklyGoal || member.weeklyGoal) || 4;
        } else {
          delete nextMember.weeklyGoal;
        }
        const changed = groupMetricKeys.some(key => (
          JSON.stringify(member[key]) !== JSON.stringify(nextMember[key])
        )) || JSON.stringify(member.profileVisibility) !== JSON.stringify(profileVisibility);
        if (changed) hasGroupUpdates = true;
        return changed ? nextMember : member;
      });

      const currentFeed = group.feed || [];
      const nextFeed = (removedCheckin
        ? currentFeed.filter(post => (
          post.checkinId
            ? post.checkinId !== removedCheckin.id
            : !(post.type === 'workout' && post.userId === user.id && post.date === removedCheckin.date)
        ))
        : currentFeed).map(post => {
        if (post.type !== 'workout' || post.userId !== user.id) return post;
        const checkin = updatedCheckins.find(item => (
          item.type !== 'cardio' &&
          !item.isCardio &&
          (item.id === post.checkinId || (!post.checkinId && item.date === post.date))
        ));
        if (!checkin) return post;
        const sharedCheckin = createSharedWorkout(checkin, checkin.sharePRs === true);
        return { ...post, exercises: sharedCheckin.exercises };
      });
      const feedChanged = JSON.stringify(nextFeed) !== JSON.stringify(currentFeed);
      const hasMember = members.some(member => member.id === user.id);
      if (!hasMember) {
        if (feedChanged) hasGroupUpdates = true;
        return feedChanged ? { ...group, feed: nextFeed } : group;
      }

      if (feedChanged || feedItem) hasGroupUpdates = true;
      return {
        ...group,
        members,
        ...(feedItem || removedCheckin ? {
          feed: [...(feedItem ? [feedItem] : []), ...nextFeed]
        } : {})
      };
    });

    if (!hasGroupUpdates) return;
    setAllGroups(updatedGroups);
    if (isCloudEnabled() && navigator.onLine) {
      const synced = await syncGroupsToCloud(updatedGroups);
      if (synced === null) addToOfflineQueue({ type: 'groups', payload: updatedGroups });
    } else if (!navigator.onLine) {
      addToOfflineQueue({ type: 'groups', payload: updatedGroups });
    }
  }, [user, weeklySchedule, allGroups, addToOfflineQueue]);

  useEffect(() => {
    if (!isDataLoading && user?.id) {
      updateGroupsWithMemberMetrics(checkins);
    }
  }, [isDataLoading, user?.id, checkins, updateGroupsWithMemberMetrics]);

  useEffect(() => {
    setIsActiveWorkoutLoaded(false);
    const savedWorkout = activeWorkoutStorageKey
      ? storage.get(activeWorkoutStorageKey, null)
      : null;
    const restoredWorkout = savedWorkout
      && savedWorkout.id
      && Number.isFinite(Number(savedWorkout.startTime))
      && Array.isArray(savedWorkout.exercises)
      ? savedWorkout
      : null;

    activeWorkoutRef.current = restoredWorkout;
    setActiveWorkout(restoredWorkout);
    setIsActiveWorkoutLoaded(true);
  }, [activeWorkoutStorageKey]);

  // Load from Supabase on mount and whenever user switches
  useEffect(() => {
    if (user?.id) {
      setIsDataLoading(true);
      setWeeklySchedule(DEFAULT_WEEKLY_SCHEDULE);
      syncWithCloud();
    } else {
      setRoutines([]);
      setCardioRoutines([]);
      setCheckins([]);
      setWeeklySchedule(DEFAULT_WEEKLY_SCHEDULE);
      setActiveWorkout(null);
      setIsDataLoading(false);
    }
  }, [user?.id, syncWithCloud]);

  // Periodic automatic sync every 15 seconds to ensure PC <-> Mobile alignment
  useEffect(() => {
    const interval = setInterval(() => {
      syncWithCloud();
    }, 15000);

    const onFocus = () => syncWithCloud();
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [syncWithCloud]);

  // =========================================================================
  // 3. ROUTINES ACTIONS (WITH REORDERING & DIRECT CLOUD / OFFLINE PERSISTENCE)
  // =========================================================================
  const addRoutine = useCallback(async (routine) => {
    const newRoutine = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      ...routine,
      exercises: routine.exercises || []
    };

    const updated = [...routines, newRoutine];
    setRoutines(updated);

    if (user?.id) {
      if (navigator.onLine) {
        const res = await syncRoutinesToCloud(user.id, updated);
        if (!res) {
          addToOfflineQueue({ type: 'routines', userId: user.id, payload: updated });
        }
      } else {
        addToOfflineQueue({ type: 'routines', userId: user.id, payload: updated });
      }
    }
    return newRoutine;
  }, [routines, user?.id, addToOfflineQueue]);

  const updateRoutine = useCallback(async (id, updates) => {
    const updated = routines.map(r => r.id === id ? { ...r, ...updates } : r);
    setRoutines(updated);

    if (user?.id) {
      if (navigator.onLine) {
        const res = await syncRoutinesToCloud(user.id, updated);
        if (!res) {
          addToOfflineQueue({ type: 'routines', userId: user.id, payload: updated });
        }
      } else {
        addToOfflineQueue({ type: 'routines', userId: user.id, payload: updated });
      }
    }
    return updated;
  }, [routines, user?.id, addToOfflineQueue]);

  const deleteRoutine = useCallback(async (id) => {
    const updated = routines.filter(r => r.id !== id);
    setRoutines(updated);

    if (user?.id) {
      if (navigator.onLine) {
        const res = await syncRoutinesToCloud(user.id, updated);
        if (!res) {
          addToOfflineQueue({ type: 'routines', userId: user.id, payload: updated });
        }
      } else {
        addToOfflineQueue({ type: 'routines', userId: user.id, payload: updated });
      }
    }
    return updated;
  }, [routines, user?.id, addToOfflineQueue]);

  const duplicateRoutine = useCallback(async (id) => {
    const original = routines.find(r => r.id === id);
    if (!original) return routines;
    const copy = {
      ...original,
      id: generateId(),
      name: `${original.name} (Cópia)`,
      createdAt: new Date().toISOString()
    };
    const updated = [...routines, copy];
    setRoutines(updated);

    if (user?.id) {
      if (navigator.onLine) {
        await syncRoutinesToCloud(user.id, updated);
      } else {
        addToOfflineQueue({ type: 'routines', userId: user.id, payload: updated });
      }
    }
    return updated;
  }, [routines, user?.id, addToOfflineQueue]);

  // Reorder exercises inside a saved routine
  const reorderRoutineExercises = useCallback(async (routineId, newExercises) => {
    const updated = routines.map(r => r.id === routineId ? { ...r, exercises: newExercises } : r);
    setRoutines(updated);
    if (user?.id) {
      if (navigator.onLine) {
        await syncRoutinesToCloud(user.id, updated);
      } else {
        addToOfflineQueue({ type: 'routines', userId: user.id, payload: updated });
      }
    }
  }, [routines, user?.id, addToOfflineQueue]);

  // ---- CARDIO ROUTINES ACTIONS ----
  const addCardioRoutine = useCallback(async (routine) => {
    const newRoutine = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      name: routine.name || 'Nova Rotina de Cardio',
      modality: routine.modality || routine.name || 'Esteira (Caminhada / Corrida)',
      targetDuration: Number(routine.targetDuration) || 30,
      targetDistance: Number(routine.targetDistance) || 0,
      targetCalories: Number(routine.targetCalories) || 0,
      notes: routine.notes || '',
      scheduledDay: routine.scheduledDay !== undefined && routine.scheduledDay !== '' && routine.scheduledDay !== null ? Number(routine.scheduledDay) : null,
      ...routine
    };

    const updated = [...cardioRoutines, newRoutine];
    setCardioRoutines(updated);

    if (user?.id) {
      if (navigator.onLine) {
        await syncCardioRoutinesToCloud(user.id, updated);
      } else {
        addToOfflineQueue({ type: 'cardio', userId: user.id, payload: updated });
      }
    }

    if (newRoutine.scheduledDay !== null && newRoutine.scheduledDay !== undefined) {
      const existing = weeklySchedule[newRoutine.scheduledDay] || { type: 'rest', label: 'Descanso' };
      const hasW = Boolean(existing.hasWorkout || existing.type === 'workout' || existing.type === 'both');
      const wLabel = existing.workoutLabel || (hasW ? existing.label : '');
      const updatedSched = {
        ...weeklySchedule,
        [newRoutine.scheduledDay]: {
          ...existing,
          hasCardio: true,
          cardioLabel: newRoutine.name,
          cardioRoutineId: newRoutine.id,
          cardioDetails: {
            modality: newRoutine.modality,
            duration: newRoutine.targetDuration,
            distance: newRoutine.targetDistance,
            calories: newRoutine.targetCalories,
            notes: newRoutine.notes
          },
          type: hasW ? 'both' : 'cardio',
          label: hasW ? `${wLabel} + Cardio: ${newRoutine.name}` : `Cardio: ${newRoutine.name}`
        }
      };
      setWeeklySchedule(updatedSched);
      if (user?.id) {
        if (navigator.onLine) {
          await syncScheduleToCloud(user.id, updatedSched);
        } else {
          addToOfflineQueue({ type: 'schedule', userId: user.id, payload: updatedSched });
        }
      }
    }

    return newRoutine;
  }, [cardioRoutines, weeklySchedule, user?.id, addToOfflineQueue]);

  const updateCardioRoutine = useCallback(async (id, updates) => {
    const updated = cardioRoutines.map(c => c.id === id ? { ...c, ...updates } : c);
    setCardioRoutines(updated);

    if (user?.id) {
      if (navigator.onLine) {
        await syncCardioRoutinesToCloud(user.id, updated);
      } else {
        addToOfflineQueue({ type: 'cardio', userId: user.id, payload: updated });
      }
    }
    return updated;
  }, [cardioRoutines, user?.id, addToOfflineQueue]);

  const deleteCardioRoutine = useCallback(async (id) => {
    const updated = cardioRoutines.filter(c => c.id !== id);
    setCardioRoutines(updated);

    if (user?.id) {
      if (navigator.onLine) {
        await syncCardioRoutinesToCloud(user.id, updated);
      } else {
        addToOfflineQueue({ type: 'cardio', userId: user.id, payload: updated });
      }
    }
    return updated;
  }, [cardioRoutines, user?.id, addToOfflineQueue]);

  // =========================================================================
  // 4. ACTIVE WORKOUT SESSION & FINISH WITH OFFLINE SUPPORT
  // =========================================================================
  const startActiveWorkout = useCallback((routine) => {
    if (activeWorkoutRef.current) return activeWorkoutRef.current;

    const findPreviousSets = (exerciseName) => {
      for (const checkin of checkins) {
        const match = checkin.exercises?.find(ex => ex.name === exerciseName);
        if (match && match.sets?.length > 0) {
          return match.sets;
        }
      }
      return null;
    };

    const exercises = (routine?.exercises || []).map(ex => {
      const prevSets = findPreviousSets(ex.name);

      return {
        ...ex,
        notes: ex.notes || '',
        sets: (ex.sets || []).map((s, idx) => {
          const prevSet = prevSets?.[idx];
          if (ex.trackingType === 'duration') {
            const previousDurationSeconds = prevSet?.durationSeconds ?? s.durationSeconds ?? 0;
            return {
              setNumber: idx + 1,
              durationSeconds: 0,
              completed: false,
              previousDurationSeconds,
              previous: previousDurationSeconds > 0
                ? formatExerciseDuration(previousDurationSeconds)
                : '—'
            };
          }
          const prevWeight = prevSet?.weight ?? s.weight ?? 0;
          const prevReps = prevSet?.reps ?? s.reps ?? 0;

          return {
            setNumber: idx + 1,
            weight: 0,
            reps: 0,
            completed: false,
            rpe: '',
            previousWeight: prevWeight,
            previousReps: prevReps,
            previous: (prevWeight > 0 || prevReps > 0) ? `${prevWeight}kg x ${prevReps}` : '—'
          };
        })
      };
    });

    if (exercises.length === 0) {
      exercises.push({
        id: generateId(),
        muscleGroup: 'Geral',
        name: 'Exercício 1',
        notes: '',
        sets: [
          { setNumber: 1, weight: 0, reps: 0, completed: false, rpe: '', previousWeight: 0, previousReps: 0, previous: '—' }
        ]
      });
    }

    const session = {
      id: generateId(),
      routineId: routine?.id || 'free_workout',
      routineName: routine?.name || 'Treino Livre',
      startTime: Date.now(),
      exercises
    };

    activeWorkoutRef.current = session;
    setActiveWorkout(session);
    if (activeWorkoutStorageKey) {
      storage.set(activeWorkoutStorageKey, session);
    }
    return session;
  }, [activeWorkoutStorageKey, checkins]);

  const updateActiveWorkout = useCallback((updates) => {
    const currentWorkout = activeWorkoutRef.current;
    if (!currentWorkout) return;

    const updatedWorkout = { ...currentWorkout, ...updates };
    activeWorkoutRef.current = updatedWorkout;
    setActiveWorkout(updatedWorkout);
    if (activeWorkoutStorageKey) {
      storage.set(activeWorkoutStorageKey, updatedWorkout);
    }
  }, [activeWorkoutStorageKey]);

  const cancelActiveWorkout = useCallback(() => {
    activeWorkoutRef.current = null;
    setActiveWorkout(null);
    if (activeWorkoutStorageKey) {
      storage.remove(activeWorkoutStorageKey);
    }
  }, [activeWorkoutStorageKey]);

  const finishActiveWorkout = useCallback(async ({ 
    photoUrl, 
    notes, 
    title, 
    shareToGroup = true, 
    isPublic = true, 
    showWeights = true,
    showMuscleStats = true,
    visibility
  } = {}) => {
    if (!activeWorkout) return null;
    const workoutVisibility = visibility || (isPublic ? 'public' : shareToGroup ? 'group' : 'private');
    const shouldShareWithGroups = workoutVisibility === 'group' || workoutVisibility === 'public';

    const durationSeconds = Math.max(1, Math.round((Date.now() - activeWorkout.startTime) / 1000));
    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));

    let totalVolume = 0;
    let completedSetsCount = 0;
    let completedRepsCount = 0;
    const muscleStats = {};

    activeWorkout.exercises.forEach(ex => {
      const muscle = ex.muscleGroup || 'Geral';
      if (!muscleStats[muscle]) {
        muscleStats[muscle] = { volume: 0, reps: 0, sets: 0 };
      }

      ex.sets.forEach(s => {
        if (isValidCompletedSet(s)) {
          if (ex.trackingType === 'duration') {
            completedSetsCount++;
            muscleStats[muscle].sets += 1;
            return;
          }
          const w = Number(s.weight) || 0;
          const r = Number(s.reps) || 0;
          totalVolume += w * r;
          completedSetsCount++;
          completedRepsCount += r;
          muscleStats[muscle].volume += w * r;
          muscleStats[muscle].reps += r;
          muscleStats[muscle].sets += 1;
        }
      });
    });

    const markedExercises = markWorkoutPRs(activeWorkout.exercises, checkins);
    const checkinData = {
      id: generateId(),
      type: 'workout',
      date: new Date().toISOString(),
      routineId: activeWorkout.routineId,
      routineName: activeWorkout.routineName,
      title: title || activeWorkout.routineName,
      durationMinutes,
      totalVolumeKg: totalVolume,
      totalSets: completedSetsCount,
      totalReps: completedRepsCount,
      muscleStats,
      photoUrl: photoUrl || null,
      notes: notes || 'Treino concluído com sucesso!',
      userId: user?.id,
      userName: user?.name || 'Atleta',
      userAvatar: user?.avatar,
      visibility: workoutVisibility,
      shareToGroup: shouldShareWithGroups,
      isPublic: workoutVisibility === 'public',
      showMuscleStats,
      sharePRs: user?.privacy?.publicPRs === true,
      showWeights,
      exercises: markedExercises.map(ex => ({
        name: ex.name,
        muscleGroup: ex.muscleGroup,
        trackingType: ex.trackingType,
        notes: ex.notes,
        sets: ex.sets.map(s => ({
          weight: s.weight,
          reps: s.reps,
          durationSeconds: s.durationSeconds,
          completed: s.completed,
          rpe: s.rpe === '' || s.rpe === undefined ? null : Number(s.rpe),
          isPR: s.isPR,
          prType: s.prType
        }))
      }))
    };

    const updatedCheckins = [checkinData, ...checkins];
    setCheckins(updatedCheckins);
    let cloudSyncPending = false;

    if (user?.id) {
      if (navigator.onLine) {
        const res = await syncCheckinsToCloud(user.id, updatedCheckins);
        if (!res) {
          addToOfflineQueue({ type: 'checkins', userId: user.id, payload: updatedCheckins });
          cloudSyncPending = true;
        }
      } else {
        addToOfflineQueue({ type: 'checkins', userId: user.id, payload: updatedCheckins });
        cloudSyncPending = true;
      }
    }

    if (user?.id && isCloudEnabled()) {
      if (navigator.onLine) {
        const syncedPublicWorkout = await syncPublicWorkoutToCloud(checkinData, workoutVisibility);
        if (syncedPublicWorkout === null) {
          addToOfflineQueue({
            type: 'public_workout',
            payload: checkinData,
            visibility: workoutVisibility,
            notificationEvent: workoutVisibility === 'public'
              ? { type: 'followed_workout', eventId: String(checkinData.id) }
              : null
          });
          cloudSyncPending = true;
        } else if (workoutVisibility === 'public') {
          const notificationEvent = {
            type: 'followed_workout',
            eventId: String(checkinData.id)
          };
          await dispatchPushEventWithFeedback(
            notificationEvent,
            () => addToOfflineQueue({ type: 'notification_event', payload: notificationEvent })
          );
        }
      } else {
        addToOfflineQueue({
          type: 'public_workout',
          payload: checkinData,
          visibility: workoutVisibility,
          notificationEvent: workoutVisibility === 'public'
            ? { type: 'followed_workout', eventId: String(checkinData.id) }
            : null
        });
        cloudSyncPending = true;
      }
    }

    // Update routine notes if routine exists
    if (activeWorkout.routineId && activeWorkout.routineId !== 'free_workout') {
      const updatedRoutines = routines.map(r => {
        if (r.id === activeWorkout.routineId) {
          const updatedExercises = r.exercises.map(origEx => {
            const executedEx = activeWorkout.exercises.find(e => e.name === origEx.name);
            return executedEx ? { ...origEx, notes: executedEx.notes } : origEx;
          });
          return { ...r, exercises: updatedExercises };
        }
        return r;
      });
      setRoutines(updatedRoutines);
      if (user?.id) {
        if (navigator.onLine) {
          const syncedRoutines = await syncRoutinesToCloud(user.id, updatedRoutines);
          if (!syncedRoutines) {
            addToOfflineQueue({ type: 'routines', userId: user.id, payload: updatedRoutines });
            cloudSyncPending = true;
          }
        } else {
          addToOfflineQueue({ type: 'routines', userId: user.id, payload: updatedRoutines });
          cloudSyncPending = true;
        }
      }
    }

    const sharedCheckin = createSharedWorkout(checkinData, user?.privacy?.publicPRs === true);
    const feedItem = shouldShareWithGroups ? {
      id: generateId(),
      checkinId: checkinData.id,
      type: 'workout',
      userId: user?.id,
      userName: user?.name || 'Atleta',
      userAvatar: user?.avatar,
      routineName: activeWorkout.routineName,
      title: title || activeWorkout.routineName,
      date: checkinData.date,
      durationMinutes,
      totalVolumeKg: showWeights ? totalVolume : undefined,
      totalSets: completedSetsCount,
      totalReps: completedRepsCount,
      muscleStats: sharedCheckin.muscleStats,
      sharePRs: sharedCheckin.sharePRs,
      notes: notes || 'Treino finalizado com foco total!',
      photoUrl: checkinData.photoUrl,
      likes: 0,
      likedBy: [],
      visibility: workoutVisibility,
      isPublic: workoutVisibility === 'public',
      showWeights,
      showMuscleStats,
      exercises: sharedCheckin.exercises,
      comments: []
    } : null;
    await updateGroupsWithMemberMetrics(updatedCheckins, feedItem);

    activeWorkoutRef.current = null;
    setActiveWorkout(null);
    if (activeWorkoutStorageKey) {
      storage.remove(activeWorkoutStorageKey);
    }
    showToast(
      cloudSyncPending
        ? 'Treino salvo neste aparelho; sincronização com a nuvem pendente.'
        : 'Treino concluído e salvo com sucesso!',
      cloudSyncPending ? 'info' : 'success'
    );
    return checkinData;
  }, [activeWorkout, activeWorkoutStorageKey, user, checkins, routines, addToOfflineQueue, updateGroupsWithMemberMetrics]);

  // Log standalone or complementary Cardio
  const logCardio = useCallback(async ({
    date,
    durationMinutes = 30,
    cardioType = 'Corrida',
    distanceKm = 0,
    calories = 0,
    notes = '',
    photoUrl = null,
    shareToGroup = true
  }) => {
    const checkinData = {
      id: generateId(),
      type: 'cardio',
      isCardio: true,
      date: date || new Date().toISOString(),
      routineName: `Cardio: ${cardioType}`,
      title: `Cardio (${cardioType})`,
      durationMinutes: Number(durationMinutes) || 30,
      cardioType,
      distanceKm: Number(distanceKm) || 0,
      calories: Number(calories) || 0,
      totalVolumeKg: 0,
      totalSets: 0,
      totalReps: 0,
      muscleStats: {},
      photoUrl: photoUrl || null,
      notes: notes || 'Cardio finalizado com sucesso!',
      userId: user?.id,
      userName: user?.name || 'Atleta',
      userAvatar: user?.avatar,
      isPublic: true,
      showWeights: false,
      exercises: []
    };

    const updatedCheckins = [checkinData, ...checkins];
    setCheckins(updatedCheckins);

    if (user?.id) {
      if (navigator.onLine) {
        await syncCheckinsToCloud(user.id, updatedCheckins);
      } else {
        addToOfflineQueue({ type: 'checkins', userId: user.id, payload: updatedCheckins });
      }
    }

    if (shareToGroup) {
      const updatedGroups = allGroups.map(g => {
        const isMember = g.members?.some(m => m.id === user?.id);
        if (isMember) {
          const feedItem = {
            id: generateId(),
            type: 'cardio',
            userId: user?.id,
            userName: user?.name || 'Atleta',
            userAvatar: user?.avatar,
            routineName: `Cardio: ${cardioType}`,
            title: `Cardio Finalizado (${cardioType})`,
            date: new Date().toISOString(),
            durationMinutes: Number(durationMinutes) || 30,
            distanceKm: Number(distanceKm) || 0,
            calories: Number(calories) || 0,
            notes: notes || 'Sessão de cardio concluída!',
            photoUrl: checkinData.photoUrl,
            likes: 0,
            likedBy: [],
            comments: []
          };
          return { ...g, feed: [feedItem, ...(g.feed || [])] };
        }
        return g;
      });
      setAllGroups(updatedGroups);
      if (navigator.onLine) {
        await syncGroupsToCloud(updatedGroups);
      } else {
        addToOfflineQueue({ type: 'groups', payload: updatedGroups });
      }
    }

    showToast('Cardio salvo com sucesso!', 'success');
    return checkinData;
  }, [user, checkins, allGroups, addToOfflineQueue]);

  // ---- CHECK-INS ----
  const addCheckin = useCallback(async (checkin) => {
    const newCheckin = {
      id: generateId(),
      date: new Date().toISOString(),
      userId: user?.id,
      userName: user?.name,
      userAvatar: user?.avatar,
      ...checkin
    };

    const updated = [newCheckin, ...checkins];
    setCheckins(updated);
    if (user?.id) {
      if (navigator.onLine) {
        await syncCheckinsToCloud(user.id, updated);
      } else {
        addToOfflineQueue({ type: 'checkins', userId: user.id, payload: updated });
      }
    }
    await updateGroupsWithMemberMetrics(updated);
    return newCheckin;
  }, [user, checkins, addToOfflineQueue, updateGroupsWithMemberMetrics]);

  const deleteCheckin = useCallback(async (id) => {
    const deletedCheckin = checkins.find(checkin => checkin.id === id);
    let photoCleanupPending = false;
    if (deletedCheckin?.photoUrl?.includes('/public-workout-photos/')) {
      if (!navigator.onLine) {
        photoCleanupPending = true;
        addToOfflineQueue({ type: 'public_workout_photo_delete', photoUrl: deletedCheckin.photoUrl });
      } else {
        const photoRemoved = await deletePublicWorkoutPhoto(deletedCheckin.photoUrl);
        if (!photoRemoved) {
          photoCleanupPending = true;
          addToOfflineQueue({ type: 'public_workout_photo_delete', photoUrl: deletedCheckin.photoUrl });
        }
      }
    }

    const updated = recalculateWorkoutPRs(checkins.filter(c => c.id !== id));
    setCheckins(updated);
    if (user?.id) {
      if (navigator.onLine) {
        const synced = await syncCheckinsToCloud(user.id, updated);
        if (synced === null) addToOfflineQueue({ type: 'checkins', userId: user.id, payload: updated });
      } else {
        addToOfflineQueue({ type: 'checkins', userId: user.id, payload: updated });
      }
    }
    if (isCloudEnabled() && deletedCheckin) {
      if (navigator.onLine) {
        const removed = await deletePublicWorkoutFromCloud(deletedCheckin.id);
        if (removed === null) {
          addToOfflineQueue({ type: 'public_workout', payload: deletedCheckin, visibility: 'private' });
        }
        for (const workout of updated.filter(item => (
          item.type !== 'cardio' && !item.isCardio && getWorkoutVisibility(item) === 'public'
        ))) {
          const synced = await syncPublicWorkoutToCloud(workout, 'public');
          if (synced === null) {
            addToOfflineQueue({ type: 'public_workout', payload: workout, visibility: 'public' });
          }
        }
      } else {
        addToOfflineQueue({ type: 'public_workout', payload: deletedCheckin, visibility: 'private' });
        updated.filter(item => (
          item.type !== 'cardio' && !item.isCardio && getWorkoutVisibility(item) === 'public'
        )).forEach(workout => {
          addToOfflineQueue({ type: 'public_workout', payload: workout, visibility: 'public' });
        });
      }
    }
    await updateGroupsWithMemberMetrics(updated, null, deletedCheckin);
    showToast(
      photoCleanupPending
        ? 'Treino apagado. A remoção da foto será tentada novamente quando o armazenamento estiver disponível.'
        : 'Treino apagado do histórico e dos feeds.',
      photoCleanupPending ? 'info' : 'success'
    );
    return updated;
  }, [user, checkins, addToOfflineQueue, updateGroupsWithMemberMetrics]);

  const updateCheckinVisibility = useCallback(async (id, visibility) => {
    if (!['private', 'group', 'public'].includes(visibility)) return null;
    const checkin = checkins.find(item => item.id === id);
    if (!checkin || checkin.type === 'cardio' || checkin.isCardio) {
      showToast('Não foi possível alterar a visibilidade deste treino.', 'error');
      return null;
    }
    const shouldNotifyFollowers = visibility === 'public' && getWorkoutVisibility(checkin) !== 'public';

    let photoUrl = checkin.photoUrl;
    if (visibility !== 'public' && photoUrl?.includes('/public-workout-photos/')) {
      if (!navigator.onLine) {
        showToast('Conecte-se à internet para retirar a foto pública deste treino.', 'error');
        return null;
      }
      const photoRemoved = await deletePublicWorkoutPhoto(photoUrl);
      if (!photoRemoved) return null;
      photoUrl = null;
    }

    const updatedCheckin = {
      ...checkin,
      visibility,
      shareToGroup: visibility !== 'private',
      isPublic: visibility === 'public',
      sharePRs: user?.privacy?.publicPRs === true,
      photoUrl
    };
    const updatedCheckins = checkins.map(item => item.id === id ? updatedCheckin : item);
    setCheckins(updatedCheckins);
    if (user?.id) {
      if (navigator.onLine) {
        const synced = await syncCheckinsToCloud(user.id, updatedCheckins);
        if (synced === null) addToOfflineQueue({ type: 'checkins', userId: user.id, payload: updatedCheckins });
      } else {
        addToOfflineQueue({ type: 'checkins', userId: user.id, payload: updatedCheckins });
      }
    }

    if (user?.id && isCloudEnabled()) {
      if (navigator.onLine) {
        const synced = visibility === 'public'
          ? await syncPublicWorkoutToCloud(updatedCheckin, visibility)
          : await deletePublicWorkoutFromCloud(updatedCheckin.id);
        if (synced === null) {
          addToOfflineQueue({
            type: 'public_workout',
            payload: updatedCheckin,
            visibility,
            notificationEvent: shouldNotifyFollowers
              ? { type: 'followed_workout', eventId: String(updatedCheckin.id) }
              : null
          });
        } else if (shouldNotifyFollowers) {
          const notificationEvent = {
            type: 'followed_workout',
            eventId: String(updatedCheckin.id)
          };
          await dispatchPushEventWithFeedback(
            notificationEvent,
            () => addToOfflineQueue({ type: 'notification_event', payload: notificationEvent })
          );
        }
      } else {
        addToOfflineQueue({
          type: 'public_workout',
          payload: updatedCheckin,
          visibility,
          notificationEvent: shouldNotifyFollowers
            ? { type: 'followed_workout', eventId: String(updatedCheckin.id) }
            : null
        });
      }
    }

    const shareable = visibility === 'group' || visibility === 'public';
    const sharedCheckin = createSharedWorkout(updatedCheckin, user?.privacy?.publicPRs === true);
    const feedItem = shareable ? {
      id: generateId(),
      checkinId: updatedCheckin.id,
      type: 'workout',
      userId: user.id,
      userName: updatedCheckin.userName || user.name || 'Atleta',
      userAvatar: updatedCheckin.userAvatar || user.avatar,
      routineName: updatedCheckin.routineName,
      title: updatedCheckin.title || updatedCheckin.routineName,
      date: updatedCheckin.date,
      durationMinutes: updatedCheckin.durationMinutes,
      totalVolumeKg: updatedCheckin.showWeights === false ? undefined : updatedCheckin.totalVolumeKg,
      totalSets: updatedCheckin.totalSets,
      totalReps: updatedCheckin.totalReps,
      muscleStats: sharedCheckin.muscleStats,
      sharePRs: sharedCheckin.sharePRs,
      notes: updatedCheckin.notes,
      photoUrl: updatedCheckin.photoUrl,
      likes: 0,
      likedBy: [],
      visibility,
      isPublic: visibility === 'public',
      showWeights: updatedCheckin.showWeights,
      showMuscleStats: updatedCheckin.showMuscleStats,
      exercises: sharedCheckin.exercises,
      comments: []
    } : null;

    const updatedGroups = allGroups.map(group => {
      const isMember = (group.members || []).some(member => member.id === user.id);
      const feed = (group.feed || []).filter(post => (
        post.checkinId
          ? post.checkinId !== id
          : !(post.type === 'workout' && post.userId === user.id && post.date === checkin.date)
      ));
      const hadPost = feed.length !== (group.feed || []).length;
      if (!isMember && !hadPost) return group;
      return {
        ...group,
        feed: [...(feedItem && isMember ? [feedItem] : []), ...feed]
      };
    });
    setAllGroups(updatedGroups);
    if (isCloudEnabled()) {
      if (navigator.onLine) {
        const synced = await syncGroupsToCloud(updatedGroups);
        if (synced === null) addToOfflineQueue({ type: 'groups', payload: updatedGroups });
      } else {
        addToOfflineQueue({ type: 'groups', payload: updatedGroups });
      }
    }
    return updatedCheckin;
  }, [checkins, user, allGroups, addToOfflineQueue]);

  // =========================================================================
  // 5. GROUPS SYSTEM & MANAGEMENT (PERMISSIONS, LEAVE, DELETE, PROMOTE, KICK)
  // =========================================================================
  const createGroup = useCallback(async (groupData) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let inviteCode = '';
    for (let i = 0; i < 6; i++) {
      inviteCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const creatorMember = {
      id: user?.id || 'usr_' + Date.now(),
      name: user?.name || 'Atleta',
      username: user?.username || 'atleta',
      avatar: user?.avatar || null,
      role: 'admin',
      isCreator: true,
      weeklyGoal: user?.weeklyGoal || 4,
      weeklyCheckins: 0,
      streak: 0,
      joinedAt: new Date().toISOString()
    };

    const newGroup = {
      ...groupData,
      id: 'grp_' + generateId(),
      name: groupData.name.trim(),
      description: groupData.description?.trim() || 'Comunidade de treinos Overgain',
      photoUrl: groupData.photoUrl || null,
      category: groupData.category || 'Geral',
      isPrivate: groupData.isPrivate || false,
      pin: groupData.pin || null,
      inviteCode: groupData.inviteCode || inviteCode,
      createdBy: user?.id,
      createdAt: new Date().toISOString(),
      members: groupData.members && groupData.members.length > 0 ? groupData.members : [creatorMember],
      feed: groupData.feed || []
    };

    const updatedGroups = [newGroup, ...allGroups.filter(g => g.id !== newGroup.id)];
    setAllGroups(updatedGroups);

    if (isCloudEnabled() && navigator.onLine) {
      const syncedGroups = await syncGroupToCloud(newGroup);
      if (syncedGroups === null) {
        setAllGroups(currentGroups => currentGroups.filter(group => group.id !== newGroup.id));
        return null;
      }
    } else {
      if (!navigator.onLine) {
        addToOfflineQueue({ type: 'groups', payload: updatedGroups });
      }
    }

    showToast(`Grupo "${newGroup.name}" criado com sucesso!`, 'success');
    return newGroup;
  }, [user, allGroups, addToOfflineQueue]);

  const joinGroup = useCallback(async (rawInput, memberProfile, pin) => {
    if (!rawInput) return { success: false, error: 'Código de convite inválido.' };

    let cleaned = String(rawInput).trim();
    if (cleaned.includes('join=')) {
      cleaned = cleaned.split('join=')[1].split('&')[0];
    } else if (cleaned.includes('/groups/')) {
      cleaned = cleaned.split('/groups/')[1].split('?')[0].split('/')[0];
    }

    const normalizedCode = cleaned.replace(/^OG[-_]/i, '').replace(/[\s-]/g, '').toUpperCase();

    const newMember = memberProfile || {
      id: user?.id || 'usr_' + Date.now(),
      name: user?.name || 'Atleta',
      username: user?.username || 'atleta',
      avatar: user?.avatar || null,
      role: 'member',
      weeklyGoal: user?.weeklyGoal || 4,
      weeklyCheckins: 0,
      streak: 0,
      joinedAt: new Date().toISOString()
    };

    if (isCloudEnabled() && !navigator.onLine) {
      return { success: false, error: 'Conecte-se à internet para entrar neste grupo.' };
    }

    const cloudGroups = isCloudEnabled() ? await fetchCloudGroups() : allGroups;
    if (!Array.isArray(cloudGroups)) {
      return {
        success: false,
        error: 'Não foi possível carregar os grupos da nuvem. Verifique a conexão e tente novamente.'
      };
    }
    const currentGroups = cloudGroups.length > 0 ? cloudGroups : allGroups;

    let targetGroup = currentGroups.find(g => {
      const gCode = (g.inviteCode || '').toUpperCase();
      const gId = (g.id || '').toUpperCase();
      return gCode === normalizedCode || gId === normalizedCode || gCode === cleaned.toUpperCase() || g.id === cleaned;
    });

    if (!targetGroup) {
      return { success: false, error: 'Grupo não encontrado. Verifique o código com o criador!' };
    }

    if (targetGroup.isPrivate && !targetGroup.pin) {
      return { success: false, error: 'Este grupo privado ainda não tem uma senha configurada. Fale com o administrador.' };
    }

    if (targetGroup.pin && targetGroup.pin !== pin) {
      return { success: false, error: 'Credenciais incorretas. Verifique o código do grupo e a senha de acesso.' };
    }

    let updatedGroup;
    if (isCloudEnabled()) {
      const { data, error } = await supabase.rpc('join_group_with_invite', {
        p_invite_code: targetGroup.inviteCode || normalizedCode,
        p_pin: pin || null,
        p_member: {
          name: newMember.name,
          username: newMember.username,
          avatar: newMember.avatar || null,
          weeklyGoal: newMember.weeklyGoal || 4
        }
      });

      if (error) {
        console.error('Erro ao entrar no grupo pelo convite:', error);
        if (error.message?.includes('INVALID_GROUP_PIN')) {
          return { success: false, error: 'Credenciais incorretas. Verifique o código do grupo e a senha de acesso.' };
        }
        if (error.message?.includes('GROUP_PIN_REQUIRED')) {
          return { success: false, error: 'Este grupo privado ainda não tem uma senha configurada. Fale com o administrador.' };
        }
        if (error.message?.includes('GROUP_NOT_FOUND')) {
          return { success: false, error: 'Grupo não encontrado. Verifique o código com o criador!' };
        }
        if (error.code === 'PGRST202') {
          return { success: false, error: 'Atualize o schema do Supabase executando o arquivo supabase_schema.sql para habilitar a entrada por convite.' };
        }
        return { success: false, error: 'Não foi possível entrar no grupo agora. Verifique sua conexão e tente novamente.' };
      }

      if (!data || data.id !== targetGroup.id) {
        console.error('Resposta inválida ao entrar no grupo:', data);
        return { success: false, error: 'Não foi possível confirmar sua entrada no grupo. Tente novamente.' };
      }
      updatedGroup = data;
    } else {
      const memberExists = (targetGroup.members || []).some(m => m.id === newMember.id);
      updatedGroup = memberExists
        ? targetGroup
        : { ...targetGroup, members: [...(targetGroup.members || []), newMember] };
    }

    const updatedGroups = currentGroups.map(g => g.id === targetGroup.id ? updatedGroup : g);

    setAllGroups(updatedGroups);

    showToast(`Você entrou no grupo "${updatedGroup.name || targetGroup.name}"!`, 'success');
    return { success: true, group: updatedGroup };
  }, [user, allGroups]);

  // Leave group (Membro sai do grupo)
  const leaveGroup = useCallback(async (groupId) => {
    if (!user?.id) return false;
    const group = allGroups.find(item => String(item.id) === String(groupId));
    if (!group) return false;

    const currentMember = (group.members || []).find(member => String(member.id) === String(user.id));
    const isCreator = String(group.createdBy || group.created_by || '') === String(user.id)
      || currentMember?.isCreator;
    if (isCreator) {
      showToast('O criador não pode sair do grupo. Exclua o grupo nas opções para removê-lo.', 'error');
      return false;
    }

    const isMember = Boolean(currentMember);
    if (!isMember) {
      showToast('Você não faz mais parte deste grupo.', 'info');
      return false;
    }

    if (isCloudEnabled()) {
      if (!navigator.onLine) {
        showToast('Conecte-se à internet para sair do grupo.', 'error');
        return false;
      }

      const updatedGroup = await leaveCloudGroup(groupId);
      if (!updatedGroup || updatedGroup.members.some(member => String(member.id) === String(user.id))) {
        if (updatedGroup) {
          console.error('O Supabase não confirmou a saída do grupo:', groupId);
        }
        showToast('Não foi possível sair do grupo. Verifique a conexão e se a função leave_group do supabase_schema.sql foi executada no Supabase.', 'error', 6000);
        return false;
      }
    }

    setAllGroups(currentGroups => currentGroups.filter(item => String(item.id) !== String(groupId)));
    showToast('Você saiu do grupo.', 'success');
    return true;
  }, [user?.id, allGroups]);

  // Delete group permanently (Criador exclui o grupo)
  const deleteGroup = useCallback(async (groupId) => {
    const updatedGroups = allGroups.filter(g => g.id !== groupId);
    setAllGroups(updatedGroups);
    if (navigator.onLine) {
      await syncGroupsToCloud(updatedGroups);
    } else {
      addToOfflineQueue({ type: 'groups', payload: updatedGroups });
    }
    showToast('Grupo excluído definitivamente.', 'info');
  }, [allGroups, addToOfflineQueue]);

  // Promote Member to Admin
  const promoteMember = useCallback(async (groupId, memberId) => {
    const updatedGroups = allGroups.map(g => {
      if (g.id === groupId) {
        const updatedMembers = (g.members || []).map(m => m.id === memberId ? { ...m, role: 'admin' } : m);
        return { ...g, members: updatedMembers };
      }
      return g;
    });
    setAllGroups(updatedGroups);
    if (navigator.onLine) {
      await syncGroupsToCloud(updatedGroups);
    } else {
      addToOfflineQueue({ type: 'groups', payload: updatedGroups });
    }
    showToast('Membro promovido a Administrador!', 'success');
  }, [allGroups, addToOfflineQueue]);

  // Demote Member to regular Member
  const demoteMember = useCallback(async (groupId, memberId) => {
    const updatedGroups = allGroups.map(g => {
      if (g.id === groupId) {
        const updatedMembers = (g.members || []).map(m => m.id === memberId ? { ...m, role: 'member' } : m);
        return { ...g, members: updatedMembers };
      }
      return g;
    });
    setAllGroups(updatedGroups);
    if (navigator.onLine) {
      await syncGroupsToCloud(updatedGroups);
    } else {
      addToOfflineQueue({ type: 'groups', payload: updatedGroups });
    }
    showToast('Administrador rebaixado a membro.', 'info');
  }, [allGroups, addToOfflineQueue]);

  // Kick / Remove Member from Group
  const kickMember = useCallback(async (groupId, memberId) => {
    const updatedGroups = allGroups.map(g => {
      if (g.id === groupId) {
        const updatedMembers = (g.members || []).filter(m => m.id !== memberId);
        return { ...g, members: updatedMembers };
      }
      return g;
    });
    setAllGroups(updatedGroups);
    if (navigator.onLine) {
      await syncGroupsToCloud(updatedGroups);
    } else {
      addToOfflineQueue({ type: 'groups', payload: updatedGroups });
    }
    showToast('Membro removido do grupo.', 'info');
  }, [allGroups, addToOfflineQueue]);

  // Transfer Ownership of Group
  const transferGroupOwnership = useCallback(async (groupId, newOwnerId) => {
    const updatedGroups = allGroups.map(g => {
      if (g.id === groupId) {
        const updatedMembers = (g.members || []).map(m => {
          if (m.id === newOwnerId) return { ...m, role: 'admin', isCreator: true };
          if (m.id === user?.id) return { ...m, role: 'admin', isCreator: false };
          return m;
        });
        return {
          ...g,
          createdBy: newOwnerId,
          members: updatedMembers
        };
      }
      return g;
    });
    setAllGroups(updatedGroups);
    if (navigator.onLine) {
      await syncGroupsToCloud(updatedGroups);
    } else {
      addToOfflineQueue({ type: 'groups', payload: updatedGroups });
    }
    showToast('Posse do grupo transferida com sucesso!', 'success');
  }, [user?.id, allGroups, addToOfflineQueue]);

  // =========================================================================
  // 6. FEED COMMENTS & LIKES (WITH DIRECT CLOUD PERSISTENCE)
  // =========================================================================
  const addGroupFeedItem = useCallback(async (groupId, feedItem) => {
    const item = {
      id: generateId(),
      type: 'workout',
      date: new Date().toISOString(),
      userId: user?.id,
      userName: user?.name || 'Atleta',
      userAvatar: user?.avatar,
      likes: 0,
      likedBy: [],
      comments: [],
      ...feedItem
    };

    const updatedGroups = allGroups.map(g => {
      if (g.id === groupId) {
        return { ...g, feed: [item, ...(g.feed || [])] };
      }
      return g;
    });

    setAllGroups(updatedGroups);
    const notificationEvent = {
      type: 'group_workout',
      groupId: String(groupId),
      eventId: String(item.id)
    };

    if (isCloudEnabled() && navigator.onLine) {
      const synced = await syncGroupsToCloud(updatedGroups);
      if (synced === null) {
        addToOfflineQueue({ type: 'groups', payload: updatedGroups, notificationEvent });
      } else {
        await dispatchPushEventWithFeedback(
          notificationEvent,
          () => addToOfflineQueue({ type: 'notification_event', payload: notificationEvent })
        );
      }
    } else if (isCloudEnabled()) {
      addToOfflineQueue({ type: 'groups', payload: updatedGroups, notificationEvent });
    } else if (!navigator.onLine) {
      addToOfflineQueue({ type: 'groups', payload: updatedGroups });
    }
    return item;
  }, [user, allGroups, addToOfflineQueue]);

  const deleteGroupFeedPost = useCallback(async (groupId, postId) => {
    const group = allGroups.find(item => item.id === groupId);
    const post = group?.feed?.find(item => item.id === postId);
    if (!post || post.userId !== user?.id || (post.type && post.type !== 'workout')) {
      showToast('Só é possível apagar seus próprios treinos do grupo.', 'error');
      return false;
    }

    const updatedGroups = allGroups.map(item => (
      item.id === groupId
        ? { ...item, feed: (item.feed || []).filter(feedPost => feedPost.id !== postId) }
        : item
    ));
    setAllGroups(updatedGroups);
    if (isCloudEnabled() && navigator.onLine) {
      const synced = await syncGroupsToCloud(updatedGroups);
      if (synced === null) addToOfflineQueue({ type: 'groups', payload: updatedGroups });
    } else if (!navigator.onLine) {
      addToOfflineQueue({ type: 'groups', payload: updatedGroups });
    }
    return true;
  }, [allGroups, user?.id, addToOfflineQueue]);

  const toggleFeedPostLike = useCallback(async (groupId, postId) => {
    if (!user?.id) return;
    const updatedGroups = allGroups.map(g => {
      if (g.id === groupId) {
        const updatedFeed = (g.feed || []).map(post => {
          if (post.id === postId) {
            const likedBy = post.likedBy || [];
            const alreadyLiked = likedBy.includes(user.id);
            const newLikedBy = alreadyLiked
              ? likedBy.filter(id => id !== user.id)
              : [...likedBy, user.id];
            return {
              ...post,
              likes: newLikedBy.length,
              likedBy: newLikedBy
            };
          }
          return post;
        });
        return { ...g, feed: updatedFeed };
      }
      return g;
    });

    if (navigator.onLine && isCloudEnabled()) {
      const synced = await syncGroupsToCloud(updatedGroups);
      if (synced === null) return false;
    } else if (!navigator.onLine) {
      addToOfflineQueue({ type: 'groups', payload: updatedGroups });
    }
    setAllGroups(updatedGroups);
    return true;
  }, [user?.id, allGroups, addToOfflineQueue]);

  const addFeedPostComment = useCallback(async (groupId, postId, commentText) => {
    if (!commentText || !commentText.trim() || !user?.id) return;
    const comment = {
      id: generateId(),
      userId: user.id,
      userName: user.name || 'Atleta',
      userAvatar: user.avatar,
      text: commentText.trim(),
      date: new Date().toISOString()
    };

    const updatedGroups = allGroups.map(g => {
      if (g.id === groupId) {
        const updatedFeed = (g.feed || []).map(post => {
          if (post.id === postId) {
            return {
              ...post,
              comments: [...(post.comments || []), comment]
            };
          }
          return post;
        });
        return { ...g, feed: updatedFeed };
      }
      return g;
    });

    if (navigator.onLine && isCloudEnabled()) {
      const synced = await syncGroupsToCloud(updatedGroups);
      if (synced === null) return null;
    } else if (!navigator.onLine) {
      addToOfflineQueue({ type: 'groups', payload: updatedGroups });
    }
    setAllGroups(updatedGroups);
    showToast('Comentário publicado!', 'success');
    return comment;
  }, [user, allGroups, addToOfflineQueue]);

  // ---- MESSAGES SYSTEM ----
  const sendMessage = useCallback(async (groupId, messageData) => {
    if (!user?.id || !groupId) {
      showToast('Entre na sua conta para enviar mensagens ao grupo.', 'error');
      return null;
    }

    const newMessage = {
      id: generateId(),
      groupId,
      userId: user?.id,
      userName: user?.name || 'Atleta',
      userAvatar: user?.avatar,
      timestamp: new Date().toISOString(),
      ...messageData
    };

    const currentGroupMsgs = allMessages.filter(m => m.groupId === groupId);
    const updatedGroupMsgs = [...currentGroupMsgs, newMessage];
    const notificationEvent = {
      type: 'group_message',
      groupId: String(groupId),
      eventId: String(newMessage.id)
    };

    setAllMessages(prev => [...prev.filter(m => m.groupId !== groupId), ...updatedGroupMsgs]);

    if (navigator.onLine && isCloudEnabled()) {
      const synced = await syncMessagesToCloud(groupId, updatedGroupMsgs);
      if (!synced) {
        setAllMessages(prev => prev.filter(message => message.id !== newMessage.id));
        showToast('A mensagem não foi enviada. Verifique sua conexão e tente novamente.', 'error');
        return null;
      }
      await dispatchPushEventWithFeedback(
        notificationEvent,
        () => addToOfflineQueue({ type: 'notification_event', payload: notificationEvent })
      );
    } else if (!navigator.onLine) {
      addToOfflineQueue({ type: 'messages', groupId, payload: updatedGroupMsgs, notificationEvent });
    } else {
      setAllMessages(prev => prev.filter(message => message.id !== newMessage.id));
      showToast('O chat em nuvem não está configurado neste dispositivo.', 'error');
      return null;
    }
    return newMessage;
  }, [user, allMessages, addToOfflineQueue]);

  const deleteMessageForEveryone = useCallback(async (groupId, messageId) => {
    const message = allMessages.find(item => item.groupId === groupId && item.id === messageId);
    if (!message || message.userId !== user?.id || message.deleted) {
      showToast('Só é possível apagar suas próprias mensagens.', 'error');
      return null;
    }

    const currentGroupMessages = allMessages.filter(item => item.groupId === groupId);
    const deletedMessage = {
      ...message,
      text: '',
      imagePath: null,
      imageUrl: null,
      deleted: true,
      deletedAt: new Date().toISOString()
    };
    const updatedGroupMessages = currentGroupMessages.map(item => item.id === messageId ? deletedMessage : item);
    setAllMessages(prev => [...prev.filter(item => item.groupId !== groupId), ...updatedGroupMessages]);

    if (navigator.onLine && isCloudEnabled()) {
      const synced = await syncMessagesToCloud(groupId, updatedGroupMessages);
      if (synced === null) {
        setAllMessages(prev => [...prev.filter(item => item.groupId !== groupId), ...currentGroupMessages]);
        showToast('Não foi possível apagar a mensagem para todos.', 'error');
        return null;
      }
    } else if (!navigator.onLine) {
      addToOfflineQueue({ type: 'messages', groupId, payload: updatedGroupMessages });
    } else {
      setAllMessages(prev => [...prev.filter(item => item.groupId !== groupId), ...currentGroupMessages]);
      showToast('O chat em nuvem não está configurado neste dispositivo.', 'error');
      return null;
    }

    if (message.imagePath && navigator.onLine && isCloudEnabled()) {
      const removed = await deleteGroupChatImage(message.imagePath);
      if (removed === null) addToOfflineQueue({ type: 'chat_image_delete', path: message.imagePath });
    } else if (message.imagePath && !navigator.onLine) {
      addToOfflineQueue({ type: 'chat_image_delete', path: message.imagePath });
    }
    return deletedMessage;
  }, [allMessages, user?.id, addToOfflineQueue]);

  const refreshGroupMessages = useCallback(async (groupId) => {
    if (!groupId || !user?.id || !isCloudEnabled()) return [];
    const cloudMessages = await fetchCloudMessages(groupId);
    setAllMessages(prev => {
      const localMessages = prev.filter(message => message.groupId === groupId);
      const cloudIds = new Set(cloudMessages.map(message => message.id));
      const pendingLocalMessages = localMessages.filter(message => (
        message.userId === user.id && !cloudIds.has(message.id)
      ));
      const mergedMessages = [...cloudMessages, ...pendingLocalMessages]
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      return [
        ...prev.filter(message => message.groupId !== groupId),
        ...mergedMessages
      ];
    });
    return cloudMessages;
  }, [user?.id]);

  const getGroupMessages = useCallback((groupId) => {
    return allMessages.filter(m => m.groupId === groupId);
  }, [allMessages]);

  // ---- SCHEDULE ----
  const updateWeeklySchedule = useCallback(async (newSchedule) => {
    setWeeklySchedule(newSchedule);
    if (user?.id) {
      if (navigator.onLine) {
        await syncScheduleToCloud(user.id, newSchedule);
      } else {
        addToOfflineQueue({ type: 'schedule', userId: user.id, payload: newSchedule });
      }
    }
  }, [user?.id, addToOfflineQueue]);

  // Filter groups user is currently a member of
  const myGroups = allGroups.filter(g => g.members?.some(m => m.id === user?.id));

  return (
    <DataContext.Provider value={{
      routines,
      cardioRoutines,
      checkins,
      groups: myGroups,
      allGroups,
      messages: allMessages,
      weeklySchedule,
      activeWorkout,
      isActiveWorkoutLoaded,
      isDataLoading,
      isOnline,
      addRoutine,
      updateRoutine,
      deleteRoutine,
      duplicateRoutine,
      reorderRoutineExercises,
      addCardioRoutine,
      updateCardioRoutine,
      deleteCardioRoutine,
      startActiveWorkout,
      updateActiveWorkout,
      cancelActiveWorkout,
      finishActiveWorkout,
      logCardio,
      updateWeeklySchedule,
      addCheckin,
      deleteCheckin,
      updateCheckinVisibility,
      createGroup,
      joinGroup,
      leaveGroup,
      deleteGroup,
      promoteMember,
      demoteMember,
      kickMember,
      transferGroupOwnership,
      addGroupFeedItem,
      deleteGroupFeedPost,
      toggleFeedPostLike,
      addFeedPostComment,
      sendMessage,
      deleteMessageForEveryone,
      refreshGroupMessages,
      getGroupMessages,
      syncWithCloud,
      processOfflineQueue
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
}

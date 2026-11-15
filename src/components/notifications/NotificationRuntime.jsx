import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { showToast } from '../../contexts/ToastContext';
import {
  initializeForegroundNotifications,
  isNativeAndroidNotifications,
  startWorkoutOngoingNotification,
  stopWorkoutOngoingNotification
} from '../../lib/notificationService';

export default function NotificationRuntime() {
  const { user } = useAuth();
  const { activeWorkout, isActiveWorkoutLoaded } = useData();
  const [activationVersion, setActivationVersion] = useState(0);
  const activeWorkoutIdRef = useRef(null);
  const shownWorkoutIdRef = useRef(null);
  const startingWorkoutIdRef = useRef(null);
  const failedWorkoutAttemptRef = useRef(null);

  useEffect(() => {
    const handleNotificationsEnabled = () => setActivationVersion(version => version + 1);
    window.addEventListener('overgain:notifications-enabled', handleNotificationsEnabled);
    return () => window.removeEventListener('overgain:notifications-enabled', handleNotificationsEnabled);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    initializeForegroundNotifications().catch(error => {
      console.error('Não foi possível iniciar os listeners de notificação:', error);
    });
  }, [user?.id, activationVersion]);

  useEffect(() => {
    if (!isNativeAndroidNotifications() || !isActiveWorkoutLoaded) return;

    if (!activeWorkout) {
      activeWorkoutIdRef.current = null;
      startingWorkoutIdRef.current = null;
      failedWorkoutAttemptRef.current = null;
      if (shownWorkoutIdRef.current) {
        shownWorkoutIdRef.current = null;
        stopWorkoutOngoingNotification().catch(error => {
          console.error('Não foi possível remover a notificação do treino:', error);
        });
      }
      return;
    }

    const workoutId = activeWorkout.id;
    activeWorkoutIdRef.current = workoutId;
    if (shownWorkoutIdRef.current === workoutId || startingWorkoutIdRef.current === workoutId) return;
    if (
      failedWorkoutAttemptRef.current?.id === workoutId
      && failedWorkoutAttemptRef.current.version === activationVersion
    ) return;

    startingWorkoutIdRef.current = workoutId;
    startWorkoutOngoingNotification(activeWorkout)
      .then(() => {
        if (activeWorkoutIdRef.current === workoutId) {
          shownWorkoutIdRef.current = workoutId;
        } else {
          return stopWorkoutOngoingNotification();
        }
      })
      .catch(error => {
        console.error('Não foi possível mostrar a notificação do treino:', error);
        failedWorkoutAttemptRef.current = { id: workoutId, version: activationVersion };
        if (activeWorkoutIdRef.current === workoutId) {
          showToast('Permita notificações no Android para manter o treino visível em segundo plano.', 'info', 6000);
        }
      })
      .finally(() => {
        if (startingWorkoutIdRef.current === workoutId) {
          startingWorkoutIdRef.current = null;
        }
      });
  }, [
    activeWorkout,
    isActiveWorkoutLoaded,
    activationVersion
  ]);

  return null;
}

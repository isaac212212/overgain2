import { Capacitor, registerPlugin } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { isCloudEnabled, supabase } from './supabase';
import { showToast } from '../contexts/ToastContext';

const WorkoutNotification = registerPlugin('WorkoutNotification');

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  groupMessages: true,
  groupWorkouts: true,
  followedWorkouts: true
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
let nativeListenersReady = false;
let nativeRegistrationWaiter = null;
let webMessagingPromise = null;
let webMessageListenerReady = false;

const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const hasWebPushConfig = () => Boolean(
  firebaseConfig.apiKey
  && firebaseConfig.projectId
  && firebaseConfig.messagingSenderId
  && firebaseConfig.appId
  && vapidKey
);

export const isWebPushConfigured = hasWebPushConfig;
export const isNativeAndroidNotifications = isAndroidApp;

export const loadNotificationPreferences = async (userId) => {
  if (!isCloudEnabled() || !userId) {
    throw new Error('Entre na sua conta para carregar as preferências de notificação.');
  }
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('group_messages,group_workouts,followed_workouts')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;

  return {
    groupMessages: data?.group_messages ?? DEFAULT_NOTIFICATION_PREFERENCES.groupMessages,
    groupWorkouts: data?.group_workouts ?? DEFAULT_NOTIFICATION_PREFERENCES.groupWorkouts,
    followedWorkouts: data?.followed_workouts ?? DEFAULT_NOTIFICATION_PREFERENCES.followedWorkouts
  };
};

export const saveNotificationPreferences = async (userId, preferences) => {
  if (!isCloudEnabled() || !userId) {
    throw new Error('Entre na sua conta para salvar as preferências de notificação.');
  }
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({
      user_id: userId,
      group_messages: Boolean(preferences.groupMessages),
      group_workouts: Boolean(preferences.groupWorkouts),
      followed_workouts: Boolean(preferences.followedWorkouts),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  if (error) throw error;
};

const saveDeviceToken = async (token, platform) => {
  if (!isCloudEnabled() || !token) {
    throw new Error('Não foi possível registrar este dispositivo na nuvem.');
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error('Entre na sua conta para ativar notificações.');

  const { error } = await supabase
    .from('notification_devices')
    .upsert({
      user_id: userId,
      token,
      platform,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,token' });
  if (error) throw error;
};

const showPushRoute = (route) => {
  if (typeof route === 'string' && route.startsWith('/') && !route.startsWith('//')) {
    window.location.assign(route);
  }
};

const ensureNativeListeners = async () => {
  if (nativeListenersReady) return;

  await Promise.all([
    PushNotifications.addListener('registration', async ({ value }) => {
      try {
        await saveDeviceToken(value, 'android');
        nativeRegistrationWaiter?.resolve();
      } catch (error) {
        nativeRegistrationWaiter?.reject(error);
        console.error('Não foi possível salvar o token push do Android:', error);
      }
    }),
    PushNotifications.addListener('registrationError', ({ error }) => {
      nativeRegistrationWaiter?.reject(new Error(error || 'Falha ao registrar o push no Android.'));
    }),
    PushNotifications.addListener('pushNotificationReceived', notification => {
      showToast(notification.body || notification.title || 'Nova notificação do Overgain.', 'info', 5000);
    }),
    PushNotifications.addListener('pushNotificationActionPerformed', action => {
      showPushRoute(action.notification?.data?.route);
    })
  ]);
  nativeListenersReady = true;
};

const getWebMessaging = async () => {
  if (!hasWebPushConfig()) {
    throw new Error('Configure as variáveis públicas do Firebase Web no arquivo .env para ativar notificações no navegador.');
  }
  if (!webMessagingPromise) {
    webMessagingPromise = (async () => {
      const messagingModule = await import('@firebase/messaging');
      if (!await messagingModule.isSupported()) {
        throw new Error('Este navegador não oferece suporte a notificações push.');
      }
      const appModule = await import('@firebase/app');
      const app = appModule.getApps().find(item => item.name === 'overgain-push')
        || appModule.initializeApp(firebaseConfig, 'overgain-push');
      return {
        messaging: messagingModule.getMessaging(app),
        messagingModule
      };
    })().catch(error => {
      webMessagingPromise = null;
      throw error;
    });
  }
  return webMessagingPromise;
};

const getWebPushWorkerRegistration = async () => {
  const configQuery = encodeURIComponent(JSON.stringify(firebaseConfig));
  const workerUrl = `/push-notifications/firebase-messaging-sw.js?config=${configQuery}`;
  const registration = await navigator.serviceWorker.register(workerUrl, {
    scope: '/push-notifications/'
  });
  const worker = registration.installing || registration.waiting || registration.active;
  if (worker && worker.state !== 'activated') {
    await new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => reject(new Error('O Service Worker de notificações não ativou.')), 15000);
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') {
          window.clearTimeout(timeoutId);
          resolve();
        } else if (worker.state === 'redundant') {
          window.clearTimeout(timeoutId);
          reject(new Error('O Service Worker de notificações não pôde ser instalado.'));
        }
      });
    });
  }
  return registration;
};

export const initializeForegroundNotifications = async () => {
  if (isAndroidApp()) {
    await ensureNativeListeners();
    const permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'granted') await PushNotifications.register();
    return;
  }
  if (
    typeof window === 'undefined'
    || typeof Notification === 'undefined'
    || Notification.permission !== 'granted'
    || !hasWebPushConfig()
  ) {
    return;
  }

  const [{ messaging, messagingModule }, registration] = await Promise.all([
    getWebMessaging(),
    getWebPushWorkerRegistration()
  ]);
  if (!webMessageListenerReady) {
    messagingModule.onMessage(messaging, payload => {
      const body = payload.notification?.body || payload.data?.body || 'Há uma nova atividade no Overgain.';
      showToast(body, 'info', 5000);
    });
    webMessageListenerReady = true;
  }
  const token = await messagingModule.getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration
  });
  if (token) await saveDeviceToken(token, 'web');
};

export const enablePushNotifications = async () => {
  if (!isCloudEnabled()) {
    throw new Error('Configure o Supabase e execute o schema atualizado antes de ativar notificações.');
  }

  if (isAndroidApp()) {
    await ensureNativeListeners();
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== 'granted') {
      throw new Error('Permita notificações nas configurações do Android para continuar.');
    }

    await PushNotifications.createChannel({
      id: 'overgain_social',
      name: 'Atividades do Overgain',
      description: 'Mensagens e treinos compartilhados',
      importance: 4,
      vibration: true
    });

    const registrationPromise = new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        nativeRegistrationWaiter = null;
        reject(new Error('O Firebase não retornou um token para este Android.'));
      }, 20000);
      nativeRegistrationWaiter = {
        resolve: () => {
          window.clearTimeout(timeoutId);
          nativeRegistrationWaiter = null;
          resolve();
        },
        reject: error => {
          window.clearTimeout(timeoutId);
          nativeRegistrationWaiter = null;
          reject(error);
        }
      };
    });
    try {
      await PushNotifications.register();
    } catch (error) {
      nativeRegistrationWaiter?.reject(error);
    }
    await registrationPromise;
  } else {
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('Notification' in window)) {
      throw new Error('Notificações do navegador exigem HTTPS e suporte a Service Worker.');
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Permita notificações no navegador para continuar.');
    }

    const registration = await getWebPushWorkerRegistration();
    const { messaging, messagingModule } = await getWebMessaging();
    const token = await messagingModule.getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration
    });
    if (!token) throw new Error('O Firebase não retornou um token para este navegador.');
    await saveDeviceToken(token, 'web');
    await initializeForegroundNotifications();
  }

  window.dispatchEvent(new Event('overgain:notifications-enabled'));
};

export const dispatchPushEvent = async (event) => {
  if (!isCloudEnabled()) return false;
  try {
    const { error } = await supabase.functions.invoke('send-notification', { body: event });
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Não foi possível disparar as notificações push:', error);
    return false;
  }
};

export const startWorkoutOngoingNotification = async (workout) => {
  if (!isAndroidApp()) return;
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== 'granted') {
    throw new Error('Permissão de notificação negada.');
  }
  await WorkoutNotification.show({
    routineName: workout.routineName || 'Treino Livre',
    startedAt: Number(workout.startTime) || Date.now()
  });
};

export const stopWorkoutOngoingNotification = async () => {
  if (!isAndroidApp()) return;
  await WorkoutNotification.dismiss();
};

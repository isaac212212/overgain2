importScripts('https://www.gstatic.com/firebasejs/13.3.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.3.0/firebase-messaging-compat.js');

const serializedConfig = new URL(self.location.href).searchParams.get('config');

if (serializedConfig) {
  try {
    firebase.initializeApp(JSON.parse(serializedConfig));
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage(payload => {
      if (payload.notification) return;

      const title = payload.data?.title || 'Overgain';
      return self.registration.showNotification(title, {
        body: payload.data?.body || 'Há uma nova atividade no Overgain.',
        icon: '/pwa-192x192.png',
        data: { route: payload.data?.route || '/' }
      });
    });
  } catch (error) {
    console.error('Não foi possível iniciar o push do Firebase na web:', error);
  }
}

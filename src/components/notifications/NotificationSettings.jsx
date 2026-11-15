import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BellRing, MessageCircle, Users, Dumbbell } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isCloudEnabled } from '../../lib/supabase';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  enablePushNotifications,
  isWebPushConfigured,
  loadNotificationPreferences,
  saveNotificationPreferences
} from '../../lib/notificationService';
import { showToast } from '../../contexts/ToastContext';
import Button from '../ui/Button';
import Card from '../ui/Card';
import './NotificationSettings.css';

const PREFERENCE_ITEMS = [
  {
    key: 'groupMessages',
    label: 'Mensagens dos meus grupos',
    description: 'Receba um aviso quando alguém enviar mensagem.',
    icon: MessageCircle
  },
  {
    key: 'groupWorkouts',
    label: 'Treinos publicados nos meus grupos',
    description: 'Saiba quando um membro compartilhar um treino.',
    icon: Users
  },
  {
    key: 'followedWorkouts',
    label: 'Treinos de quem eu sigo',
    description: 'Receba avisos de novos treinos públicos.',
    icon: Dumbbell
  }
];

export default function NotificationSettings() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState(DEFAULT_NOTIFICATION_PREFERENCES);
  const [preferenceLoad, setPreferenceLoad] = useState({ userId: null, error: '' });
  const [isEnabling, setIsEnabling] = useState(false);
  const [savingPreference, setSavingPreference] = useState(null);
  const isCloudReady = isCloudEnabled() && Boolean(user?.id);
  const isLoading = isCloudReady && preferenceLoad.userId !== user.id;
  const loadError = !isCloudReady
    ? 'Entre na sua conta e conecte o Supabase para configurar notificações.'
    : preferenceLoad.userId === user.id
      ? preferenceLoad.error
      : '';

  useEffect(() => {
    let active = true;
    if (!isCloudReady) return () => { active = false; };
    loadNotificationPreferences(user.id)
      .then(data => {
        if (active) {
          setPreferences(data);
          setPreferenceLoad({ userId: user.id, error: '' });
        }
      })
      .catch(error => {
        console.error('Não foi possível carregar as preferências de notificação:', error);
        if (active) {
          setPreferenceLoad({
            userId: user.id,
            error: 'Execute o schema atualizado do Supabase para ativar as notificações.'
          });
        }
      });

    return () => { active = false; };
  }, [isCloudReady, user?.id]);

  const handleEnableNotifications = async () => {
    setIsEnabling(true);
    try {
      await enablePushNotifications();
      showToast('Notificações ativadas neste aparelho.', 'success');
    } catch (error) {
      console.error('Não foi possível ativar as notificações:', error);
      showToast(error.message || 'Não foi possível ativar as notificações.', 'error', 6000);
    } finally {
      setIsEnabling(false);
    }
  };

  const handlePreferenceChange = async (key, value) => {
    const previous = preferences;
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    setSavingPreference(key);
    try {
      await saveNotificationPreferences(user.id, updated);
      showToast('Preferência de notificação atualizada.', 'success');
    } catch (error) {
      console.error('Não foi possível salvar a preferência de notificação:', error);
      setPreferences(previous);
      showToast('Não foi possível salvar a preferência. Verifique o schema do Supabase.', 'error');
    } finally {
      setSavingPreference(null);
    }
  };

  const webPushReady = isWebPushConfigured();

  return (
    <Card className="settings-card notification-settings-card" padding="lg">
      <div className="settings-card-header-icon">
        <BellRing size={20} className="text-accent" />
        <div>
          <h2 className="settings-card-title">Notificações</h2>
          <p className="settings-card-desc">
            No Android, o treino em andamento permanece visível na área de notificações.
            Ative o push para receber mensagens e novos treinos mesmo com o app fechado.
          </p>
        </div>
      </div>

      <div className="notification-enable-row">
        <div>
          <strong>Este aparelho</strong>
          <p className="settings-card-desc">
            {webPushReady || Capacitor.isNativePlatform()
              ? 'Permita notificações para registrar este aparelho.'
              : 'No navegador, configure Firebase Web e use o app em HTTPS.'}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          icon={BellRing}
          loading={isEnabling}
          disabled={!isCloudReady}
          onClick={handleEnableNotifications}
        >
          Ativar notificações
        </Button>
      </div>

      {loadError && <p className="notification-settings-error" role="status">{loadError}</p>}

      <div className="notification-preferences-list">
        {PREFERENCE_ITEMS.map(({ key, label, description, icon: Icon }) => (
          <label className="notification-preference-row" key={key}>
            <span className="notification-preference-icon"><Icon size={18} /></span>
            <span className="notification-preference-copy">
              <strong>{label}</strong>
              <span>{description}</span>
            </span>
            <input
              type="checkbox"
              checked={preferences[key]}
              disabled={!isCloudReady || isLoading || savingPreference !== null}
              onChange={event => handlePreferenceChange(key, event.target.checked)}
              aria-label={label}
            />
          </label>
        ))}
      </div>
    </Card>
  );
}

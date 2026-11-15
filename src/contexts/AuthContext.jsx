import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { DEFAULT_WEEKLY_SCHEDULE } from '../utils/initialData';
import { DEFAULT_PROFILE_VISIBILITY } from '../utils/profilePrivacy';
import { 
  supabase, 
  isCloudEnabled, 
  syncFullAccountToCloud, 
  syncMeasurementsToCloud, 
  fetchCloudMeasurements, 
  fetchCloudAccount,
  isUsernameOrNameTaken,
  syncScheduleToCloud
} from '../lib/supabase';
import { showToast } from './ToastContext';

const AuthContext = createContext();

const getAuthErrorMessage = (err, fallback) => {
  const message = (err?.message || '').toLowerCase();
  const isMissingAccountSchema =
    (err?.code === '42703' && message.includes('profiles.')) ||
    err?.code === 'PGRST204' ||
    err?.code === 'PGRST205';

  if (isMissingAccountSchema) {
    return 'O banco do Supabase está sem partes do schema do Overgain. No painel do Supabase, execute o arquivo supabase_schema.sql no SQL Editor e tente novamente.';
  }

  return err?.message || fallback;
};

export function AuthProvider({ children }) {
  // Current active user
  const [user, setUser] = useState(null);
  const [pendingUser, setPendingUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Supabase Auth State Change Listener & Cloud Session Verification
  useEffect(() => {
    let timeoutId = null;
    let isCancelled = false;

    // Safety timeout in case network is very slow
    timeoutId = setTimeout(() => {
      if (!isCancelled) {
        setIsLoading(false);
      }
    }, 2500);

    const initAuthSession = async () => {
      try {
        if (isCloudEnabled() && supabase?.auth?.getSession) {
          const { data, error } = await supabase.auth.getSession();
          if (!isCancelled && !error && data?.session?.user) {
            const supaUser = data.session.user;
            const supaUserId = supaUser.id;

            // Fetch full account profile & measurements directly from Supabase
            const [cloudAcc, cloudMeasurements] = await Promise.all([
              fetchCloudAccount(supaUserId),
              fetchCloudMeasurements(supaUserId)
            ]);

            const emailNorm = supaUser.email?.toLowerCase() || '';
            const activeAcc = cloudAcc || {};

            const loggedUser = {
              id: supaUserId,
              name: activeAcc.name || supaUser.user_metadata?.name || emailNorm.split('@')[0] || 'Atleta',
              username: activeAcc.username || supaUser.user_metadata?.username || emailNorm.split('@')[0] || 'atleta',
              email: emailNorm,
              avatar: activeAcc.avatar || supaUser.user_metadata?.avatar_url || null,
              gender: activeAcc.gender || supaUser.user_metadata?.gender || 'Masculino',
              weeklyGoal: activeAcc.weeklyGoal || Number(supaUser.user_metadata?.weekly_goal) || 4,
              weeklySchedule: activeAcc.weeklySchedule || DEFAULT_WEEKLY_SCHEDULE,
              onboarded: activeAcc.onboarded !== undefined ? activeAcc.onboarded : true,
              measurementsHistory: (cloudMeasurements && cloudMeasurements.length > 0) ? cloudMeasurements : (activeAcc.measurementsHistory || []),
              privacy: activeAcc.privacy || {
                publicMeasurements: false,
                publicRoutines: true,
                publicWeights: false,
                publicPRs: false,
                publicRoutineWeights: false,
                profileVisibility: DEFAULT_PROFILE_VISIBILITY
              },
              updatedAt: new Date().toISOString()
            };

            setUser(loggedUser);
          }
        }
      } catch (err) {
        console.error('Erro na verificação de sessão do Supabase:', err);
      } finally {
        if (!isCancelled) {
          clearTimeout(timeoutId);
          setIsLoading(false);
        }
      }
    };

    initAuthSession();

    // Listen for auth state changes
    let authSub = null;
    try {
      if (isCloudEnabled() && supabase?.auth?.onAuthStateChange) {
        const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'SIGNED_OUT') {
            setUser(null);
          } else if (event === 'SIGNED_IN' && session?.user) {
            const uid = session.user.id;
            const [cloudAcc, cloudMeasurements] = await Promise.all([
              fetchCloudAccount(uid),
              fetchCloudMeasurements(uid)
            ]);
            if (cloudAcc) {
              setUser({
                ...cloudAcc,
                measurementsHistory: cloudMeasurements || cloudAcc.measurementsHistory || []
              });
            }
          }
        });
        authSub = data?.subscription;
      }
    } catch (e) {
      console.warn('Auth state change subscription error:', e);
    }

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (authSub?.unsubscribe) authSub.unsubscribe();
    };
  }, []);

  // Login with Google through Supabase OAuth
  const loginWithGoogle = async () => {
    if (!isCloudEnabled()) {
      return { success: false, error: 'Supabase não está configurado.' };
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  };

  // Login exclusively through Supabase Auth.
  const loginWithEmail = async (email, password) => {
    const emailNorm = email.trim().toLowerCase();

    if (!isCloudEnabled()) {
      return { success: false, error: 'Supabase não está configurado. Verifique a conexão do app.' };
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailNorm,
        password
      });
      if (error) {
        const authErrorMessage = (error.message || '').toLowerCase();
        if (authErrorMessage.includes('email not confirmed') || authErrorMessage.includes('email_not_confirmed')) {
          return { success: false, error: 'Sua conta foi criada, mas o e-mail ainda não foi confirmado. Abra a mensagem de confirmação enviada pelo Supabase (verifique também o spam) e tente entrar novamente.' };
        }
        if (error.code === 'invalid_credentials' || authErrorMessage.includes('invalid login credentials')) {
          return { success: false, error: 'Credenciais incorretas. Verifique seu e-mail e sua senha.' };
        }
        return { success: false, error: getAuthErrorMessage(error, 'Falha ao entrar. Tente novamente.') };
      }
      if (!data?.user) {
        return { success: false, error: 'Não foi possível iniciar a sessão. Tente novamente.' };
      }

      const [cloudAcc, cloudMeasurements] = await Promise.all([
        fetchCloudAccount(data.user.id),
        fetchCloudMeasurements(data.user.id)
      ]);
      const loggedUser = {
        id: data.user.id,
        name: cloudAcc?.name || data.user.user_metadata?.name || emailNorm.split('@')[0],
        username: cloudAcc?.username || data.user.user_metadata?.username || emailNorm.split('@')[0],
        email: emailNorm,
        avatar: cloudAcc?.avatar || data.user.user_metadata?.avatar_url || null,
        gender: cloudAcc?.gender || data.user.user_metadata?.gender || 'Masculino',
        weeklyGoal: cloudAcc?.weeklyGoal || Number(data.user.user_metadata?.weekly_goal) || 4,
        weeklySchedule: cloudAcc?.weeklySchedule || DEFAULT_WEEKLY_SCHEDULE,
        privacy: cloudAcc?.privacy || {
          publicMeasurements: false,
          publicRoutines: true,
          publicWeights: false,
          publicPRs: false,
          publicRoutineWeights: false,
          profileVisibility: DEFAULT_PROFILE_VISIBILITY
        },
        measurementsHistory: cloudMeasurements || cloudAcc?.measurementsHistory || [],
        onboarded: cloudAcc?.onboarded !== false,
        updatedAt: new Date().toISOString()
      };

      await syncFullAccountToCloud(loggedUser);
      setUser(loggedUser);
      setPendingUser(null);
      return { success: true, user: loggedUser };
    } catch (err) {
      console.error('Supabase signIn error:', err);
      return { success: false, error: getAuthErrorMessage(err, 'Falha ao entrar. Tente novamente.') };
    }
  };

  // Register with Email & Password (direct Supabase Auth signUp + Cloud user_data sync)
  const registerWithEmail = async (email, password, name, gender = 'Masculino', weeklyGoal = 4) => {
    const emailNorm = email.trim().toLowerCase();
    const cleanName = (name || emailNorm.split('@')[0]).trim();
    const cleanUsername = cleanName.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20);

    if (!isCloudEnabled()) {
      return { success: false, error: 'Supabase não está configurado. Verifique a conexão do app.' };
    }
    try {
      const takenCheck = await isUsernameOrNameTaken(cleanName, cleanUsername);
      if (takenCheck.isTaken) {
        return { success: false, error: takenCheck.message };
      }

      const { data, error } = await supabase.auth.signUp({
        email: emailNorm,
        password,
        options: {
          data: {
            name: cleanName,
            username: cleanUsername,
            gender: gender || 'Masculino',
            weekly_goal: Number(weeklyGoal) || 4
          }
        }
      });

      if (error) {
        const message = (error.message || '').toLowerCase();
        if (message.includes('already registered') || message.includes('already exists')) {
          return { success: false, error: 'Este e-mail já está cadastrado. Faça login na sua conta.' };
        }
        return { success: false, error: error.message || 'Erro ao criar conta.' };
      }

      if (!data?.user) {
        return { success: false, error: 'O Supabase não retornou o usuário criado.' };
      }
      if (!data.session) {
        return {
          success: false,
          needsEmailConfirmation: true,
          error: 'Conta criada. Confirme seu e-mail pelo link enviado antes de entrar.'
        };
      }

      const newUser = {
        id: data.user.id,
        name: cleanName,
        username: cleanUsername,
        email: emailNorm,
        avatar: null,
        gender: gender || 'Masculino',
        weeklyGoal: Number(weeklyGoal) || 4,
        onboarded: true,
        weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
        privacy: {
          publicMeasurements: false,
          publicRoutines: true,
          publicWeights: false,
          publicPRs: false,
          publicRoutineWeights: false,
          profileVisibility: DEFAULT_PROFILE_VISIBILITY
        },
        measurementsHistory: [],
        createdAt: new Date().toISOString()
      };

      await syncFullAccountToCloud(newUser);
      const scheduleSync = await syncScheduleToCloud(newUser.id, DEFAULT_WEEKLY_SCHEDULE);
      if (!scheduleSync) {
        throw new Error('A conta foi criada, mas não foi possível inicializar a programação vazia. Atualize o schema do Supabase e tente entrar novamente.');
      }
      setUser(newUser);
      setPendingUser(null);
      return { success: true, user: newUser };
    } catch (err) {
      console.error('Supabase signUp exception:', err);
      return { success: false, error: getAuthErrorMessage(err, 'Erro ao criar conta. Tente novamente.') };
    }
  };

  // Complete onboarding
  const completeOnboarding = async (profileData) => {
    const base = pendingUser || user || {};
    const targetName = (profileData.name || base.name || 'Atleta').trim();
    const targetUsername = profileData.username || (profileData.name || 'atleta').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20);

    const takenCheck = await isUsernameOrNameTaken(targetName, targetUsername, base.id);
    if (takenCheck.isTaken) {
      return {
        success: false,
        error: takenCheck.message || 'Este nome de perfil já está em uso por outro atleta. Escolha outro.'
      };
    }

    const finalUser = {
      ...base,
      name: targetName,
      username: targetUsername,
      avatar: profileData.avatar || base.avatar || null,
      gender: profileData.gender || base.gender || 'Masculino',
      weeklyGoal: Number(profileData.weeklyGoal || base.weeklyGoal) || 4,
      onboarded: true,
      updatedAt: new Date().toISOString()
    };

    setUser(finalUser);
    setPendingUser(null);

    await syncFullAccountToCloud(finalUser);

    return { success: true, user: finalUser };
  };

  // Update profile
  const updateProfile = async (profileData) => {
    if (!user) return { success: false, error: 'Usuário não autenticado.' };

    const targetName = profileData.name !== undefined ? profileData.name.trim() : user.name;
    const targetUsername = profileData.username !== undefined ? profileData.username.trim() : user.username;

    const nameChanged = targetName && targetName.toLowerCase() !== (user.name || '').toLowerCase();
    const userChanged = targetUsername && targetUsername.toLowerCase() !== (user.username || '').toLowerCase();

    if (nameChanged || userChanged) {
      const takenCheck = await isUsernameOrNameTaken(targetName, targetUsername, user.id);
      if (takenCheck.isTaken) {
        return {
          success: false,
          error: takenCheck.message || 'Este nome de perfil já está em uso por outro atleta. Escolha outro.'
        };
      }
    }

    const updated = { 
      ...user, 
      ...profileData, 
      name: targetName, 
      username: targetUsername, 
      updatedAt: new Date().toISOString() 
    };

    setUser(updated);
    await syncFullAccountToCloud(updated);
    return { success: true, user: updated };
  };

  // Add measurement (DIRECT SUPABASE PERSISTENCE)
  const addMeasurement = async (measurement) => {
    if (!user) return;
    const newEntry = {
      id: 'm_' + Date.now().toString(36),
      date: measurement.date || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      ...measurement
    };
    const updatedHistory = [newEntry, ...(user.measurementsHistory || [])];
    const updated = {
      ...user,
      measurementsHistory: updatedHistory
    };
    setUser(updated);

    await syncMeasurementsToCloud(user.id, updatedHistory);
    await syncFullAccountToCloud(updated);
  };

  // Update PIN
  const updatePin = async (newPin) => {
    if (!user) return;
    const updated = { ...user, pin: newPin || null, updatedAt: new Date().toISOString() };
    setUser(updated);
    await syncFullAccountToCloud(updated);
  };

  // Update password
  const updatePassword = async (newPassword) => {
    if (!user || !isCloudEnabled()) {
      return { success: false, error: 'Usuário não autenticado.' };
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      console.error('Supabase password update exception:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  // Update Privacy
  const updatePrivacy = async (privacyUpdates) => {
    if (!user) return;
    const updated = {
      ...user,
      privacy: { ...user.privacy, ...privacyUpdates }
    };
    setUser(updated);
    await syncFullAccountToCloud(updated);
  };

  // Update weekly goal
  const updateWeeklyGoal = async (goal) => {
    if (!user) return;
    const updated = { ...user, weeklyGoal: Number(goal) || 4 };
    setUser(updated);
    await syncFullAccountToCloud(updated);
  };

  // Logout
  const logout = async () => {
    try {
      if (isCloudEnabled() && supabase?.auth?.signOut) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.error('Supabase signOut exception:', e);
    }
    setUser(null);
    setPendingUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      pendingUser,
      isAuthenticated: Boolean(user && user.onboarded),
      isOnboarded: Boolean(user && user.onboarded),
      isLoading,
      loginWithGoogle,
      loginWithEmail,
      registerWithEmail,
      completeOnboarding,
      updateProfile,
      addMeasurement,
      updatePin,
      updatePassword,
      updatePrivacy,
      updateWeeklyGoal,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

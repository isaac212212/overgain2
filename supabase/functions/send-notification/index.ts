import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type EventType = 'group_message' | 'group_workout' | 'followed_workout';
type PushEvent = { type: EventType; eventId: string; groupId?: string };

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

const jsonResponse = (status: number, body: Record<string, unknown>) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
);

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const getGoogleAccessToken = async (serviceAccount: {
  client_email: string;
  private_key: string;
}) => {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = toBase64Url(encoder.encode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: issuedAt,
    exp: issuedAt + 3600,
  })));
  const unsignedToken = `${header}.${claims}`;
  const pem = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const keyBytes = Uint8Array.from(atob(pem), character => character.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    encoder.encode(unsignedToken),
  ));
  const assertion = `${unsignedToken}.${toBase64Url(signature)}`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error('O Google não autorizou o envio FCM.');
  }

  cachedAccessToken = {
    value: tokenData.access_token,
    expiresAt: Date.now() + Number(tokenData.expires_in || 3600) * 1000,
  };
  return cachedAccessToken.value;
};

const resolveEvent = async (
  admin: ReturnType<typeof createClient>,
  senderId: string,
  event: PushEvent,
) => {
  if (event.type === 'followed_workout') {
    const { data: workout, error } = await admin
      .from('public_workouts')
      .select('id,user_id,payload')
      .eq('id', event.eventId)
      .maybeSingle();
    if (error) throw error;
    if (!workout || workout.user_id !== senderId) {
      return { status: 403, error: 'Treino público inválido para este usuário.' } as const;
    }

    const { data: follows, error: followsError } = await admin
      .from('user_follows')
      .select('follower_id')
      .eq('following_id', senderId);
    if (followsError) throw followsError;
    const senderName = String(workout.payload?.userName || 'Alguém que você segue').slice(0, 80);
    return {
      recipients: [...new Set((follows || []).map(item => item.follower_id))],
      preferenceColumn: 'followed_workouts',
      title: 'Novo treino de quem você segue',
      body: `${senderName} publicou um treino.`,
      route: `/dashboard?workout=${encodeURIComponent(String(workout.id))}`,
    } as const;
  }

  if (!event.groupId) return { status: 400, error: 'O grupo é obrigatório.' } as const;
  const { data: groupRow, error: groupError } = await admin
    .from('groups')
    .select('name,created_by,payload')
    .eq('id', event.groupId)
    .maybeSingle();
  if (groupError) throw groupError;
  if (!groupRow) return { status: 404, error: 'Grupo não encontrado.' } as const;

  const group = groupRow.payload || {};
  const members: Array<{ id?: string }> = Array.isArray(group.members) ? group.members : [];
  const memberIds = members.map(member => String(member.id || '')).filter(Boolean);
  if (groupRow.created_by !== senderId && !memberIds.includes(senderId)) {
    return { status: 403, error: 'O autor não pertence a este grupo.' } as const;
  }

  if (event.type === 'group_message') {
    const { data: message, error } = await admin
      .from('group_messages')
      .select('user_id,payload')
      .eq('id', event.eventId)
      .eq('group_id', event.groupId)
      .maybeSingle();
    if (error) throw error;
    if (!message || message.user_id !== senderId) {
      return { status: 403, error: 'Mensagem inválida para este usuário.' } as const;
    }

    const senderName = String(message.payload?.userName || 'Um membro').slice(0, 80);
    return {
      recipients: [...new Set(memberIds.filter(id => id !== senderId))],
      preferenceColumn: 'group_messages',
      title: `Mensagem em ${String(groupRow.name || 'seu grupo').slice(0, 80)}`,
      body: `${senderName} enviou uma mensagem.`,
      route: `/groups/${encodeURIComponent(event.groupId)}?tab=chat`,
    } as const;
  }

  const groupFeed = Array.isArray(group.feed) ? group.feed : [];
  const post = groupFeed.find((item: { id?: string }) => String(item.id) === event.eventId);
  if (!post || post.userId !== senderId || (post.type && post.type !== 'workout')) {
    return { status: 403, error: 'Publicação de treino inválida para este usuário.' } as const;
  }
  const senderName = String(post.userName || 'Um membro').slice(0, 80);
  return {
    recipients: [...new Set(memberIds.filter(id => id !== senderId))],
    preferenceColumn: 'group_workouts',
    title: `Treino novo em ${String(groupRow.name || 'seu grupo').slice(0, 80)}`,
    body: `${senderName} compartilhou um treino.`,
    route: `/groups/${encodeURIComponent(event.groupId)}?workout=${encodeURIComponent(event.eventId)}`,
  } as const;
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Método não permitido.' });

  const authorization = request.headers.get('Authorization');
  if (!authorization) return jsonResponse(401, { error: 'Autenticação obrigatória.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const firebaseServiceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !firebaseServiceAccountJson) {
    return jsonResponse(500, { error: 'A configuração segura do serviço push está incompleta.' });
  }

  try {
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse(401, { error: 'Sessão inválida.' });

    const event = await request.json() as PushEvent;
    if (
      !event
      || !['group_message', 'group_workout', 'followed_workout'].includes(event.type)
      || typeof event.eventId !== 'string'
      || !event.eventId
      || (event.type !== 'followed_workout' && typeof event.groupId !== 'string')
    ) {
      return jsonResponse(400, { error: 'Evento de notificação inválido.' });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const resolved = await resolveEvent(admin, userData.user.id, event);
    if ('status' in resolved) return jsonResponse(resolved.status, { error: resolved.error });
    if (resolved.recipients.length === 0) return jsonResponse(200, { sent: 0 });

    const { data: preferences, error: preferencesError } = await admin
      .from('notification_preferences')
      .select('user_id,group_messages,group_workouts,followed_workouts')
      .in('user_id', resolved.recipients);
    if (preferencesError) throw preferencesError;
    const preferenceMap = new Map((preferences || []).map(item => [item.user_id, item]));
    const eligibleUserIds = resolved.recipients.filter(userId => (
      preferenceMap.get(userId)?.[resolved.preferenceColumn] ?? true
    ));
    if (eligibleUserIds.length === 0) return jsonResponse(200, { sent: 0 });

    const { data: devices, error: devicesError } = await admin
      .from('notification_devices')
      .select('user_id,token')
      .in('user_id', eligibleUserIds);
    if (devicesError) throw devicesError;
    if (!devices?.length) return jsonResponse(200, { sent: 0 });

    const serviceAccount = JSON.parse(firebaseServiceAccountJson);
    const accessToken = await getGoogleAccessToken(serviceAccount);
    const projectId = serviceAccount.project_id;
    const appBaseUrl = (Deno.env.get('APP_BASE_URL') || 'https://overgain.vercel.app').replace(/\/+$/, '');
    let sent = 0;
    const invalidTokens: string[] = [];

    const results = await Promise.all((devices || []).map(async device => {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: device.token,
              data: {
                type: event.type,
                title: resolved.title,
                body: resolved.body,
                route: resolved.route,
              },
              android: {
                priority: 'HIGH',
                notification: {
                  title: resolved.title,
                  body: resolved.body,
                  channel_id: 'overgain_social',
                  click_action: 'FCM_PLUGIN_ACTIVITY',
                },
              },
              webpush: {
                headers: { Urgency: 'high' },
                notification: {
                  title: resolved.title,
                  body: resolved.body,
                  icon: `${appBaseUrl}/pwa-192x192.png`,
                },
                fcm_options: { link: `${appBaseUrl}${resolved.route}` },
              },
            },
          }),
        },
      );
      if (response.ok) return { sent: 1 };

      const errorBody = await response.json().catch(() => ({}));
      const errorText = JSON.stringify(errorBody);
      if (errorText.includes('UNREGISTERED') || errorText.includes('registration-token-not-registered')) {
        invalidTokens.push(device.token);
      }
      console.error('FCM rejeitou uma notificação:', response.status, errorBody);
      return { sent: 0 };
    }));

    sent = results.reduce((total, result) => total + result.sent, 0);
    if (invalidTokens.length > 0) {
      const { error: deleteError } = await admin
        .from('notification_devices')
        .delete()
        .in('token', invalidTokens);
      if (deleteError) console.error('Não foi possível remover tokens FCM expirados:', deleteError);
    }

    return jsonResponse(200, { sent });
  } catch (error) {
    console.error('Falha ao processar notificação push:', error);
    return jsonResponse(500, { error: 'Não foi possível enviar as notificações.' });
  }
});

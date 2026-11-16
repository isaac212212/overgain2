-- ==============================================================================
-- OVERGAIN - SUPABASE DATABASE SCHEMA WITH AUTOMATIC USER PROFILES & RLS
-- Execute este script completo no SQL Editor do seu projeto Supabase.
-- Este script prepara o esquema, mas nao apaga usuarios nem dados existentes.
-- ==============================================================================

-- 1. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABELA DE PERFIS DE USUÁRIO (PROFILES)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  username TEXT,
  avatar_url TEXT,
  weekly_goal INTEGER DEFAULT 4,
  streak INTEGER DEFAULT 0,
  weekly_streak INTEGER DEFAULT 0,
  gender TEXT DEFAULT 'Masculino',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS weekly_goal INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'Masculino',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- RLS: Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Perfis públicos são visíveis por todos" ON public.profiles;
DROP POLICY IF EXISTS "Usuários podem gerenciar seus próprios perfis" ON public.profiles;
DROP POLICY IF EXISTS "Usuários podem inserir seus próprios perfis" ON public.profiles;
DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios perfis" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profile." ON public.profiles;
CREATE POLICY "Perfis públicos são visíveis por todos"
  ON public.profiles FOR SELECT
  USING (true);
CREATE POLICY "Usuários podem inserir seus próprios perfis"
  ON public.profiles FOR INSERT
  WITH CHECK (id::text = auth.uid()::text);
CREATE POLICY "Usuários podem atualizar seus próprios perfis"
  ON public.profiles FOR UPDATE
  USING (id::text = auth.uid()::text)
  WITH CHECK (id::text = auth.uid()::text);

-- Follow relationships are public to authenticated users for profile counts.
CREATE TABLE IF NOT EXISTS public.user_follows (
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários autenticados podem ver seguimentos" ON public.user_follows;
CREATE POLICY "Usuários autenticados podem ver seguimentos"
  ON public.user_follows FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários podem seguir a partir da própria conta" ON public.user_follows;
CREATE POLICY "Usuários podem seguir a partir da própria conta"
  ON public.user_follows FOR INSERT
  WITH CHECK (
    follower_id = auth.uid()
    AND follower_id <> following_id
  );

DROP POLICY IF EXISTS "Usuários podem remover seus próprios seguimentos" ON public.user_follows;
CREATE POLICY "Usuários podem remover seus próprios seguimentos"
  ON public.user_follows FOR DELETE
  USING (follower_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_follows_following_id
  ON public.user_follows(following_id);

-- Preferências e destinos das notificações push.
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  group_messages BOOLEAN NOT NULL DEFAULT TRUE,
  group_workouts BOOLEAN NOT NULL DEFAULT TRUE,
  followed_workouts BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários gerenciam as próprias preferências de notificação"
  ON public.notification_preferences;
CREATE POLICY "Usuários gerenciam as próprias preferências de notificação"
  ON public.notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.notification_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'web')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_notification_devices_user_id
  ON public.notification_devices(user_id);

ALTER TABLE public.notification_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários gerenciam os próprios dispositivos de notificação"
  ON public.notification_devices;
CREATE POLICY "Usuários gerenciam os próprios dispositivos de notificação"
  ON public.notification_devices FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Treinos compartilhados com todas as pessoas autenticadas.
CREATE TABLE IF NOT EXISTS public.public_workouts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.public_workouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários autenticados visualizam treinos públicos" ON public.public_workouts;
CREATE POLICY "Usuários autenticados visualizam treinos públicos"
  ON public.public_workouts FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários publicam seus próprios treinos" ON public.public_workouts;
CREATE POLICY "Usuários publicam seus próprios treinos"
  ON public.public_workouts FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Usuários atualizam seus próprios treinos públicos" ON public.public_workouts;
CREATE POLICY "Usuários atualizam seus próprios treinos públicos"
  ON public.public_workouts FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Usuários removem seus próprios treinos públicos" ON public.public_workouts;
CREATE POLICY "Usuários removem seus próprios treinos públicos"
  ON public.public_workouts FOR DELETE
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_public_workouts_created_at
  ON public.public_workouts(created_at DESC);

CREATE TABLE IF NOT EXISTS public.public_workout_likes (
  workout_id TEXT NOT NULL REFERENCES public.public_workouts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workout_id, user_id)
);

ALTER TABLE public.public_workout_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários autenticados veem curtidas públicas" ON public.public_workout_likes;
CREATE POLICY "Usuários autenticados veem curtidas públicas"
  ON public.public_workout_likes FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários curtem como a própria conta" ON public.public_workout_likes;
CREATE POLICY "Usuários curtem como a própria conta"
  ON public.public_workout_likes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Usuários removem a própria curtida" ON public.public_workout_likes;
CREATE POLICY "Usuários removem a própria curtida"
  ON public.public_workout_likes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_public_workout_likes_workout
  ON public.public_workout_likes(workout_id);

CREATE TABLE IF NOT EXISTS public.public_workout_comments (
  id TEXT PRIMARY KEY,
  workout_id TEXT NOT NULL REFERENCES public.public_workouts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.public_workout_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários autenticados veem comentários públicos" ON public.public_workout_comments;
CREATE POLICY "Usuários autenticados veem comentários públicos"
  ON public.public_workout_comments FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários comentam como a própria conta" ON public.public_workout_comments;
CREATE POLICY "Usuários comentam como a própria conta"
  ON public.public_workout_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Usuários removem seus próprios comentários" ON public.public_workout_comments;
CREATE POLICY "Usuários removem seus próprios comentários"
  ON public.public_workout_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_public_workout_comments_workout
  ON public.public_workout_comments(workout_id, created_at);

-- 3. TABELA DE DADOS DO USUÁRIO (ROUTINES, CARDIO ROUTINES, SCHEDULE, MEASUREMENTS, ACCOUNT DATA)
CREATE TABLE IF NOT EXISTS public.user_data (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_key TEXT NOT NULL, -- 'routines', 'cardio_routines', 'schedule', 'measurements', 'account_data'
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, data_key)
);

-- RLS: user_data
ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários gerenciam apenas seus dados" ON public.user_data;
CREATE POLICY "Usuários gerenciam apenas seus dados"
  ON public.user_data FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. TABELA DE BATE-PONTOS E CHECK-INS (TREINOS E CARDIOS)
CREATE TABLE IF NOT EXISTS public.checkins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT DEFAULT 'workout', -- 'workout' ou 'cardio'
  routine_name TEXT,
  title TEXT,
  date TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  total_volume_kg NUMERIC DEFAULT 0,
  photo_url TEXT,
  notes TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: checkins
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Checkins visíveis por todos os membros" ON public.checkins;
CREATE POLICY "Checkins visíveis por todos os membros"
  ON public.checkins FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Usuários gerenciam seus próprios checkins" ON public.checkins;
CREATE POLICY "Usuários gerenciam seus próprios checkins"
  ON public.checkins FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- 5. TABELA DE GRUPOS
CREATE TABLE IF NOT EXISTS public.groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  invite_code TEXT NOT NULL,
  photo_url TEXT,
  pin TEXT,
  category TEXT DEFAULT 'Geral',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  payload JSONB
);

-- RLS: groups
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Grupos visíveis para busca e membros" ON public.groups;
CREATE POLICY "Grupos visíveis para busca e membros"
  ON public.groups FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Membros e criadores gerenciam grupos" ON public.groups;
CREATE POLICY "Membros e criadores gerenciam grupos"
  ON public.groups FOR ALL
  USING (
    created_by = auth.uid()::text
    OR payload->'members' @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
  )
  WITH CHECK (
    created_by = auth.uid()::text
    OR payload->'members' @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
  );

CREATE OR REPLACE FUNCTION public.join_group_with_invite(
  p_invite_code TEXT,
  p_pin TEXT,
  p_member JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_group public.groups%ROWTYPE;
  v_members JSONB;
  v_member JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT *
  INTO v_group
  FROM public.groups
  WHERE upper(invite_code) = upper(regexp_replace(trim(p_invite_code), '^OG[-_]?', '', 'i'))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND';
  END IF;

  IF COALESCE(v_group.payload->>'isPrivate', 'false') = 'true' AND v_group.pin IS NULL THEN
    RAISE EXCEPTION 'GROUP_PIN_REQUIRED';
  END IF;

  IF v_group.pin IS NOT NULL AND v_group.pin IS DISTINCT FROM NULLIF(trim(p_pin), '') THEN
    RAISE EXCEPTION 'INVALID_GROUP_PIN';
  END IF;

  v_members := COALESCE(v_group.payload->'members', '[]'::jsonb);

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_members) AS group_member(value)
    WHERE value->>'id' = v_user_id::text
  ) THEN
    RETURN v_group.payload;
  END IF;

  v_member := jsonb_build_object(
    'id', v_user_id::text,
    'name', left(COALESCE(NULLIF(trim(p_member->>'name'), ''), 'Atleta'), 80),
    'username', left(COALESCE(NULLIF(trim(p_member->>'username'), ''), 'atleta'), 30),
    'avatar', COALESCE(p_member->'avatar', 'null'::jsonb),
    'role', 'member',
    'isCreator', false,
    'weeklyGoal', CASE
      WHEN p_member->>'weeklyGoal' ~ '^[1-7]$' THEN (p_member->>'weeklyGoal')::integer
      ELSE 4
    END,
    'weeklyCheckins', 0,
    'streak', 0,
    'joinedAt', now()
  );

  UPDATE public.groups
  SET payload = jsonb_set(
    COALESCE(payload, '{}'::jsonb),
    '{members}',
    v_members || jsonb_build_array(v_member),
    true
  )
  WHERE id = v_group.id
  RETURNING payload INTO v_group.payload;

  RETURN v_group.payload;
END;
$$;

REVOKE ALL ON FUNCTION public.join_group_with_invite(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_group_with_invite(TEXT, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_group(p_group_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_group public.groups%ROWTYPE;
  v_members JSONB;
  v_remaining_members JSONB;
  v_updated_payload JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT *
  INTO v_group
  FROM public.groups
  WHERE id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND';
  END IF;

  IF v_group.created_by = v_user_id::text THEN
    RAISE EXCEPTION 'GROUP_CREATOR_CANNOT_LEAVE';
  END IF;

  v_members := COALESCE(v_group.payload->'members', '[]'::jsonb);
  IF jsonb_typeof(v_members) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_GROUP_MEMBERS';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_members) AS group_member(value)
    WHERE value->>'id' = v_user_id::text
  ) THEN
    RAISE EXCEPTION 'NOT_GROUP_MEMBER';
  END IF;

  SELECT COALESCE(jsonb_agg(group_member.value), '[]'::jsonb)
  INTO v_remaining_members
  FROM jsonb_array_elements(v_members) AS group_member(value)
  WHERE group_member.value->>'id' <> v_user_id::text;

  UPDATE public.groups
  SET payload = jsonb_set(
    COALESCE(payload, '{}'::jsonb),
    '{members}',
    v_remaining_members,
    true
  )
  WHERE id = p_group_id
  RETURNING payload INTO v_updated_payload;

  RETURN v_updated_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_group(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_group(TEXT) TO authenticated;

-- 6. TABELA DE FEED DE GRUPOS
CREATE TABLE IF NOT EXISTS public.group_feed (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT,
  user_avatar TEXT,
  routine_name TEXT,
  duration_minutes INTEGER,
  total_volume_kg NUMERIC,
  photo_url TEXT,
  notes TEXT,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  payload JSONB
);

ALTER TABLE public.group_feed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros visualizam o feed" ON public.group_feed;
CREATE POLICY "Membros visualizam o feed"
  ON public.group_feed FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Usuários postam no feed" ON public.group_feed;
CREATE POLICY "Usuários postam no feed"
  ON public.group_feed FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- 7. GROUP CHAT MESSAGES
CREATE TABLE IF NOT EXISTS public.group_messages (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros visualizam mensagens do grupo" ON public.group_messages;
CREATE POLICY "Membros visualizam mensagens do grupo"
  ON public.group_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.groups g
      WHERE g.id = group_messages.group_id
        AND (
          g.created_by = auth.uid()::text
          OR g.payload->'members' @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
        )
    )
  );

DROP POLICY IF EXISTS "Membros enviam mensagens ao grupo" ON public.group_messages;
CREATE POLICY "Membros enviam mensagens ao grupo"
  ON public.group_messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.groups g
      WHERE g.id = group_messages.group_id
        AND (
          g.created_by = auth.uid()::text
          OR g.payload->'members' @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
        )
    )
  );

DROP POLICY IF EXISTS "Autores atualizam suas mensagens" ON public.group_messages;
CREATE POLICY "Autores atualizam suas mensagens"
  ON public.group_messages FOR UPDATE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.groups g
      WHERE g.id = group_messages.group_id
        AND (
          g.created_by = auth.uid()::text
          OR g.payload->'members' @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
        )
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.groups g
      WHERE g.id = group_messages.group_id
        AND (
          g.created_by = auth.uid()::text
          OR g.payload->'members' @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
        )
    )
  );

-- Imagens privadas do chat: membros do grupo recebem URLs assinadas.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'group-chat-images',
  'group-chat-images',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-workout-photos',
  'public-workout-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Fotos públicas de treino são visíveis" ON storage.objects;
CREATE POLICY "Fotos públicas de treino são visíveis"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'public-workout-photos');

DROP POLICY IF EXISTS "Usuários enviam suas fotos de treino" ON storage.objects;
CREATE POLICY "Usuários enviam suas fotos de treino"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'public-workout-photos'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Usuários removem suas fotos públicas de treino" ON storage.objects;
CREATE POLICY "Usuários removem suas fotos públicas de treino"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'public-workout-photos'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Membros veem imagens dos grupos" ON storage.objects;
CREATE POLICY "Membros veem imagens dos grupos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'group-chat-images'
    AND EXISTS (
      SELECT 1
      FROM public.groups g
      WHERE g.id = split_part(name, '/', 1)
        AND (
          g.created_by = auth.uid()::text
          OR g.payload->'members' @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
        )
    )
  );

DROP POLICY IF EXISTS "Membros enviam imagens aos grupos" ON storage.objects;
CREATE POLICY "Membros enviam imagens aos grupos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'group-chat-images'
    AND split_part(name, '/', 2) = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.groups g
      WHERE g.id = split_part(name, '/', 1)
        AND (
          g.created_by = auth.uid()::text
          OR g.payload->'members' @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
        )
    )
  );

DROP POLICY IF EXISTS "Autores removem suas imagens do chat" ON storage.objects;
CREATE POLICY "Autores removem suas imagens do chat"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'group-chat-images'
    AND split_part(name, '/', 2) = auth.uid()::text
  );

-- 7. TRIGGER AUTOMÁTICO PARA CRIAÇÃO DE PERFIL VIA AUTH.USERS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, username, avatar_url, weekly_goal)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'username', LOWER(REGEXP_REPLACE(split_part(NEW.email, '@', 1), '[^a-zA-Z0-9_]', '_', 'g'))),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL),
    COALESCE((NEW.raw_user_meta_data->>'weekly_goal')::integer, 4)
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    username = EXCLUDED.username,
    avatar_url = EXCLUDED.avatar_url,
    weekly_goal = EXCLUDED.weekly_goal,
    gender = EXCLUDED.gender,
    updated_at = NOW();

  INSERT INTO public.user_data (user_id, data_key, payload)
  VALUES (
    NEW.id,
    'schedule',
    '{}'::jsonb
  )
  ON CONFLICT (user_id, data_key) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove only the previous automatic template; keep any schedule users customized.
UPDATE public.user_data
SET payload = '{}'::jsonb, updated_at = NOW()
WHERE data_key = 'schedule'
  AND payload = '{"0":{"type":"rest","label":"Descanso"},"1":{"type":"workout","label":"Treino A"},"2":{"type":"workout","label":"Treino B"},"3":{"type":"rest","label":"Descanso"},"4":{"type":"workout","label":"Treino C"},"5":{"type":"workout","label":"Treino D"},"6":{"type":"rest","label":"Descanso"}}'::jsonb;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 8. ÍNDICES PARA VELOCIDADE INSTANTÂNEA
CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON public.checkins(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_groups_invite_code ON public.groups(invite_code);
CREATE INDEX IF NOT EXISTS idx_group_feed_group_id ON public.group_feed(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_data_lookup ON public.user_data(user_id, data_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_unique ON public.profiles (LOWER(username)) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON public.group_messages(group_id, created_at);

-- Profile metrics stay private at rest; the RPC below returns only fields
-- allowed for the current viewer.
CREATE TABLE IF NOT EXISTS public.profile_training_metrics (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profile_training_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários gerenciam as próprias métricas privadas" ON public.profile_training_metrics;
CREATE POLICY "Usuários gerenciam as próprias métricas privadas"
  ON public.profile_training_metrics FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.profile_training_metrics FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_training_metrics TO authenticated;

-- Permissions for public.profiles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.profiles TO anon;

CREATE OR REPLACE FUNCTION public.get_shared_profile_data(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_viewer_id UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_account JSONB := '{}'::jsonb;
  v_privacy JSONB := '{}'::jsonb;
  v_metrics JSONB := '{}'::jsonb;
  v_checkins JSONB := '[]'::jsonb;
  v_routines JSONB := '[]'::jsonb;
  v_schedule JSONB := '{}'::jsonb;
  v_training_dates JSONB := '[]'::jsonb;
  v_measurements JSONB := '[]'::jsonb;
  v_latest_measurement JSONB := '{}'::jsonb;
  v_measurements_audience TEXT;
  v_volume_audience TEXT;
  v_records_audience TEXT;
  v_activity_audience TEXT;
  v_can_measurements BOOLEAN := false;
  v_can_volume BOOLEAN := false;
  v_can_records BOOLEAN := false;
  v_can_activity BOOLEAN := false;
  v_can_view_routine_weights BOOLEAN := false;
  v_result JSONB;
BEGIN
  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT payload
  INTO v_account
  FROM public.user_data
  WHERE user_id = p_profile_id AND data_key = 'account_data';

  SELECT payload
  INTO v_measurements
  FROM public.user_data
  WHERE user_id = p_profile_id AND data_key = 'measurements';

  SELECT value
  INTO v_latest_measurement
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_measurements) = 'array' THEN v_measurements ELSE '[]'::jsonb END
  ) AS measurement(value)
  ORDER BY COALESCE(value->>'date', value->>'createdAt', '') DESC
  LIMIT 1;

  SELECT payload
  INTO v_metrics
  FROM public.profile_training_metrics
  WHERE user_id = p_profile_id;

  v_privacy := COALESCE(v_account->'privacy', '{}'::jsonb);
  v_can_view_routine_weights := COALESCE(v_privacy->>'publicRoutineWeights', 'false') = 'true';
  SELECT payload
  INTO v_routines
  FROM public.user_data
  WHERE user_id = p_profile_id AND data_key = 'routines';

  IF NOT v_can_view_routine_weights THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_set(
        routine.value,
        '{exercises}',
        COALESCE((
          SELECT jsonb_agg(
            CASE
              WHEN jsonb_typeof(exercise.value->'sets') = 'array' THEN jsonb_set(
                exercise.value,
                '{sets}',
                COALESCE((
                  SELECT jsonb_agg(set_entry.value - 'weight' ORDER BY set_entry.ordinality)
                  FROM jsonb_array_elements(exercise.value->'sets')
                    WITH ORDINALITY AS set_entry(value, ordinality)
                ), '[]'::jsonb),
                true
              )
              ELSE exercise.value
            END
            ORDER BY exercise.ordinality
          )
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(routine.value->'exercises') = 'array' THEN routine.value->'exercises'
              ELSE '[]'::jsonb
            END
          ) WITH ORDINALITY AS exercise(value, ordinality)
        ), '[]'::jsonb),
        true
      )
      ORDER BY routine.ordinality
    ), '[]'::jsonb)
    INTO v_routines
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_routines) = 'array' THEN v_routines ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS routine(value, ordinality);
  END IF;

  v_measurements_audience := COALESCE(
    v_privacy #>> '{profileVisibility,measurements}',
    CASE WHEN v_privacy->>'publicMeasurements' = 'true' THEN 'public' ELSE 'private' END
  );
  v_volume_audience := COALESCE(v_privacy #>> '{profileVisibility,trainingVolume}', 'private');
  v_records_audience := COALESCE(
    v_privacy #>> '{profileVisibility,personalRecords}',
    CASE WHEN v_privacy->>'publicPRs' = 'true' THEN 'public' ELSE 'private' END
  );
  v_activity_audience := COALESCE(v_privacy #>> '{profileVisibility,trainingActivity}', 'public');

  v_can_measurements := p_profile_id = v_viewer_id
    OR v_measurements_audience = 'public'
    OR (
      v_measurements_audience = 'following'
      AND EXISTS (
        SELECT 1 FROM public.user_follows
        WHERE follower_id = p_profile_id AND following_id = v_viewer_id
      )
    )
    OR (
      v_measurements_audience = 'groups'
      AND EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.payload->'members' @> jsonb_build_array(jsonb_build_object('id', p_profile_id::text))
          AND g.payload->'members' @> jsonb_build_array(jsonb_build_object('id', v_viewer_id::text))
      )
    );

  v_can_volume := p_profile_id = v_viewer_id
    OR v_volume_audience = 'public'
    OR (
      v_volume_audience = 'following'
      AND EXISTS (
        SELECT 1 FROM public.user_follows
        WHERE follower_id = p_profile_id AND following_id = v_viewer_id
      )
    )
    OR (
      v_volume_audience = 'groups'
      AND EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.payload->'members' @> jsonb_build_array(jsonb_build_object('id', p_profile_id::text))
          AND g.payload->'members' @> jsonb_build_array(jsonb_build_object('id', v_viewer_id::text))
      )
    );

  v_can_records := p_profile_id = v_viewer_id
    OR v_records_audience = 'public'
    OR (
      v_records_audience = 'following'
      AND EXISTS (
        SELECT 1 FROM public.user_follows
        WHERE follower_id = p_profile_id AND following_id = v_viewer_id
      )
    )
    OR (
      v_records_audience = 'groups'
      AND EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.payload->'members' @> jsonb_build_array(jsonb_build_object('id', p_profile_id::text))
          AND g.payload->'members' @> jsonb_build_array(jsonb_build_object('id', v_viewer_id::text))
      )
    );

  v_can_activity := p_profile_id = v_viewer_id
    OR v_activity_audience = 'public'
    OR (
      v_activity_audience = 'following'
      AND EXISTS (
        SELECT 1 FROM public.user_follows
        WHERE follower_id = p_profile_id AND following_id = v_viewer_id
      )
    )
    OR (
      v_activity_audience = 'groups'
      AND EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.payload->'members' @> jsonb_build_array(jsonb_build_object('id', p_profile_id::text))
          AND g.payload->'members' @> jsonb_build_array(jsonb_build_object('id', v_viewer_id::text))
      )
    );

  v_result := jsonb_build_object(
    'id', v_profile.id,
    'name', v_profile.name,
    'username', v_profile.username,
    'avatar_url', v_profile.avatar_url
  );

  IF v_can_activity THEN
    SELECT payload
    INTO v_checkins
    FROM public.user_data
    WHERE user_id = p_profile_id AND data_key = 'checkins';

    SELECT COALESCE(jsonb_agg(checkin.value->>'date'), '[]'::jsonb)
    INTO v_training_dates
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_checkins) = 'array' THEN v_checkins ELSE '[]'::jsonb END
    ) AS checkin(value)
    WHERE COALESCE(checkin.value->>'type', '') <> 'cardio'
      AND COALESCE(checkin.value->>'isCardio', 'false') <> 'true'
      AND NULLIF(checkin.value->>'date', '') IS NOT NULL;

    SELECT payload
    INTO v_schedule
    FROM public.user_data
    WHERE user_id = p_profile_id AND data_key = 'schedule';

    v_result := v_result || jsonb_build_object(
      'weekly_goal', COALESCE(NULLIF(v_account->>'weeklyGoal', '')::INTEGER, v_profile.weekly_goal),
      'streak', COALESCE((v_metrics->>'streak')::INTEGER, v_profile.streak),
      'weekly_streak', COALESCE((v_metrics->>'weeklyStreak')::INTEGER, v_profile.weekly_streak),
      'weekly_checkins', COALESCE((v_metrics->>'weeklyCheckins')::INTEGER, 0),
      'training_dates', v_training_dates,
      'weekly_schedule', COALESCE(v_schedule, '{}'::jsonb)
    );
  END IF;

  v_result := v_result || jsonb_build_object(
    'routines', COALESCE(v_routines, '[]'::jsonb),
    'public_routine_weights', v_can_view_routine_weights
  );

  IF v_can_measurements THEN
    v_result := v_result || jsonb_build_object(
      'measurements', COALESCE(v_latest_measurement, '{}'::jsonb)
    );
  END IF;

  IF v_can_volume THEN
    v_result := v_result || jsonb_build_object(
      'weekly_volume_kg', COALESCE((v_metrics->>'weeklyVolumeKg')::NUMERIC, 0),
      'weekly_sets_by_muscle_group', COALESCE(v_metrics->'weeklySetsByMuscleGroup', '{}'::jsonb),
      'max_lifts_by_muscle_group', COALESCE(v_metrics->'maxLiftsByMuscleGroup', '{}'::jsonb)
    );
  END IF;

  IF v_can_records THEN
    v_result := v_result || jsonb_build_object(
      'prs_count', COALESCE((v_metrics->>'prsCount')::INTEGER, 0)
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_profile_data(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_profile_data(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_shared_profile_data_batch(p_profile_ids UUID[])
RETURNS JSONB
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    jsonb_object_agg(profile_id::text, public.get_shared_profile_data(profile_id)),
    '{}'::jsonb
  )
  FROM (
    SELECT DISTINCT unnest(p_profile_ids) AS profile_id
  ) requested_profiles
  WHERE profile_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_shared_profile_data_batch(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shared_profile_data_batch(UUID[]) TO authenticated;

-- Remove old cached metrics that would otherwise bypass the new privacy controls.
DO $$
DECLARE
  v_group RECORD;
  v_member JSONB;
  v_members JSONB;
  v_privacy JSONB;
  v_visibility JSONB;
  v_measurements_audience TEXT;
  v_volume_audience TEXT;
  v_records_audience TEXT;
  v_activity_audience TEXT;
BEGIN
  FOR v_group IN
    SELECT id, payload
    FROM public.groups
    WHERE jsonb_typeof(payload->'members') = 'array'
  LOOP
    v_members := '[]'::jsonb;
    FOR v_member IN
      SELECT value FROM jsonb_array_elements(v_group.payload->'members') AS item(value)
    LOOP
      v_privacy := '{}'::jsonb;
      SELECT COALESCE(payload->'privacy', '{}'::jsonb)
      INTO v_privacy
      FROM public.user_data
      WHERE user_id::text = v_member->>'id' AND data_key = 'account_data';

      v_measurements_audience := CASE
        WHEN v_privacy #>> '{profileVisibility,measurements}' IN ('private', 'following', 'groups', 'public')
          THEN v_privacy #>> '{profileVisibility,measurements}'
        WHEN v_privacy->>'publicMeasurements' = 'true' THEN 'public'
        ELSE 'private'
      END;
      v_volume_audience := CASE
        WHEN v_privacy #>> '{profileVisibility,trainingVolume}' IN ('private', 'following', 'groups', 'public')
          THEN v_privacy #>> '{profileVisibility,trainingVolume}'
        ELSE 'private'
      END;
      v_records_audience := CASE
        WHEN v_privacy #>> '{profileVisibility,personalRecords}' IN ('private', 'following', 'groups', 'public')
          THEN v_privacy #>> '{profileVisibility,personalRecords}'
        WHEN v_privacy->>'publicPRs' = 'true' THEN 'public'
        ELSE 'private'
      END;
      v_activity_audience := CASE
        WHEN v_privacy #>> '{profileVisibility,trainingActivity}' IN ('private', 'following', 'groups', 'public')
          THEN v_privacy #>> '{profileVisibility,trainingActivity}'
        ELSE 'public'
      END;

      v_visibility := jsonb_build_object(
        'measurements', v_measurements_audience,
        'trainingVolume', v_volume_audience,
        'personalRecords', v_records_audience,
        'trainingActivity', v_activity_audience
      );
      v_member := v_member || jsonb_build_object('profileVisibility', v_visibility);

      IF v_activity_audience <> 'public' THEN
        v_member := v_member - ARRAY['weeklyCheckins', 'streak', 'weeklyStreak', 'weeklyGoal'];
      END IF;
      IF v_volume_audience <> 'public' THEN
        v_member := v_member - ARRAY['weeklySetsByMuscleGroup', 'maxLiftsByMuscleGroup', 'weeklyVolumeKg'];
      END IF;
      IF v_records_audience <> 'public' THEN
        v_member := v_member - 'prsCount';
      END IF;

      v_members := v_members || jsonb_build_array(v_member);
    END LOOP;

    UPDATE public.groups
    SET payload = jsonb_set(COALESCE(payload, '{}'::jsonb), '{members}', v_members, true)
    WHERE id = v_group.id;
  END LOOP;
END;
$$;

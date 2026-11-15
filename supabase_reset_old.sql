-- APAGAMENTO IRREVERSIVEL: execute somente no projeto antigo
-- (ref: xhgavvprcjfomnpatjqd), nunca no projeto novo.
-- Isto remove os dados das tabelas do app e todos os usuarios do Supabase Auth.
-- Confira o projeto selecionado no Dashboard antes de executar.

BEGIN;

TRUNCATE TABLE
  public.group_feed,
  public.groups,
  public.checkins,
  public.user_data,
  public.profiles
RESTART IDENTITY CASCADE;

DELETE FROM auth.users;

COMMIT;

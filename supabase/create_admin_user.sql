-- ============================================================
-- Script : Création d'un utilisateur admin temporaire
-- Email  : admin@cnq.ca
-- Mot de passe : admin
-- ⚠️  À supprimer ou changer après les tests !
-- ============================================================

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  '24hchronosports@gmail.com',
  crypt('admin1!', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  FALSE,
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
);

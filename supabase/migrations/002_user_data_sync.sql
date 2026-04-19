-- ============================================================
-- Migration: Per-User Cloud Sync (presets / programs / brain profile / custom audios)
-- ============================================================

-- Shared updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. user_synth_presets
-- ============================================================
CREATE TABLE IF NOT EXISTS user_synth_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_synth_presets_user_created
  ON user_synth_presets (user_id, created_at DESC);

ALTER TABLE user_synth_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own presets"
  ON user_synth_presets FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Users insert own presets"
  ON user_synth_presets FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own presets"
  ON user_synth_presets FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own presets"
  ON user_synth_presets FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- 2. user_synth_programs
-- ============================================================
CREATE TABLE IF NOT EXISTS user_synth_programs (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  default_duration INT NOT NULL,
  preset JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_synth_programs_user_created
  ON user_synth_programs (user_id, created_at DESC);

ALTER TABLE user_synth_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own programs"
  ON user_synth_programs FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Users insert own programs"
  ON user_synth_programs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own programs"
  ON user_synth_programs FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own programs"
  ON user_synth_programs FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- 3. user_brain_profile (one-row-per-user)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_brain_profile (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_user_brain_profile_updated_at ON user_brain_profile;
CREATE TRIGGER trg_user_brain_profile_updated_at
  BEFORE UPDATE ON user_brain_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE user_brain_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own brain profile"
  ON user_brain_profile FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Users insert own brain profile"
  ON user_brain_profile FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own brain profile"
  ON user_brain_profile FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own brain profile"
  ON user_brain_profile FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- 4. user_custom_audios
-- ============================================================
CREATE TABLE IF NOT EXISTS user_custom_audios (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size_bytes BIGINT,
  duration_sec NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_custom_audios_user_created
  ON user_custom_audios (user_id, created_at DESC);

ALTER TABLE user_custom_audios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own audios"
  ON user_custom_audios FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Users insert own audios"
  ON user_custom_audios FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own audios"
  ON user_custom_audios FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own audios"
  ON user_custom_audios FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- 5. Storage bucket: user-audio
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-audio',
  'user-audio',
  false,
  52428800, -- 50 MB
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/x-m4a']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage object policies. Path convention: {auth.uid()}/{audio_id}.{ext}
DROP POLICY IF EXISTS "user-audio select own" ON storage.objects;
DROP POLICY IF EXISTS "user-audio insert own" ON storage.objects;
DROP POLICY IF EXISTS "user-audio update own" ON storage.objects;
DROP POLICY IF EXISTS "user-audio delete own" ON storage.objects;

CREATE POLICY "user-audio select own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'user-audio'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
  );

CREATE POLICY "user-audio insert own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'user-audio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "user-audio update own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'user-audio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "user-audio delete own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user-audio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

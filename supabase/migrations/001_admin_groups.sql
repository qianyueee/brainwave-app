-- ============================================================
-- Migration: Admin & Group-based Access Control
-- ============================================================

-- 1. profiles table (auto-created on user signup)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
  is_disabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile row on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. groups table
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. user_groups (many-to-many)
CREATE TABLE IF NOT EXISTS user_groups (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_id)
);

-- 4. group_programs (link published programs to groups)
CREATE TABLE IF NOT EXISTS group_programs (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL,
  PRIMARY KEY (group_id, program_id)
);

-- ============================================================
-- RLS Policies
-- ============================================================

-- Helper: check if current user is admin or super_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'super_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE
  USING (public.is_admin());

-- groups
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read groups"
  ON groups FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert groups"
  ON groups FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update groups"
  ON groups FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete groups"
  ON groups FOR DELETE
  USING (public.is_admin());

-- user_groups
ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own memberships, admins can read all"
  ON user_groups FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins can insert user_groups"
  ON user_groups FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete user_groups"
  ON user_groups FOR DELETE
  USING (public.is_admin());

-- group_programs
ALTER TABLE group_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read group_programs"
  ON group_programs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert group_programs"
  ON group_programs FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete group_programs"
  ON group_programs FOR DELETE
  USING (public.is_admin());

-- published_programs: ensure admins can manage
-- (assumes table already exists; add policies if RLS is enabled)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'published_programs') THEN
    ALTER TABLE published_programs ENABLE ROW LEVEL SECURITY;

    -- Everyone can read published programs (visibility filtered client-side by group)
    CREATE POLICY "Anyone can read published_programs"
      ON published_programs FOR SELECT
      USING (true);

    CREATE POLICY "Admins can insert published_programs"
      ON published_programs FOR INSERT
      WITH CHECK (public.is_admin());

    CREATE POLICY "Admins can update published_programs"
      ON published_programs FOR UPDATE
      USING (public.is_admin());

    CREATE POLICY "Admins can delete published_programs"
      ON published_programs FOR DELETE
      USING (public.is_admin());
  END IF;
END $$;

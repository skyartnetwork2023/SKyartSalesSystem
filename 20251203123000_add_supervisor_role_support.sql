-- Adds supervisor role support and read-only oversight policies

-- Ensure avatar_url column exists for profile pictures
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Add role column with default "user" to flag supervisors
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

-- Allow supervisors to read every profile for user switching
CREATE POLICY "Supervisors can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles AS supervisor
      WHERE supervisor.id = auth.uid()
        AND supervisor.role = 'supervisor'
    )
  );

-- Allow supervisors to read every voucher but keep writes scoped to owners
CREATE POLICY "Supervisors can view all vouchers"
  ON vouchers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles AS supervisor
      WHERE supervisor.id = auth.uid()
        AND supervisor.role = 'supervisor'
    )
  );

-- Ensure supervisor policy does not re-evaluate auth.uid() per row

DROP POLICY IF EXISTS "Supervisors can manage profiles" ON profiles;
CREATE POLICY "Supervisors can manage profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (((SELECT auth.uid()) = id) OR public.is_supervisor())
  WITH CHECK (((SELECT auth.uid()) = id) OR public.is_supervisor());

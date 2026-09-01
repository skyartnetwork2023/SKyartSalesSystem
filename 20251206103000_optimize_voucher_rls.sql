-- Fix RLS policies to avoid per-row auth.uid() evaluation overhead

DROP POLICY IF EXISTS "Users can view own vouchers" ON vouchers;
CREATE POLICY "Users can view own vouchers"
  ON vouchers FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create vouchers" ON vouchers;
CREATE POLICY "Users can create vouchers"
  ON vouchers FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own vouchers" ON vouchers;
CREATE POLICY "Users can update own vouchers"
  ON vouchers FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own vouchers" ON vouchers;
CREATE POLICY "Users can delete own vouchers"
  ON vouchers FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

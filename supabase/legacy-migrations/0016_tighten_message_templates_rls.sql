-- Drop existing permissive policy
DROP POLICY IF EXISTS "Users can manage location templates" ON public.message_templates;

-- Recreate with admin role check
CREATE POLICY "Admins can manage location templates" ON public.message_templates
FOR ALL TO authenticated
USING (
  location_id IN (
    SELECT locations.id FROM locations
    WHERE locations.account_id = get_current_account_id()
  )
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'admin'
  )
);
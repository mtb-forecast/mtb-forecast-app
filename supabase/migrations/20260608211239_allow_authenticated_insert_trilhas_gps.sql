
CREATE POLICY "Usuarios autenticados gravam proprias trilhas GPS"
  ON trilhas FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

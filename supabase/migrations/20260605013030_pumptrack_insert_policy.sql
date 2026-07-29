
CREATE POLICY "pumptrack_insert_auth" ON trilhas_pumptrack
  FOR INSERT TO authenticated
  WITH CHECK (true);

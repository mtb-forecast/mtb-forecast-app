-- Corrige "infinite recursion detected in policy for relation selecao_membros".
-- Causa: a policy de selecoes_trilhas consultava selecao_membros, e a policy de
-- selecao_membros consultava selecoes_trilhas de volta — cada SELECT reacionava
-- a RLS da outra tabela, formando um ciclo.
--
-- Fix: funções SECURITY DEFINER (owner = role da migration, que não tem
-- FORCE ROW LEVEL SECURITY setado nessas tabelas, então bypassa RLS por padrão)
-- fazem a checagem batendo em UMA tabela só cada. Como bypassam RLS, nunca
-- re-disparam nenhuma policy — o ciclo é quebrado na raiz.

CREATE OR REPLACE FUNCTION public.eh_owner_selecao(p_selecao_id uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.selecoes_trilhas s
    WHERE s.id = p_selecao_id AND s.owner_id = p_uid
  );
$$;

CREATE OR REPLACE FUNCTION public.eh_membro_selecao(p_selecao_id uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.selecao_membros m
    WHERE m.selecao_id = p_selecao_id AND m.profile_id = p_uid
  );
$$;

GRANT EXECUTE ON FUNCTION public.eh_owner_selecao(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eh_membro_selecao(uuid, uuid) TO authenticated;

-- ── selecoes_trilhas ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "selecoes_trilhas_select_membros" ON public.selecoes_trilhas;
CREATE POLICY "selecoes_trilhas_select_membros" ON public.selecoes_trilhas
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.eh_membro_selecao(id, auth.uid()));

-- update/delete/insert de selecoes_trilhas só comparam owner_id = auth.uid()
-- direto na própria linha — nunca consultaram outra tabela, não precisam mudar.

-- ── selecao_trilhas_itens ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "selecao_trilhas_itens_select" ON public.selecao_trilhas_itens;
CREATE POLICY "selecao_trilhas_itens_select" ON public.selecao_trilhas_itens
  FOR SELECT TO authenticated
  USING (public.eh_owner_selecao(selecao_id, auth.uid()) OR public.eh_membro_selecao(selecao_id, auth.uid()));

DROP POLICY IF EXISTS "selecao_trilhas_itens_insert" ON public.selecao_trilhas_itens;
CREATE POLICY "selecao_trilhas_itens_insert" ON public.selecao_trilhas_itens
  FOR INSERT TO authenticated
  WITH CHECK (public.eh_owner_selecao(selecao_id, auth.uid()) OR public.eh_membro_selecao(selecao_id, auth.uid()));

DROP POLICY IF EXISTS "selecao_trilhas_itens_delete" ON public.selecao_trilhas_itens;
CREATE POLICY "selecao_trilhas_itens_delete" ON public.selecao_trilhas_itens
  FOR DELETE TO authenticated
  USING (public.eh_owner_selecao(selecao_id, auth.uid()) OR public.eh_membro_selecao(selecao_id, auth.uid()));

-- ── selecao_membros ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "selecao_membros_select" ON public.selecao_membros;
CREATE POLICY "selecao_membros_select" ON public.selecao_membros
  FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR public.eh_owner_selecao(selecao_id, auth.uid())
    OR public.eh_membro_selecao(selecao_id, auth.uid())
  );

DROP POLICY IF EXISTS "selecao_membros_insert" ON public.selecao_membros;
CREATE POLICY "selecao_membros_insert" ON public.selecao_membros
  FOR INSERT TO authenticated
  WITH CHECK (public.eh_owner_selecao(selecao_id, auth.uid()) OR public.eh_membro_selecao(selecao_id, auth.uid()));

DROP POLICY IF EXISTS "selecao_membros_delete" ON public.selecao_membros;
CREATE POLICY "selecao_membros_delete" ON public.selecao_membros
  FOR DELETE TO authenticated
  USING (profile_id = auth.uid() OR public.eh_owner_selecao(selecao_id, auth.uid()));

-- ── selecao_convites ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "selecao_convites_select_membros" ON public.selecao_convites;
CREATE POLICY "selecao_convites_select_membros" ON public.selecao_convites
  FOR SELECT TO authenticated
  USING (public.eh_owner_selecao(selecao_id, auth.uid()) OR public.eh_membro_selecao(selecao_id, auth.uid()));

DROP POLICY IF EXISTS "selecao_convites_insert_membros" ON public.selecao_convites;
CREATE POLICY "selecao_convites_insert_membros" ON public.selecao_convites
  FOR INSERT TO authenticated
  WITH CHECK (
    criado_por = auth.uid()
    AND (public.eh_owner_selecao(selecao_id, auth.uid()) OR public.eh_membro_selecao(selecao_id, auth.uid()))
  );

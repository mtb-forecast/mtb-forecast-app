-- Feature: seleções de trilhas personalizadas, colaborativas, por data única.
-- Isolada do motor de previsão: nenhuma tabela/coluna do pipeline principal é tocada.
-- "Ativa"/"histórico" é calculado (data >= current_date), não armazenado.

CREATE TABLE IF NOT EXISTS public.selecoes_trilhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_selecoes_trilhas_owner ON public.selecoes_trilhas (owner_id);
CREATE INDEX IF NOT EXISTS idx_selecoes_trilhas_data ON public.selecoes_trilhas (data);

CREATE TABLE IF NOT EXISTS public.selecao_trilhas_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  selecao_id uuid NOT NULL REFERENCES public.selecoes_trilhas(id) ON DELETE CASCADE,
  trilha_id uuid NOT NULL REFERENCES public.trilhas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (selecao_id, trilha_id)
);

CREATE INDEX IF NOT EXISTS idx_selecao_trilhas_itens_selecao ON public.selecao_trilhas_itens (selecao_id);
CREATE INDEX IF NOT EXISTS idx_selecao_trilhas_itens_trilha ON public.selecao_trilhas_itens (trilha_id);

CREATE TABLE IF NOT EXISTS public.selecao_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  selecao_id uuid NOT NULL REFERENCES public.selecoes_trilhas(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (selecao_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_selecao_membros_selecao ON public.selecao_membros (selecao_id);
CREATE INDEX IF NOT EXISTS idx_selecao_membros_profile ON public.selecao_membros (profile_id);

CREATE TABLE IF NOT EXISTS public.selecao_convites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  selecao_id uuid NOT NULL REFERENCES public.selecoes_trilhas(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  criado_por uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  usado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expira_em timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_selecao_convites_selecao ON public.selecao_convites (selecao_id);
CREATE INDEX IF NOT EXISTS idx_selecao_convites_token ON public.selecao_convites (token);

ALTER TABLE public.selecoes_trilhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selecao_trilhas_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selecao_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selecao_convites ENABLE ROW LEVEL SECURITY;

-- selecoes_trilhas: owner ou membro enxerga; só owner cria/edita/apaga.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'selecoes_trilhas' AND policyname = 'selecoes_trilhas_select_membros'
  ) THEN
    CREATE POLICY "selecoes_trilhas_select_membros" ON public.selecoes_trilhas
      FOR SELECT TO authenticated
      USING (
        auth.uid() = owner_id
        OR EXISTS (
          SELECT 1 FROM public.selecao_membros m
          WHERE m.selecao_id = id AND m.profile_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'selecoes_trilhas' AND policyname = 'selecoes_trilhas_insert_own'
  ) THEN
    CREATE POLICY "selecoes_trilhas_insert_own" ON public.selecoes_trilhas
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = owner_id);
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'selecoes_trilhas' AND policyname = 'selecoes_trilhas_update_own'
  ) THEN
    CREATE POLICY "selecoes_trilhas_update_own" ON public.selecoes_trilhas
      FOR UPDATE TO authenticated
      USING (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'selecoes_trilhas' AND policyname = 'selecoes_trilhas_delete_own'
  ) THEN
    CREATE POLICY "selecoes_trilhas_delete_own" ON public.selecoes_trilhas
      FOR DELETE TO authenticated
      USING (auth.uid() = owner_id);
  END IF;
END $$;

-- selecao_trilhas_itens: owner ou qualquer membro pode ver/editar (colaborativo).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'selecao_trilhas_itens' AND policyname = 'selecao_trilhas_itens_select'
  ) THEN
    CREATE POLICY "selecao_trilhas_itens_select" ON public.selecao_trilhas_itens
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.selecoes_trilhas s
          WHERE s.id = selecao_id
            AND (s.owner_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM public.selecao_membros m WHERE m.selecao_id = s.id AND m.profile_id = auth.uid()))
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'selecao_trilhas_itens' AND policyname = 'selecao_trilhas_itens_insert'
  ) THEN
    CREATE POLICY "selecao_trilhas_itens_insert" ON public.selecao_trilhas_itens
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.selecoes_trilhas s
          WHERE s.id = selecao_id
            AND (s.owner_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM public.selecao_membros m WHERE m.selecao_id = s.id AND m.profile_id = auth.uid()))
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'selecao_trilhas_itens' AND policyname = 'selecao_trilhas_itens_delete'
  ) THEN
    CREATE POLICY "selecao_trilhas_itens_delete" ON public.selecao_trilhas_itens
      FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.selecoes_trilhas s
          WHERE s.id = selecao_id
            AND (s.owner_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM public.selecao_membros m WHERE m.selecao_id = s.id AND m.profile_id = auth.uid()))
        )
      );
  END IF;
END $$;

-- selecao_membros: owner ou membro enxerga; owner ou membro adiciona outro (busca);
-- owner remove qualquer um, ou o próprio membro sai.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'selecao_membros' AND policyname = 'selecao_membros_select'
  ) THEN
    CREATE POLICY "selecao_membros_select" ON public.selecao_membros
      FOR SELECT TO authenticated
      USING (
        profile_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.selecoes_trilhas s
          WHERE s.id = selecao_id
            AND (s.owner_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM public.selecao_membros m2 WHERE m2.selecao_id = s.id AND m2.profile_id = auth.uid()))
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'selecao_membros' AND policyname = 'selecao_membros_insert'
  ) THEN
    CREATE POLICY "selecao_membros_insert" ON public.selecao_membros
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.selecoes_trilhas s
          WHERE s.id = selecao_id
            AND (s.owner_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM public.selecao_membros m2 WHERE m2.selecao_id = s.id AND m2.profile_id = auth.uid()))
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'selecao_membros' AND policyname = 'selecao_membros_delete'
  ) THEN
    CREATE POLICY "selecao_membros_delete" ON public.selecao_membros
      FOR DELETE TO authenticated
      USING (
        profile_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.selecoes_trilhas s
          WHERE s.id = selecao_id AND s.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- selecao_convites: sem policy pública; leitura/aceite por token passa por rota
-- de servidor com service role (RLS não valida "token bate com a URL").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'selecao_convites' AND policyname = 'selecao_convites_select_membros'
  ) THEN
    CREATE POLICY "selecao_convites_select_membros" ON public.selecao_convites
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.selecoes_trilhas s
          WHERE s.id = selecao_id
            AND (s.owner_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM public.selecao_membros m WHERE m.selecao_id = s.id AND m.profile_id = auth.uid()))
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'selecao_convites' AND policyname = 'selecao_convites_insert_membros'
  ) THEN
    CREATE POLICY "selecao_convites_insert_membros" ON public.selecao_convites
      FOR INSERT TO authenticated
      WITH CHECK (
        criado_por = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.selecoes_trilhas s
          WHERE s.id = selecao_id
            AND (s.owner_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM public.selecao_membros m WHERE m.selecao_id = s.id AND m.profile_id = auth.uid()))
        )
      );
  END IF;
END $$;

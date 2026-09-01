-- Trilhas longas (>5km) que fisicamente atravessam trechos já cadastrados como
-- trilhas próprias no catálogo. Em vez de recalcular clima/solo num único ponto
-- representante (que pode não capturar a pior condição do percurso), a trilha
-- "composta" referencia as trilhas componentes já existentes; o veredicto final
-- é o pior caso entre elas (ver scripts/agregar_trilhas_compostas.py).
--
-- Não é hierarquia genérica — é só uma junção many-to-many para modelar
-- "este percurso passa pelos trechos X, Y, Z", mantendo cada componente como
-- trilha própria, independente, com sua condição calculada normalmente.

CREATE TABLE IF NOT EXISTS trilha_segmentos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trilha_composta_id    uuid NOT NULL REFERENCES trilhas(id) ON DELETE CASCADE,
  trilha_componente_id  uuid NOT NULL REFERENCES trilhas(id) ON DELETE CASCADE,
  ordem                 integer NOT NULL DEFAULT 0,
  created_at            timestamptz DEFAULT now(),
  CONSTRAINT trilha_segmentos_nao_referencia_si_mesma CHECK (trilha_composta_id <> trilha_componente_id),
  CONSTRAINT trilha_segmentos_unica UNIQUE (trilha_composta_id, trilha_componente_id)
);

CREATE INDEX IF NOT EXISTS idx_trilha_segmentos_composta   ON trilha_segmentos(trilha_composta_id);
CREATE INDEX IF NOT EXISTS idx_trilha_segmentos_componente ON trilha_segmentos(trilha_componente_id);

ALTER TABLE trilha_segmentos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'trilha_segmentos' AND policyname = 'trilha_segmentos_select_public'
  ) THEN
    CREATE POLICY "trilha_segmentos_select_public" ON public.trilha_segmentos
      FOR SELECT USING (true);
  END IF;
END $$;

-- Auditoria: quando o veredicto/aderência da trilha composta foi elevado por
-- ser pior num dos trechos componentes, guarda o nome do trecho que causou a
-- escalada (NULL quando a própria trilha já era o pior caso). Consultado pelo
-- frontend só como referência de debug -- a UI principal usa
-- trilha_segmentos + condicoes de cada componente para montar o breakdown.
ALTER TABLE condicoes ADD COLUMN IF NOT EXISTS veredicto_origem_trecho text;

COMMENT ON TABLE trilha_segmentos IS
  'Junção trilha composta -> trechos componentes já cadastrados no catálogo. Ver scripts/agregar_trilhas_compostas.py e CLAUDE.md.';

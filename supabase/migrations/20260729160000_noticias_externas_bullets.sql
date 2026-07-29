-- noticias_externas ainda tinha 0 linhas em produção — ajusta o schema pra
-- ficar estruturado igual noticias_clima (frase_destaque + bullets), em vez
-- de um campo de texto livre com a resposta crua do Claude (que incluía
-- preâmbulo e markdown não processado — ver bug corrigido em
-- scripts/post_noticia_externa.py no mesmo commit).

ALTER TABLE public.noticias_externas RENAME COLUMN resumo TO frase_destaque;

ALTER TABLE public.noticias_externas
  ADD COLUMN IF NOT EXISTS bullets jsonb NOT NULL DEFAULT '[]'::jsonb;

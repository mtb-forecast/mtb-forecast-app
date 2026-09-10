-- Nova dica: anuncia a feature de seleções de trilhas personalizadas (colaborativas,
-- por data, convite via busca ou link WhatsApp). Mesmo padrão da dica #27 (cadastro
-- de bike): created_at = now() via default -> aparece no /feed de hoje;
-- ultima_postagem IS NULL -> prioridade máxima no rodízio do Instagram (post_instagram_dica.py).

INSERT INTO public.instagram_dicas (id, titulo, subtitulo, itens, rodape, caption, ativo) VALUES
(28,
 'Monte um rolê pra um dia certo e chame a galera',
 'Novo no app: seleções de trilhas colaborativas',
 '[{"emoji":"📅","texto":"Crie uma seleção nomeada de trilhas pra um dia específico"},{"emoji":"👥","texto":"Convide colaboradores — quem entrar também pode editar a seleção junto com você"},{"emoji":"🔗","texto":"Sem conta no app? Gere um link de convite e chame pelo WhatsApp"},{"emoji":"🔔","texto":"Todo mundo recebe lembrete no Telegram um dia antes, com as condições das trilhas"}]',
 'Acesse Perfil → Minhas seleções pra criar a sua',
 $$📅 Monte um rolê pra um dia certo e chame a galera

Novidade no MTB Forecaster: agora você pode criar uma seleção nomeada de trilhas pra um dia específico — tipo "Rolê de domingo" — e convidar quem for.

👥 Quem entra pode editar a seleção junto com você — adicionar ou tirar trilha.
🔗 Amigo sem conta no app? Gera um link de convite e manda no WhatsApp.
🔔 Um dia antes, todo mundo recebe lembrete no Telegram com as condições das trilhas escolhidas.

Acesse Perfil → Minhas seleções e crie a sua.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$,
 true)
ON CONFLICT (id) DO NOTHING;

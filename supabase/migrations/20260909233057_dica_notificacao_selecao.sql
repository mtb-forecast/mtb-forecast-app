-- Nova dica: anuncia que quem é adicionado numa seleção de trilhas agora recebe
-- notificação (Telegram, e-mail e Feed). Usa id 29 porque a dica #28 (seleções
-- de trilhas colaborativas, migration 20260909222312) ainda não foi aplicada em
-- produção — max(id) hoje é 27. Mesmo padrão das anteriores: created_at = now()
-- via default -> aparece no /feed de hoje; ultima_postagem IS NULL -> entra no
-- rodízio do Instagram (post_instagram_dica.py) assim que chegar a vez dela.

INSERT INTO public.instagram_dicas (id, titulo, subtitulo, itens, rodape, caption, ativo) VALUES
(29,
 'Chamou alguém pro rolê? Ela fica sabendo na hora',
 'Seleções de trilhas agora avisam quem entrou',
 '[{"emoji":"📲","texto":"Quem você adiciona numa seleção recebe aviso no Telegram na hora"},{"emoji":"📧","texto":"E também por e-mail, com o nome da seleção e a data do rolê"},{"emoji":"📰","texto":"E aparece no Feed do app: \"Você foi convidado(a)\""},{"emoji":"✅","texto":"Sem precisar avisar por fora — a pessoa já sabe que entrou"}]',
 'Acesse Perfil → Minhas seleções pra criar a sua',
 $$📲 Chamou alguém pro rolê? Ela fica sabendo na hora

Novidade no MTB Forecaster: quem você adiciona numa seleção de trilhas recebe aviso automático — sem precisar mandar mensagem por fora.

📲 Telegram, na hora que você adiciona a pessoa.
📧 E-mail com o nome da seleção e a data do rolê.
📰 E aparece no Feed do app: "Você foi convidado(a)".

Acesse Perfil → Minhas seleções, monte o rolê e chame a galera.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$,
 true)
ON CONFLICT (id) DO NOTHING;

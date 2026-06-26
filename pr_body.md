## Resumo

### Performance (Frontend)
- **LCP mobile** `/login` e `/t/[id]` corrigido: convertidos para Server Components — heading renderizado no HTML inicial antes do JS carregar
- Fix TypeScript no `backfill-localidades/route.ts` que quebrava o build

### Filtros e localidades
- Cidades/localidades no filtro de trilhas derivadas dos dados já carregados (evita opções órfãs)
- Backfill re-geocodifica trilhas com `localidade_id` apontando para entradas com `cidade = ''` (fallback estado-only de imports anteriores)
- Todos os fluxos de edição e importação salvam `localidade_id` corretamente

### Mapa
- Pins coloridos apenas para trilhas favoritadas pelo usuário; não-favoritas ficam cinzas (revertido comportamento que mostrava condições para todas)

### Perfil
- Aba "Conta" redesenhada como formulário inline (substituiu bottom sheets)
- Campos obrigatórios: Nome, Apelido, Data de Nascimento, Estado, Cidade, Telefone
- Campos opcionais com link externo: Instagram, Telegram, Facebook, Strava ID

### Agente Python — robustez histórico de chuva
- **Precipitação OW timemachine**: dados de `rain.1h` já buscados pelo timemachine (3 chamadas/trilha, sem custo extra) agora extraídos e blendados com OM via `max(OW, OM)` — captura chuvas de madrugada com lag no OM `past_days` (NWP tem 6-12h de delay)
- **Fallback Supabase**: quando `fetch_historico_chuva_om` falha nas 3 tentativas, usa registro anterior do Supabase com decaimento exponencial em vez de retornar 0mm silenciosamente
- **Retry delay**: aumentado de 1s para 5s entre tentativas (SSL handshake timeouts intermitentes)
- **Schedule**: adicionado run às 16h BRT todos os dias — captura chuvas da tarde em dias de semana

### Observabilidade
- Workflow manual `check-apis.yml`: verifica todas as 10 APIs e publica painel de status no GitHub Actions Summary

## Test plan
- [ ] Build sem erros de TypeScript
- [ ] `/login` mobile: LCP < 2s (heading "Entrar" no HTML inicial)
- [ ] `/t/[id]` mobile: LCP < 2s (nome da trilha no HTML inicial)
- [ ] Mapa: trilhas não favoritadas exibem pin cinza, favoritadas exibem cor do veredicto
- [ ] Perfil > aba Conta: formulário inline com todos os campos, links externos para redes sociais
- [ ] Admin > Corrigir Localidades: re-geocodifica trilhas com cidade vazia
- [ ] Agente Python: log mostra `[OW precip]` quando timemachine detecta chuva recente
- [ ] Actions > Verificar APIs: painel 10/10 verde

🤖 Generated with [Claude Code](https://claude.com/claude-code)

# Contratos entre Gateway e auth service

Este documento registra a baseline da Fase 0. O Gateway transporta o contrato
HTTP; o `dass_auth_service` continua responsável por sessão, CSRF, autorização,
limites de autenticação e dependências de PostgreSQL/Redis.

## Topologia

Em produção, o auth deve permanecer acessível somente pela rede privada
`dass_private`, no serviço `main-service` e na porta interna `2123`. O Gateway
usa `MAIN_SERVICE` para alcançá-lo. A porta publicada `2123` do Compose de
desenvolvimento não deve ser usada como modelo de exposição de produção.

| Entrada pública | Caminho no auth | Contrato transportado |
| --- | --- | --- |
| `/api/auth/*` | `/auth/*` | Login legado, sessões, Identidades e administração |
| `/api/user/*` | `/user/*` | Integrações históricas |
| `/api/colaborador/*` | `/colaborador/*` | Integrações históricas |
| `/api/notification/send` | `/notification/send` | Requer `X-Service-Token`; uso interno |
| `/api/health/live` e `/api/health/ready` | `/health/live` e `/health/ready` | Diagnóstico do auth; não substitui o healthcheck do Gateway |

Os caminhos acima usam o fallback atual para `MAIN_SERVICE`. A publicação de
diagnósticos pelo Gateway deve ser revista junto com a Fase 3 e a segurança de
borda.

## Headers, cookies e corpo

| Elemento | Regra do Gateway | Regra do auth |
| --- | --- | --- |
| `Cookie` | Preserva o header recebido | Valida cookies HTTP-only separados por domínio de sessão |
| `Set-Cookie` | Preserva múltiplos headers na resposta | Rotaciona e limpa somente os cookies do fluxo correspondente |
| `Origin` | Encaminha para o destino | Valida CORS e origem de mutações administrativas |
| `X-CSRF-Token` | Encaminha sem interpretar | Valida token no Redis em mutações protegidas |
| `X-Service-Token` | Encaminha sem criar, armazenar ou registrar o valor | Exige credencial válida em `/notification/send` |
| `X-Forwarded-*` | Política precisa ser explicitamente validada | `TRUST_PROXY` e `X-Forwarded-Host` afetam IP e origem confiável |
| Corpo e query string | Preserva método, corpo e query | Interpreta conforme a API chamada |

As listas de origem do Gateway (`CORS_ORIGINS`) e do auth
(`CORS_ALLOWED_ORIGINS`/`IDENTITIES_ALLOWED_ORIGIN`) precisam ser compatíveis.
Alterar uma lista isoladamente pode fazer uma requisição passar por uma camada
e falhar na outra.

## Fronteiras de rede

O Gateway não adiciona JWT, não cria sessão e não autoriza usuário por unidade.
O auth não deve publicar `2123` no host em produção. Diesel, PortaRFID, portões,
Portaria, Refeitório e Químico possuem canais diretos ou realtime que não são
substituídos pelo proxy HTTP.

Testes do Gateway usam destinos locais efêmeros. Smoke tests do auth devem usar
ambiente descartável, credenciais de teste fora do repositório e nunca bancos,
dispositivos ou segredos de produção.

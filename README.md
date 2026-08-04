# Dass API Gateway

Gateway HTTP dos serviços internos da Dass. A aplicação recebe chamadas em `/api`, seleciona o destino pelo prefixo e encaminha a requisição sem interpretar ou transformar seu conteúdo.

## Arquitetura

```text
Cliente
  |
  v
Express 5: CORS -> Helmet -> log -> políticas opt-in
  |
  v
Proxy único com roteamento por tabela
  |-- /api/<serviço> -> serviço específico
  `-- /api/*         -> MAIN_SERVICE
```

O gateway usa uma única instância de `http-proxy-middleware`. A tabela de `src/proxy.ts` contém os destinos específicos e o fallback; sua ordem é parte do contrato.

O prefixo usado na seleção é removido no encaminhamento:

```text
GET /api/telas/usuarios?ativo=true
 -> GET <TELAS_SERVICE>/usuarios?ativo=true
```

Método, query string, corpo, content type, cookies, autorização, status e headers de resposta são preservados. Isso inclui os cookies `token` e `refreshToken` emitidos pelo `dass_auth_service`, que é o `MAIN_SERVICE` atual.

## Stack

- Node.js 24 LTS
- TypeScript 7
- Express 5
- `http-proxy-middleware` 4
- `cors`, `helmet` e `morgan`
- Docker e Docker Compose
- Testes com `node:test`

## Estrutura

```text
.
├── index.ts                    # configuração, listen e encerramento gracioso
├── src/
│   ├── app.ts                  # Express, CORS, Helmet, logs e políticas
│   ├── proxy.ts                # tabela e roteamento dos proxies
│   └── config/
│       └── dotenv.ts           # carga e validação da configuração
├── tests/
│   └── gateway.test.js         # contratos HTTP e operacionais
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

## Rotas

### Healthcheck

`GET /`

```json
{
  "message": "Dass API Gateway is running!"
}
```

O healthcheck confirma apenas o processo HTTP; ele não consulta os destinos.

### Proxies específicos

| Prefixo público | Variável de destino |
| --- | --- |
| `/api/telas` | `TELAS_SERVICE` |
| `/api/sobracorte` | `SOBRACORTE_SERVICE` |
| `/api/upload` | `UPLOAD_SERVICE` |
| `/api/diesel` | `DIESEL_SERVICE` |
| `/api/porta-emerg` | `PORTA_EMERG_SERVICE` |
| `/api/portaria` | `PORTARIA_SERVICE` |
| `/api/index-informativo` | `INDEX_INFORMATIVO_SERVICE` |
| `/api/automation` | `AUTOMATION_SERVICE` |
| `/api/dp` | `DP_SERVICE` |
| `/api/quimico` | `QUIMICO_SERVICE` |
| `/api/pcp` | `PCP_SERVICE` |
| `/api/refeitorio` | `REFEITORIO_SERVICE` |
| `/api/lean` | `LEAN_SERVICE` |
| `/api/att-ota` | `ATT_OTA_SERVICE` |
| `/api/solicitacao-brinde` | `SOLICITACAO_BRINDE_SERVICE` |
| `/api/checklist-maquina` | `CHECKLIST_MAQUINA_SERVICE` |
| `/api/almoxarifado-ti` | `ALMOXARIFADO_TI` |
| `/api/dass-users` | `DASS_USERS` |
| `/api/synapse-ti` | `SYNAPSE_TI` |

Qualquer outro caminho iniciado por `/api` usa `MAIN_SERVICE` e perde somente o prefixo `/api`:

```text
POST /api/auth/login -> POST <MAIN_SERVICE>/auth/login
```

## Configuração

Quando `DEV_ENV` possui qualquer valor, a aplicação tenta carregar `.env`; sem `DEV_ENV`, tenta carregar `.env.production`. Variáveis já fornecidas pelo processo ou pelo Compose têm precedência.

Configuração obrigatória:

- `GATEWAY_PORT`: porta interna do processo, entre 1 e 65535.
- `MAIN_SERVICE`: destino do fallback.
- Todas as variáveis da tabela de proxies específicos.

Configuração opcional:

| Variável | Default | Efeito |
| --- | --- | --- |
| `CORS_ORIGINS` | vazio | Acrescenta origens, separadas por vírgula, à lista compatível existente. |
| `RATE_LIMIT_ENABLED` | `false` | Ativa o limite apenas nas rotas `/api`. |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Janela do rate limit. |
| `RATE_LIMIT_MAX` | `100` | Requisições permitidas por cliente/janela. |
| `PROXY_TIMEOUT_MS` | `0` | Timeout do destino; `0` mantém o comportamento sem timeout configurado. |
| `STANDARD_PROXY_ERRORS_ENABLED` | `false` | Retorna JSON `502` ou `504` em falhas do destino. |

As opções operacionais permanecem desligadas por padrão para não alterar aplicações existentes.

Use `.env.example` como inventário. URLs dentro da rede Docker devem usar o nome DNS e a porta interna do serviço:

```env
GATEWAY_PORT=2399
MAIN_SERVICE=http://main-service:2399
TELAS_SERVICE=http://telas-service:3000
```

Não versione arquivos `.env` nem credenciais.

## Desenvolvimento e testes

Requisitos: Node.js 24 e npm. O arquivo `.nvmrc` fixa a linha usada pelo projeto.

```bash
npm ci
npm run dev
```

Scripts:

- `npm run dev`: executa e observa TypeScript com `tsx`.
- `npm run clean`: remove somente `dist/`.
- `npm run build`: limpa e compila para `dist/`.
- `npm start`: executa `dist/index.js`.
- `npm test`: compila e executa a suíte de contratos.

Os testes usam destinos HTTP simulados e cobrem todos os proxies, fallback, métodos/corpos/headers, cookies do auth, CORS, Helmet, logs, rate limit, timeout e erros padronizados.

## Docker

O build usa Node 24 em dois estágios e instala dependências reproduzivelmente com `npm ci`. A imagem final contém apenas dependências de produção e `dist/`; arquivos `.env` não entram no contexto nem na imagem.

O Compose lê o `.env` em runtime e permite configurar as portas de forma independente:

- `GATEWAY_PORT`: porta interna do Node.
- `GATEWAY_HOST_PORT`: porta publicada no host.
- Ambas usam `2399` somente como default do Compose.

Exemplos:

```env
# Mantém 2399 no host e usa 3000 dentro do container
GATEWAY_HOST_PORT=2399
GATEWAY_PORT=3000
```

Crie a rede externa uma vez e suba o serviço:

```bash
docker network create dass_private
docker compose up -d --build
```

## Segurança e operação

- Helmet permanece global.
- CORS aceita credenciais e mantém a lista histórica por compatibilidade.
- O gateway não autentica usuários. Autenticação, refresh e revogação pertencem ao serviço de autenticação.
- Logs registram método, caminho sem query string, status e duração; cookies, tokens e corpos não são registrados.
- Configuração ausente ou inválida impede a inicialização com uma lista dos campos incorretos.
- `SIGINT` e `SIGTERM` fecham conexões ociosas e aguardam até 10 segundos pelas conexões ativas.

## Balanceamento de carga

Não existe balanceamento dentro do processo. O protótipo round-robin anterior tinha somente uma instância, não era chamado e não possuía healthcheck ou retirada de destinos defeituosos, por isso foi removido.

Para escalar, configure `MAIN_SERVICE` ou outro destino com o endereço de um balanceador de infraestrutura, como ingress, Nginx, HAProxy, Docker Swarm ou Kubernetes. Antes de replicar o auth, ele precisa oferecer readiness confiável e compartilhar corretamente PostgreSQL, Redis e segredos JWT.

## Troubleshooting

- **Configuração inválida:** confira todas as variáveis obrigatórias listadas no erro de inicialização.
- **Proxy não conecta:** valide URL, porta e resolução DNS a partir da rede do gateway.
- **Rota usa o fallback:** confira se o prefixo existe na tabela de `src/proxy.ts`.
- **Erro de CORS:** a origem precisa coincidir com a lista padrão ou `CORS_ORIGINS`; caminhos não fazem parte do header `Origin`.
- **Healthcheck funciona, mas a API falha:** `/` não consulta os serviços de destino.

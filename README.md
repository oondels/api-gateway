# Dass API Gateway

Aplicação única que fornece o ponto de entrada HTTP para os serviços internos da Dass. Ela recebe requisições em `/api`, identifica o serviço pelo prefixo da URL e encaminha a chamada ao destino configurado, sem interpretar ou transformar o conteúdo.

## Como funciona

```text
Cliente
  |
  v
Dass API Gateway
  |-- /api/<aplicação>/... -> serviço configurado para a aplicação
  `-- /api/...              -> MAIN_SERVICE
```

O gateway mantém uma tabela de rotas em `src/proxy.ts`. Para cada rota cadastrada, remove o prefixo público antes de encaminhar a chamada. Por exemplo:

```text
GET /api/telas/usuarios?ativo=true
 -> GET <TELAS_SERVICE>/usuarios?ativo=true
```

Uma rota que não esteja na tabela é encaminhada para `MAIN_SERVICE`, também sem o prefixo `/api`:

```text
POST /api/auth/login
 -> POST <MAIN_SERVICE>/auth/login
```

O gateway preserva método HTTP, query string, corpo, `Content-Type`, cookies, cabeçalhos de autorização, status e cabeçalhos da resposta. Portanto, autenticação, emissão e renovação de cookies são responsabilidades do serviço de destino, não do gateway.

## Funcionalidades

- Proxy reverso para aplicações internas, selecionado pelo prefixo da rota.
- Fallback para `MAIN_SERVICE` em caminhos `/api` não cadastrados.
- Healthcheck em `GET /`, que valida somente se o processo HTTP está disponível.
- CORS com credenciais, Helmet e logs de acesso sem query string.
- Rate limit opcional somente para `/api`.
- Timeout e respostas JSON `502`/`504` opcionais para falhas do destino.
- Validação da configuração na inicialização e encerramento gracioso em `SIGINT` e `SIGTERM`.

## Rotas cadastradas

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

## Adicionar uma nova aplicação

Cada aplicação possui um prefixo público e uma variável de ambiente com a URL do serviço. Faça o cadastro nos três pontos abaixo no mesmo pull request.

1. Defina um prefixo único, por exemplo `/api/estoque`, e uma variável correspondente, por exemplo `ESTOQUE_SERVICE`.
2. Em `src/config/dotenv.ts`, inclua `ESTOQUE_SERVICE` em `SERVICE_ENV_KEYS`. Assim, a URL passa a ser obrigatória e fica disponível ao proxy com tipagem.
3. Em `src/proxy.ts`, adicione a rota em `PROXY_ROUTES`:

   ```ts
   { prefix: "/api/estoque", service: "ESTOQUE_SERVICE" },
   ```

4. Inclua `ESTOQUE_SERVICE=` em `.env.example` e configure a URL real em cada ambiente. Na rede Docker, use o nome DNS do serviço e sua porta interna, por exemplo `ESTOQUE_SERVICE=http://estoque-service:3000`.
5. Atualize a tabela de rotas deste README e execute `npm test`.

A suíte cria um destino para cada item de `PROXY_ROUTES`; por isso, o teste confirma que a nova rota seleciona o serviço certo e remove o prefixo. Não reutilize prefixos nem variáveis existentes. Como todas as variáveis da lista são obrigatórias, o deploy também deve receber o novo valor antes de iniciar a aplicação.

## Configuração

A aplicação sempre lê `.env`. Variáveis já presentes no ambiente do processo ou no Docker Compose têm precedência sobre esse arquivo.

Comece pelo inventário de variáveis:

```bash
cp .env.example .env
```

Configuração obrigatória:

- `GATEWAY_PORT`: porta interna do processo, entre 1 e 65535.
- `MAIN_SERVICE`: URL do destino usado no fallback.
- Todas as variáveis de destino da tabela de rotas.

Configuração opcional:

| Variável | Padrão | Uso |
| --- | --- | --- |
| `CORS_ORIGINS` | vazio | Adiciona origens separadas por vírgula à lista permitida. |
| `RATE_LIMIT_ENABLED` | `false` | Ativa limite de requisições em `/api`. |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Define a janela do rate limit em milissegundos. |
| `RATE_LIMIT_MAX` | `100` | Define requisições permitidas por cliente e janela. |
| `PROXY_TIMEOUT_MS` | `0` | Define timeout do destino; `0` não configura timeout. |
| `STANDARD_PROXY_ERRORS_ENABLED` | `false` | Retorna `502` ou `504` em JSON quando o destino falha. |
| `GATEWAY_HOST_PORT` | `2399` no Compose | Define a porta publicada pelo Docker. |

Exemplo mínimo de desenvolvimento:

```env
GATEWAY_PORT=2399
MAIN_SERVICE=http://main-service:3000
TELAS_SERVICE=http://telas-service:3000
# Preencha também todas as demais variáveis de destino do .env.example.
```

Não versione `.env` ou credenciais.

## Uso

### Desenvolvimento local

Requisitos: Node.js 24 e npm. O modo de desenvolvimento observa os arquivos; ambos os modos usam o mesmo `.env`.

```bash
npm ci
npm run dev
```

O processo atende na porta definida por `GATEWAY_PORT`. Verifique sua disponibilidade com:

```bash
curl http://localhost:2399/
```

### Produção com Docker

Crie a rede externa uma única vez e então construa e inicie a aplicação:

```bash
docker network create dass_private
docker compose up -d --build
```

O Compose publica `${GATEWAY_HOST_PORT:-2399}` no host e executa o Node em `${GATEWAY_PORT:-2399}`. Os destinos configurados nessa rede devem usar nome DNS e porta interna do container, nunca `localhost`.

## Scripts e testes

- `npm run dev`: executa TypeScript em modo observação.
- `npm run build`: limpa `dist/` e compila o projeto.
- `npm start`: executa a versão compilada.
- `npm test`: compila e executa os contratos HTTP e operacionais.

Os testes cobrem healthcheck, todas as rotas específicas, fallback, encaminhamento de método/corpo/cookies/cabeçalhos, CORS, Helmet, logs, rate limit, timeout e falhas de proxy.

## Estrutura

```text
.
├── index.ts                    # inicialização e encerramento gracioso
├── src/
│   ├── app.ts                  # Express, segurança, logs e políticas opcionais
│   ├── proxy.ts                # tabela e encaminhamento das rotas
│   └── config/dotenv.ts        # carga e validação das variáveis
├── tests/gateway.test.js       # contratos do gateway
├── .env.example                # inventário de configuração
├── docker-compose.yml
└── Dockerfile
```

## Diagnóstico rápido

- **Falha na inicialização:** complete as variáveis obrigatórias indicadas no erro.
- **Rota usa `MAIN_SERVICE`:** confirme o prefixo em `src/proxy.ts`.
- **Proxy não conecta:** valide URL, porta e DNS a partir da rede do gateway.
- **CORS bloqueado:** inclua a origem completa em `CORS_ORIGINS`; caminhos não fazem parte do header `Origin`.
- **Healthcheck responde, mas a API falha:** `GET /` não consulta os serviços de destino.

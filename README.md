# Dass API Gateway

Gateway HTTP em Node.js/TypeScript para centralizar requisicoes e redirecionar para outras APIs via proxy.

## Visao Geral

Este projeto expoe um endpoint de healthcheck e encaminha as rotas em `/api/*` para APIs de destino configuradas via variavel de ambiente.

- Base: Express + TypeScript
- Proxy: `http-proxy-middleware`
- Seguranca base: `helmet`, `cors`
- Container: Docker + Docker Compose

## Stack

- Node.js 20
- TypeScript
- Express
- http-proxy-middleware
- Docker / Docker Compose

## Estrutura do Projeto

```text
.
├── index.ts
├── src/
│   ├── proxy.ts
│   ├── loadBalancer.ts
│   ├── config/
│   │   ├── dotenv.ts
│   │   └── ip.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   └── rateLimit.ts
│   └── types/
│       └── express.d.ts
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

## Variaveis de Ambiente

O projeto carrega:

- `.env` quando `DEV_ENV` estiver definido
- `.env.production` quando `DEV_ENV` nao estiver definido

Variaveis usadas:

- `DEV_ENV` (ex: `development`)
- `GATEWAY_PORT` (ex: `2307`)
- `MAIN_SERVICE` (ex: `http://main-service:2121`)
- `JWT_SECRET` (usada no middleware de autenticacao)

### Exemplo de `.env`

```env
DEV_ENV=development
GATEWAY_PORT=2307
MAIN_SERVICE=http://localhost:2121
JWT_SECRET=sua_chave_jwt_aqui
```

## Como Rodar Localmente

### 1. Instalar dependencias

```bash
npm install
```

### 2. Executar em desenvolvimento

```bash
npm run dev
```

A API sobe em:

- `http://localhost:2307`

## Scripts

- `npm run dev`: sobe em modo desenvolvimento com `nodemon` + `ts-node`
- `npm run build`: compila TypeScript para `dist/`
- `npm test`: placeholder (nao ha testes configurados)

## Endpoints

### Healthcheck

- `GET /`
- Resposta esperada:

```json
{
	"message": "Dass API Gateway is running!"
}
```

### Proxy principal

- `ALL /api/*`
- Encaminha para `MAIN_SERVICE`
- Remove o prefixo `/api` antes de enviar para o servico de destino

Exemplo:

- Requisicao no gateway: `GET /api/users`
- Requisicao na API de destino: `GET /users`

## Docker

### Build da imagem

```bash
docker build -t dass-gateway .
```

### Subir com Compose

```bash
docker compose up -d --build
```

Configuracao atual:

- Porta publicada: `2307:2307`
- Rede externa: `dass_private`
- Container: `gateway-app`
- Servico (hostname interno): `gateway`

### Importante sobre rede Docker

Para comunicacao entre containers na mesma rede, use nome do servico/container, nao `localhost`.

Exemplo de `MAIN_SERVICE` dentro da rede Docker:

```env
MAIN_SERVICE=http://nome-do-servico:2121
```

## Middlewares disponiveis

Arquivos prontos no projeto:

- `src/middleware/auth.ts`: validacao de JWT via cookie (`token`)
- `src/middleware/rateLimit.ts`: limitador de 100 requisicoes por 15 minutos

Observacao: no estado atual, esses dois middlewares existem no codigo, mas nao estao aplicados globalmente no `index.ts`.

## Load Balancer

Existe implementacao inicial em `src/loadBalancer.ts` (round-robin), atualmente nao integrada no bootstrap principal.
Hoje, o gateway usa `setupProxy` de `src/proxy.ts`.

## Producao

Fluxo esperado:

1. `npm run build`
2. executar `node dist/index.js` (ou via container)
3. definir `.env.production` com valores de producao

## Troubleshooting

- Erro ao subir no Compose por rede: verifique se a rede externa existe:

```bash
docker network ls
```

- Se nao existir, crie:

```bash
docker network create dass_private
```

- Se o proxy retornar erro de conexao, valide `MAIN_SERVICE` e se o servico alvo esta acessivel.

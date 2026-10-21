# Arquitetura

## Fluxo de uma requisição

O Gateway é uma aplicação Node.js 24/TypeScript com Express. [index.ts](../index.ts) carrega a configuração, cria a aplicação e escuta em `0.0.0.0` na porta configurada.

[src/app.ts](../src/app.ts) aplica CORS, Helmet, logs e o rate limit opcional antes do proxy em `/api`. [src/config/routes.ts](../src/config/routes.ts) é o registro único de prefixos e destinos; [src/proxy.ts](../src/proxy.ts) o utiliza para selecionar o destino.

Para uma rota explícita, remove `/api/<prefixo>`. Uma chamada não cadastrada sob `/api` segue para `MAIN_SERVICE`, removendo apenas `/api`. Por exemplo, `POST /api/auth/login` chega ao serviço principal como `POST /auth/login`.

O proxy preserva método, query, corpo, cookies, cabeçalhos de autorização, status e cabeçalhos da resposta. Não interpreta o corpo nem emite ou valida JWT; isso é responsabilidade dos destinos.

## Organização

| Caminho | Responsabilidade |
| --- | --- |
| [index.ts](../index.ts) | Listener e encerramento |
| [src/app.ts](../src/app.ts) | Composição dos middlewares e healthcheck |
| [src/config/routes.ts](../src/config/routes.ts) | Registro e validação de rotas |
| [src/proxy.ts](../src/proxy.ts) | Reescrita e erros opcionais |
| [src/config/dotenv.ts](../src/config/dotenv.ts) | Carga e validação do ambiente |
| [tests/gateway.test.js](../tests/gateway.test.js) | Contratos HTTP com servidores locais |
| [Dockerfile](../Dockerfile) | Build TypeScript e imagem de execução |
| [docker-compose.yml](../docker-compose.yml) | Publicação de porta e rede externa |

Não há balanceador round-robin próprio, middleware JWT ou alternância automática por `DEV_ENV`. A configuração usa `.env` conforme o [guia de ambiente](configuracao.md).

## Ciclo de vida e limites

`GET /health/live` e `GET /health/ready` respondem sem consultar os destinos externos,
garantindo a estabilidade e prevenindo quedas em cascata do container. `GET /` permanece
por compatibilidade.

Em SIGINT/SIGTERM, o processo fica não pronto, fecha conexões ociosas, aguarda
o encerramento e força o fechamento após dez segundos.

O Gateway atual encaminha HTTP e WebSocket (para `ERP_MODELAGEM_SERVICE`). Não
inclui provisionamento dos bancos ou dispositivos dos serviços. As [exceções de
transporte](rotas.md) permanecem acessíveis pelas portas dos backends.

`x-request-id` é preservado quando válido ou gerado pelo Gateway, retornado ao
cliente e encaminhado ao destino. Logs incluem o ID, o destino lógico, o
status e a duração, sem query string.

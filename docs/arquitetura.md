# Arquitetura

## Fluxo de uma requisição

O Gateway é uma aplicação Node.js 24/TypeScript com Express. [index.ts](../index.ts) carrega a configuração, cria a aplicação e escuta em `0.0.0.0` na porta configurada.

[src/app.ts](../src/app.ts) aplica CORS, Helmet, logs e o rate limit opcional antes do proxy em `/api`. [src/proxy.ts](../src/proxy.ts) seleciona o destino com base na tabela `PROXY_ROUTES`.

Para uma rota explícita, remove `/api/<prefixo>`. Uma chamada não cadastrada sob `/api` segue para `MAIN_SERVICE`, removendo apenas `/api`. Por exemplo, `POST /api/auth/login` chega ao serviço principal como `POST /auth/login`.

O proxy preserva método, query, corpo, cookies, cabeçalhos de autorização, status e cabeçalhos da resposta. Não interpreta o corpo nem emite ou valida JWT; isso é responsabilidade dos destinos.

## Organização

| Caminho | Responsabilidade |
| --- | --- |
| [index.ts](../index.ts) | Listener e encerramento |
| [src/app.ts](../src/app.ts) | Composição dos middlewares e healthcheck |
| [src/proxy.ts](../src/proxy.ts) | Destinos, reescrita e erros opcionais |
| [src/config/dotenv.ts](../src/config/dotenv.ts) | Carga e validação do ambiente |
| [tests/gateway.test.js](../tests/gateway.test.js) | Contratos HTTP com servidores locais |
| [Dockerfile](../Dockerfile) | Build TypeScript e imagem de execução |
| [docker-compose.yml](../docker-compose.yml) | Publicação de porta e rede externa |

Não há balanceador round-robin próprio, middleware JWT ou alternância automática por `DEV_ENV`. A configuração usa `.env` conforme o [guia de ambiente](configuracao.md).

## Ciclo de vida e limites

`GET /` responde sem consultar os destinos. Em SIGINT/SIGTERM, o processo fecha conexões ociosas, aguarda o encerramento e força o fechamento após dez segundos.

O Gateway atual encaminha HTTP; não configura proxy de upgrade WebSocket. Não inclui provisionamento dos bancos ou dispositivos dos serviços. As [exceções de transporte](rotas.md) permanecem acessíveis pelas portas dos backends.

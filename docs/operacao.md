# Operação e manutenção

## Desenvolvimento e testes

Com Node.js 24/npm e o ambiente configurado:

| Comando | Uso |
| --- | --- |
| `npm ci` | Instala dependências pelo lockfile |
| `npm run dev` | Executa TypeScript com observação de arquivos |
| `npm run build` | Limpa `dist/` e compila |
| `npm start` | Executa `dist/index.js` |
| `npm test` | Compila e executa os testes HTTP |

Os testes criam destinos locais para healthcheck, rotas, fallback, métodos, corpos, cookies, CORS, logs, rate limit e falhas de proxy. Precisam de permissão para abrir sockets em loopback; não validam as APIs corporativas nem dispositivos reais.

## Docker

O [Dockerfile](../Dockerfile) usa etapas de build e execução, instala apenas dependências de produção na etapa final e executa como usuário `node`.

O [Compose](../docker-compose.yml) exige a rede externa `dass_private`. Se ela ainda não existir, crie-a no ambiente autorizado com `docker network create dass_private`. Para construir e iniciar/atualizar o Gateway:

```bash
docker compose up -d --build
```

O Compose carrega `.env`, publica `GATEWAY_HOST_PORT` para `GATEWAY_PORT` (2399 por padrão), usa reinício `unless-stopped`, declara limite de memória de 200 MB e consulta `/health/live`. Construir o código não atualiza sozinho o container existente.

## Acrescentar uma rota

1. Escolha um prefixo e uma variável de destino distintos.
2. Inclua prefixo e variável no registro único de [routes.ts](../src/config/routes.ts).
3. Atualize [o exemplo de ambiente](../.env.example) e a [tabela de rotas](rotas.md).
4. Execute `npm test` e configure o novo destino no ambiente de implantação antes de iniciar a versão nova.

Os testes percorrem as rotas explícitas e verificam a documentação, mas o
contrato de cada API ainda precisa ser respeitado.

## Diagnóstico

| Sintoma | Verificação |
| --- | --- |
| Falha ao iniciar | Variáveis obrigatórias e opções inválidas no erro de configuração |
| Requisição chega ao MAIN_SERVICE | Prefixo e limites de caminho na tabela |
| Proxy indisponível | URL, DNS, porta e conectividade a partir da rede do container |
| CORS no navegador | Origem completa com protocolo/porta; sem caminho |
| `401/403` | Resposta do serviço de destino, sessão e autorização |
| `GET /` funciona e API falha | Consulte `/health/ready` e a conectividade com o destino configurado |
| Dispositivo não responde | Conexão no backend e canais diretos |

`GET /health/live` e `GET /health/ready` verificam a saúde do processo sem acoplar probes
externas. Não use rotas de acionamento físico nem payloads fictícios persistidos para verificar saúde.

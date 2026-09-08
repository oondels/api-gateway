# Configuração

A aplicação sempre lê `.env`. Variáveis já presentes no ambiente do processo ou no Docker Compose têm precedência sobre esse arquivo.

Comece pelo inventário de variáveis:

```bash
cp .env.example .env
```

Configuração obrigatória:

- `GATEWAY_PORT`: porta interna do processo, entre 1 e 65535.
- `MAIN_SERVICE`: URL do destino usado no fallback.
- Todas as variáveis de destino da [tabela de rotas](rotas.md).

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


## Rede e validação

URLs de destinos devem ser alcançáveis a partir do processo do Gateway. Containers na mesma rede usam DNS e porta interna. `localhost` dentro do container aponta para o próprio container, não para serviços no host.

Para serviços no host, use um endereço alcançável. `host.docker.internal` só funciona se houver resolução/mapeamento no ambiente; o Compose deste repositório não declara `extra_hosts`.

O carregador verifica presença dos destinos e os tipos/faixas das opções operacionais; não testa conectividade nem valida integralmente a sintaxe das URLs de destino. Consulte [operação](operacao.md) para diagnóstico.

# Rotas e funcionalidades

## Destinos HTTP

| Prefixo público | Variável de destino |
| --- | --- |
| `/api/telas` | `TELAS_SERVICE` |
| `/api/sobracorte` | `SOBRACORTE_SERVICE` |
| `/api/upload` | `UPLOAD_SERVICE` |
| `/api/diesel` | `DIESEL_SERVICE` |
| `/api/porta-emerg` | `PORTA_EMERG_SERVICE` |
| `/api/portaria` | `PORTARIA_SERVICE` |
| `/api/porta-rfid` | `PORTA_RFID_SERVICE` |
| `/api/automation` | `AUTOMATION_SERVICE` |
| `/api/dp` | `DP_SERVICE` |
| `/api/quimico` | `QUIMICO_SERVICE` |
| `/api/refeitorio` | `REFEITORIO_SERVICE` |
| `/api/att-ota` | `ATT_OTA_SERVICE` |
| `/api/solicitacao-brinde` | `SOLICITACAO_BRINDE_SERVICE` |
| `/api/almoxarifado-ti` | `ALMOXARIFADO_TI` |
| `/api/dass-users` | `DASS_USERS` |
| `/api/synapse-ti` | `SYNAPSE_TI` |
| `/api/pe-confirmado-teste` | `PE_CONFIRMADO_TESTE` |
| `/api/amostras-tintas` | `AMOSTRAS_TINTAS` |
| `/api/checklist-app` | `CHECKLIST_APP_SERVICE` |


Todas as variáveis de destino são obrigatórias. Para caminhos sob `/api` sem prefixo cadastrado, o destino é `MAIN_SERVICE`.

## Reescrita e compatibilidade

| Chamada no Gateway | Caminho recebido no destino |
| --- | --- |
| `/api/telas/usuarios?ativo=true` | `/usuarios?ativo=true` |
| `/api/diesel/read-signal` | `/read-signal` |
| `/api/porta-rfid/api/open/:id` | `/api/open/:id` |
| `/api/auth/login` | `/auth/login` no MAIN_SERVICE |

A API PortaRFID usa seu próprio prefixo `/api`; ele deve permanecer após a remoção do prefixo do Gateway.

## Políticas HTTP

CORS permite credenciais e combina a lista interna com as origens adicionais configuradas. Helmet acrescenta cabeçalhos de segurança. Logs incluem método, caminho sem query, status e tempo de resposta.

Rate limit está desativado por padrão e, quando habilitado, aplica-se a `/api`. Timeout de proxy e respostas padronizadas são opcionais: com erros padronizados, falhas de conexão resultam em `502` e timeouts reconhecidos em `504`. Consulte os valores em [configuração](configuracao.md).

## Exceções de transporte e acesso

A entrada HTTP do Gateway coexiste com clientes diretos. O endpoint do ESP32 Diesel é `POST /read-signal` na porta `3021`, sem JWT; a tela usa Socket.IO diretamente nessa porta. A URL efetiva do firmware é uma configuração externa.

PortaRFID mantém WebSocket de dispositivos e HTTP de clientes legados em `3010`. Suas rotas HTTP permanecem públicas por compatibilidade; o frontend Unix atual usa o Gateway para esses comandos. O Gateway não acrescenta uma barreira JWT a essas rotas.

Portaria, Refeitório, Químico e portões também têm canais realtime diretos. Manter `/api/diesel` e `/api/porta-rfid` preserva os contratos HTTP e não substitui conexões de dispositivos.

Mudanças em autenticação, caminhos ou exposição dessas portas exigem verificar os consumidores existentes. A disponibilidade de HTTP não confirma a conexão física do dispositivo.

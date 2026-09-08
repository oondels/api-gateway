# Dass API Gateway

Proxy HTTP para os serviços Dass: seleciona o destino pelo prefixo da URL e preserva corpo, cookies, cabeçalhos e respostas.

## Começar

Requisitos: Node.js 24 e npm. Copie `.env.example` para `.env` e preencha todos os destinos conforme a [configuração](docs/configuracao.md).

```bash
npm ci
npm run dev
```

`GET /` informa a disponibilidade HTTP do processo.

## Documentação

Consulte o [índice em docs/](docs/README.md): arquitetura, rotas e funcionalidades, configuração, operação e manutenção.

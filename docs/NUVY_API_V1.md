# Nuvy Licitações API v1

A API v1 expõe as oportunidades normalizadas do Nuvy para integrações externas.

Base URL:

`https://kdboegkwiqktxykbayeq.supabase.co/functions/v1/nuvy-api-v1`

## Autenticação

Nesta primeira versão a API usa o access token de uma conta autenticada no Supabase.

Envie:

`Authorization: Bearer <SUPABASE_ACCESS_TOKEN>`

O usuário precisa pertencer a uma organização do Nuvy. O escopo dos dados é resolvido automaticamente pela organização do usuário.

## Endpoints

### GET /

Healthcheck e descoberta básica da API.

### GET /opportunities

Lista oportunidades com paginação e filtros.

Parâmetros suportados:

- `page`
- `per_page` (1 a 200)
- `q`
- `state`
- `city`
- `source`
- `status`
- `min_value`
- `min_score`
- `favorite=true`
- `published_after`
- `deadline_before`
- `sort=score|estimated_value|published_at|deadline_at|collected_at`
- `order=asc|desc`

Exemplo:

`GET /opportunities?state=SP&min_value=300000&min_score=70&page=1&per_page=50`

### GET /opportunities/:id

Retorna uma oportunidade específica da organização autenticada.

### GET /sources

Lista fontes internas e conectores configurados, incluindo quantidade de oportunidades já encontradas por fonte.

### POST /sync

Inicia uma varredura completa. Requer perfil `admin` ou `manager`.

Body opcional:

```json
{
  "days_back": 30,
  "days_ahead": 120,
  "max_pages": 100,
  "include_legacy": true,
  "connector_ids": []
}
```

A sincronização orquestra PNCP, Compras.gov.br Legado e os conectores adicionais ativos.

## Resposta de listagem

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "per_page": 50,
    "total": 0,
    "total_pages": 0,
    "filters": {}
  }
}
```

## Próximas evoluções

- credenciais próprias de integração por cliente, sem depender de sessão Supabase;
- rate limiting por credencial;
- webhooks para novas oportunidades;
- endpoint de estatísticas agregadas;
- documentação OpenAPI/Swagger;
- deduplicação cross-source mais avançada.

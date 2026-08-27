# Nuvy Legal Radar

Plataforma personalizada para monitoramento inteligente de oportunidades jurídicas.

## Escopo da proposta implementado no produto

- Radar de oportunidades jurídicas com corte mínimo de R$ 300.000
- Dashboard executivo com contratante, objeto, valor, publicação, prazo e origem
- Filtros, score de aderência, favoritos/status e priorização
- Fila de pendências com prazo, urgência, responsável e follow-up
- Indicadores de desempenho por colaborador preparados para dados de integração
- Módulo separado de consulta processual por CPF, preparado para Escavador
- Estrutura Supabase multi-organização com RLS
- Coleta multi-fonte para ampliar a cobertura de oportunidades

## Motor de coleta

### 1. PNCP

`pncp-sync` consulta as modalidades do PNCP com paginação completa. A janela padrão considera publicações recentes e oportunidades com prazo futuro. O coletor não descarta oportunidades jurídicas apenas porque o valor não veio estruturado na API; nesses casos o valor fica para validação no edital/anexo.

### 2. Compras.gov.br

`compras-sync` usa a API oficial de Dados Abertos do Compras.gov.br em duas frentes:

- Contratações da Lei 14.133/2021, usadas também como rota de redundância/enriquecimento dos registros PNCP.
- Módulo Legado, para licitações federais que ainda estejam disponíveis na base histórica do SIASG/Compras.gov.br.

A função percorre todas as páginas disponíveis dentro do limite configurado e usa páginas de até 500 registros.

### 3. Portais estaduais, municipais, diários oficiais e fontes privadas públicas

`source-sync` lê conectores cadastrados em `source_connectors`. Isso permite adicionar novas fontes sem criar um novo sistema para cada município.

Tipos suportados atualmente:

- `json`: API REST/JSON pública.
- `rss`: feed RSS/Atom de diário oficial ou portal de avisos.

Categorias:

- `state_portal`
- `municipal_portal`
- `official_diary`
- `private_public_source`

Exemplo de configuração JSON:

```json
{
  "items_path": "resultado",
  "state": "SP",
  "sphere": "Estadual",
  "mapping": {
    "id": "id",
    "title": "titulo",
    "object": "objeto",
    "value": "valorEstimado",
    "deadline": "dataEncerramento",
    "published_at": "dataPublicacao",
    "buyer_name": "orgao.nome",
    "buyer_cnpj": "orgao.cnpj",
    "city": "municipio",
    "state": "uf",
    "process_number": "processo",
    "modality": "modalidade",
    "url": "link"
  }
}
```

Para RSS normalmente basta cadastrar a URL e, opcionalmente, `state`, `city` e `sphere` dentro de `config`.

### 4. Execução conjunta

`sync-all` dispara em paralelo:

- `pncp-sync`
- `compras-sync`
- `source-sync`

Exemplo de body:

```json
{
  "organization_id": "UUID_DA_ORGANIZACAO",
  "days_back": 30,
  "days_ahead": 120,
  "max_pages": 100,
  "include_legacy": true
}
```

## Regra de relevância

O coletor procura termos fortes e amplos relacionados a advocacia e serviços jurídicos. O corte financeiro é R$ 300 mil quando o valor está disponível. Oportunidades juridicamente aderentes sem valor estruturado são mantidas para validação, porque alguns portais deixam o valor apenas no edital ou anexo.

## Diários oficiais

A arquitetura aceita feeds públicos RSS/Atom imediatamente. O DOU também disponibiliza conteúdo em dados abertos/XML pelo INLABS, mas o acesso a esse portal requer cadastro/credenciais; portanto, a ativação dessa fonte deve usar credenciais do ambiente e não dados embutidos no código.

## Dependências externas

A cobertura final depende das fontes públicas/privadas tecnicamente acessíveis e validadas. O Escavador depende de credenciais/API e custos aprovados pelo contratante. Indicadores reais por colaborador dependem de uma integração que forneça responsável e horários das interações.

## Fora do escopo atual

- Gestão/visualização de conversas de WhatsApp
- SLA bidirecional completo de atendimento
- Relatórios avançados além dos indicadores contratados
- APIs comerciais, bases privadas e serviços premium sem aprovação

## Stack

React + TypeScript + Vite + Supabase.

## Local

```bash
npm install
npm run dev
```

## Produção

1. Criar/conectar projeto Supabase.
2. Executar `supabase/schema.sql`.
3. Fazer deploy das funções `pncp-sync`, `compras-sync`, `source-sync` e `sync-all`.
4. Configurar conectores adicionais na tabela `source_connectors`.
5. Configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
6. Validar fontes estaduais/municipais e credenciais externas antes de ativá-las em produção.

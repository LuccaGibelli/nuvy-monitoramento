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
- Edge Function inicial para coleta PNCP

## Dependências externas

A coleta real depende das fontes validadas. O Escavador depende de credenciais/API e custos aprovados pelo contratante. Indicadores reais por colaborador dependem de uma integração que forneça responsável e horários das interações.

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
3. Configurar secrets do Supabase e fontes externas.
4. Deploy da função `pncp-sync`.
5. Configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
6. Validar fontes iniciais e credenciais do Escavador antes de ativar consultas reais.

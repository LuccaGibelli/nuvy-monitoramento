# Nuvy Pulse

Central de inteligência para monitoramento, qualificação e priorização de oportunidades jurídicas e editais.

## Prioridade atual

A primeira entrega é focada no Radar de Editais para sociedades de advogados, com oportunidades de valor igual ou superior a R$ 300.000, score de aderência, filtros, prazos, favoritos e análise inteligente.

## Stack

- React
- TypeScript
- Vite
- Lucide Icons
- Supabase planejado para banco, autenticação, RLS, Edge Functions e jobs

## Rodar localmente

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Roadmap

1. Interface e domínio do Radar de Editais
2. Supabase e autenticação
3. Persistência das oportunidades
4. Conector PNCP / fontes oficiais
5. Deduplicação e score
6. Análise por IA
7. Notificações e relatórios
8. Integração Escavador para inteligência processual
9. Módulo de atendimento em fase posterior

## Segurança

Tokens de APIs nunca devem ser enviados para o frontend. Integrações como Escavador deverão usar backend/Edge Functions e secrets de ambiente.

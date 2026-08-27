import type { CollaboratorMetric, Opportunity, PendingItem } from './types'

export const opportunities: Opportunity[] = [
  { id:'1', title:'Contratação de sociedade de advogados para consultoria jurídica especializada', organization:'Prefeitura Municipal de Campinas', city:'Campinas', state:'SP', sphere:'Municipal', processNumber:'PE 082/2026', modality:'Pregão Eletrônico', object:'Prestação continuada de serviços de consultoria, assessoria e representação jurídica.', estimatedValue:1280000, publishedAt:'26/08/2026', deadline:'02/09/2026', source:'PNCP', sourceUrl:'#', status:'Novo', score:96, summary:'Alta aderência: contratação direta de serviços advocatícios, valor superior ao corte e prazo curto para análise.', favorite:true },
  { id:'2', title:'Serviços técnicos especializados em direito tributário e recuperação de créditos', organization:'Autarquia Municipal de Serviços Públicos', city:'Ribeirão Preto', state:'SP', sphere:'Autarquia', processNumber:'CP 014/2026', modality:'Concorrência', object:'Consultoria tributária, recuperação de créditos e representação administrativa e judicial.', estimatedValue:780000, publishedAt:'25/08/2026', deadline:'08/09/2026', source:'Compras.gov.br', sourceUrl:'#', status:'Em análise', score:91, summary:'Oportunidade aderente ao segmento jurídico tributário com escopo técnico compatível e valor relevante.' },
  { id:'3', title:'Assessoria legal e elaboração de pareceres administrativos', organization:'Companhia Estadual de Desenvolvimento', city:'Belo Horizonte', state:'MG', sphere:'Empresa pública', processNumber:'LIC 201/2026', modality:'Licitação eletrônica', object:'Assessoria legal em direito administrativo, contratos públicos e emissão de pareceres.', estimatedValue:450000, publishedAt:'24/08/2026', deadline:'12/09/2026', source:'Portal estadual', sourceUrl:'#', status:'Interessante', score:84, summary:'Boa aderência temática e financeira. Recomendada leitura das exigências de qualificação técnica.' },
  { id:'4', title:'Consultoria especializada para contencioso estratégico', organization:'Empresa Nacional de Infraestrutura S.A.', city:'Brasília', state:'DF', sphere:'Empresa pública', processNumber:'RFP 033/2026', modality:'Seleção competitiva', object:'Apoio jurídico especializado em contencioso estratégico e direito empresarial.', estimatedValue:2350000, publishedAt:'23/08/2026', deadline:'30/08/2026', source:'Portal próprio', sourceUrl:'#', status:'Participaremos', score:93, summary:'Contrato de alto valor e ótima aderência. Prioridade elevada devido à proximidade do encerramento.', favorite:true },
]

export const pendingItems: PendingItem[] = [
  { id:'p1', client:'Cliente Alfa', request:'Procuração e documentos societários', owner:'Mariana', dueAt:'27/08/2026', urgency:'Crítica', status:'Urgente' },
  { id:'p2', client:'Cliente Beta', request:'Comprovante de endereço atualizado', owner:'Rafael', dueAt:'29/08/2026', urgency:'Alta', status:'Aguardando cliente' },
  { id:'p3', client:'Cliente Gama', request:'Contrato social consolidado', owner:'Mariana', dueAt:'02/09/2026', urgency:'Normal', status:'Aguardando cliente' },
]

export const collaboratorMetrics: CollaboratorMetric[] = [
  { id:'c1', name:'Mariana', averageResponseMinutes:12, handled:84, pending:3 },
  { id:'c2', name:'Rafael', averageResponseMinutes:18, handled:71, pending:2 },
  { id:'c3', name:'Fernanda', averageResponseMinutes:9, handled:96, pending:1 },
]

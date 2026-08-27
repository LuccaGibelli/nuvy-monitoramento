export type OpportunityStatus = 'Novo' | 'Em análise' | 'Interessante' | 'Participaremos' | 'Documentação' | 'Proposta em elaboração' | 'Enviado' | 'Aguardando resultado' | 'Ganho' | 'Perdido' | 'Descartado'

export interface Opportunity {
  id: string; title: string; organization: string; city: string; state: string; sphere: string
  processNumber: string; modality: string; object: string; estimatedValue: number | null
  publishedAt: string; deadline: string; source: string; sourceUrl: string
  status: OpportunityStatus; score: number; summary: string; favorite?: boolean
}

export type PendingStatus = 'Aguardando cliente' | 'Urgente' | 'Concluído'
export interface PendingItem {
  id: string; client: string; request: string; owner: string; dueAt: string; urgency: 'Normal' | 'Alta' | 'Crítica'; status: PendingStatus
}

export interface CollaboratorMetric {
  id: string; name: string; averageResponseMinutes: number; handled: number; pending: number
}

export interface ProcessLookup {
  cpf: string; holder: string; processNumber: string; court: string; status: string; lastUpdate: string; summary: string
}

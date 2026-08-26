export type OpportunityStatus =
  | 'Novo'
  | 'Em análise'
  | 'Interessante'
  | 'Participaremos'
  | 'Documentação'
  | 'Proposta em elaboração'
  | 'Enviado'
  | 'Aguardando resultado'
  | 'Ganho'
  | 'Perdido'
  | 'Descartado'

export interface Opportunity {
  id: string
  title: string
  organization: string
  city: string
  state: string
  sphere: string
  processNumber: string
  modality: string
  object: string
  estimatedValue: number | null
  publishedAt: string
  deadline: string
  source: string
  sourceUrl: string
  status: OpportunityStatus
  score: number
  summary: string
  favorite?: boolean
}

import { useMemo, useState } from 'react'
import {
  Bell,
  Bookmark,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  FileSearch,
  Filter,
  LayoutDashboard,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react'
import { opportunities } from './data'
import type { Opportunity } from './types'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function daysUntil(date: string) {
  const [day, month, year] = date.split('/').map(Number)
  const target = new Date(year, month - 1, day)
  const today = new Date(2026, 7, 26)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function scoreLabel(score: number) {
  if (score >= 90) return 'Altíssima aderência'
  if (score >= 75) return 'Boa oportunidade'
  if (score >= 50) return 'Analisar'
  return 'Baixa aderência'
}

function OpportunityCard({ item }: { item: Opportunity }) {
  const days = daysUntil(item.deadline)
  return (
    <article className="opportunity-card">
      <div className="opportunity-top">
        <div className="score-box">
          <strong>{item.score}</strong>
          <span>score</span>
        </div>
        <div className="opportunity-heading">
          <div className="eyebrow-row">
            <span className="source-pill">{item.source}</span>
            <span>{item.sphere}</span>
            <span>{item.state}</span>
          </div>
          <h3>{item.title}</h3>
          <p className="organization"><Building2 size={15} /> {item.organization} · {item.city}/{item.state}</p>
        </div>
        <button className={`icon-button ${item.favorite ? 'active' : ''}`} aria-label="Favoritar"><Bookmark size={18} /></button>
      </div>

      <p className="object-text">{item.object}</p>

      <div className="opportunity-metrics">
        <div><span>Valor estimado</span><strong>{item.estimatedValue ? money.format(item.estimatedValue) : 'Não identificado'}</strong></div>
        <div><span>Encerramento</span><strong>{item.deadline}</strong></div>
        <div><span>Prazo restante</span><strong className={days <= 4 ? 'danger-text' : ''}>{days} dias</strong></div>
        <div><span>Aderência</span><strong>{scoreLabel(item.score)}</strong></div>
      </div>

      <div className="ai-summary">
        <Sparkles size={17} />
        <p><b>Leitura rápida da IA:</b> {item.summary}</p>
      </div>

      <div className="card-footer">
        <div className="meta"><span>{item.processNumber}</span><span>Publicado em {item.publishedAt}</span></div>
        <div className="card-actions">
          <button className="secondary-button">Analisar com IA</button>
          <button className="primary-button">Abrir oportunidade <ChevronRight size={16} /></button>
        </div>
      </div>
    </article>
  )
}

export default function App() {
  const [query, setQuery] = useState('')
  const [minimum, setMinimum] = useState(300000)
  const [highScoreOnly, setHighScoreOnly] = useState(false)

  const filtered = useMemo(() => opportunities.filter((item) => {
    const haystack = `${item.title} ${item.organization} ${item.object} ${item.city} ${item.state}`.toLowerCase()
    const matchesQuery = haystack.includes(query.toLowerCase())
    const matchesValue = item.estimatedValue === null || item.estimatedValue >= minimum
    const matchesScore = !highScoreOnly || item.score >= 80
    return matchesQuery && matchesValue && matchesScore
  }), [query, minimum, highScoreOnly])

  const qualified = opportunities.filter((x) => x.score >= 75).length
  const totalValue = opportunities.reduce((sum, x) => sum + (x.estimatedValue ?? 0), 0)
  const urgent = opportunities.filter((x) => daysUntil(x.deadline) <= 7).length

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">N</div><div><strong>Nuvy</strong><span>Pulse</span></div></div>
        <div className="workspace"><span>Workspace</span><strong>Inteligência Jurídica</strong></div>
        <nav>
          <a className="nav-item" href="#dashboard"><LayoutDashboard size={18}/> Dashboard</a>
          <div className="nav-label">OPORTUNIDADES</div>
          <a className="nav-item active" href="#radar"><Target size={18}/> Radar de Editais <span className="nav-count">{opportunities.length}</span></a>
          <a className="nav-item" href="#favoritos"><Bookmark size={18}/> Favoritos</a>
          <a className="nav-item" href="#analise"><FileSearch size={18}/> Em análise</a>
          <a className="nav-item" href="#prazos"><CalendarClock size={18}/> Encerrando em breve <span className="nav-count warning">{urgent}</span></a>
          <div className="nav-label">INTELIGÊNCIA</div>
          <a className="nav-item" href="#ia"><Sparkles size={18}/> Análise IA</a>
          <a className="nav-item" href="#processual"><ShieldCheck size={18}/> Consulta Processual</a>
          <div className="nav-label">GESTÃO</div>
          <a className="nav-item" href="#relatorios"><TrendingUp size={18}/> Relatórios</a>
        </nav>
        <a className="nav-item settings-link" href="#config"><Settings size={18}/> Configurações</a>
      </aside>

      <main>
        <header className="topbar">
          <div className="global-search"><Search size={18}/><input placeholder="Buscar edital, órgão, cidade..." /></div>
          <button className="icon-button"><Bell size={19}/><span className="notification-dot" /></button>
          <div className="user-chip"><div className="avatar">LG</div><div><strong>Administrador</strong><span>Nuvy Pulse</span></div></div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div><span className="kicker">CENTRAL DE INTELIGÊNCIA</span><h1>Radar de Editais</h1><p>Oportunidades jurídicas qualificadas e priorizadas para sua equipe.</p></div>
            <button className="primary-button"><Sparkles size={17}/> Executar varredura</button>
          </section>

          <section className="stats-grid">
            <div className="stat-card"><div className="stat-icon"><FileSearch size={20}/></div><div><span>Novos editais</span><strong>{opportunities.length}</strong><small>últimas oportunidades</small></div></div>
            <div className="stat-card"><div className="stat-icon"><Target size={20}/></div><div><span>Qualificados</span><strong>{qualified}</strong><small>score ≥ 75</small></div></div>
            <div className="stat-card"><div className="stat-icon"><CircleDollarSign size={20}/></div><div><span>Valor potencial</span><strong>{money.format(totalValue)}</strong><small>oportunidades visíveis</small></div></div>
            <div className="stat-card urgent"><div className="stat-icon"><CalendarClock size={20}/></div><div><span>Encerrando em 7 dias</span><strong>{urgent}</strong><small>exigem prioridade</small></div></div>
          </section>

          <section className="radar-panel" id="radar">
            <div className="panel-toolbar">
              <div className="search-field"><Search size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nas oportunidades..." /></div>
              <div className="quick-filters">
                <button className={minimum === 300000 ? 'filter-chip active' : 'filter-chip'} onClick={() => setMinimum(300000)}>≥ R$ 300 mil</button>
                <button className={minimum === 500000 ? 'filter-chip active' : 'filter-chip'} onClick={() => setMinimum(500000)}>≥ R$ 500 mil</button>
                <button className={minimum === 1000000 ? 'filter-chip active' : 'filter-chip'} onClick={() => setMinimum(1000000)}>≥ R$ 1 mi</button>
                <button className={highScoreOnly ? 'filter-chip active' : 'filter-chip'} onClick={() => setHighScoreOnly(!highScoreOnly)}>Score ≥ 80</button>
                <button className="filter-chip"><Filter size={15}/> Mais filtros</button>
              </div>
            </div>
            <div className="results-heading"><div><strong>{filtered.length} oportunidades</strong><span> encontradas com os filtros atuais</span></div><select><option>Maior aderência</option><option>Maior valor</option><option>Prazo mais próximo</option></select></div>
            <div className="opportunity-list">{filtered.map((item) => <OpportunityCard key={item.id} item={item} />)}</div>
          </section>
        </div>
      </main>
    </div>
  )
}

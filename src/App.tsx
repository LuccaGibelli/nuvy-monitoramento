import { useEffect, useMemo, useState } from 'react'
import { Bell, Bookmark, Building2, CalendarClock, CircleDollarSign, FileSearch, Filter, Gauge, LayoutDashboard, LogOut, RefreshCw, Search, Settings, ShieldCheck, Sparkles, Target, Users, ListTodo } from 'lucide-react'
import { collaboratorMetrics, pendingItems } from './data'
import { supabase } from './lib/supabase'

type View = 'dashboard'|'radar'|'pending'|'team'|'process'
type DbOpportunity = {
  id:string; title:string; buyer_name:string|null; city:string|null; state:string|null; sphere:string|null;
  process_number:string|null; modality:string|null; object_text:string|null; estimated_value:number|null;
  published_at:string|null; deadline_at:string|null; source:string; source_url:string|null; status:string;
  score:number; ai_summary:string|null; is_favorite:boolean
}

const money = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0})
const dateFmt = new Intl.DateTimeFormat('pt-BR')
const fallbackOrgId = '0701a783-4982-4288-8328-08c11a9f0b9b'

function fmtDate(value:string|null){ if(!value) return 'Não informado'; const d=new Date(value); return Number.isNaN(d.getTime())?value:dateFmt.format(d) }
function daysUntil(value:string|null){ if(!value) return 9999; return Math.ceil((new Date(value).getTime()-Date.now())/86400000) }
function scoreLabel(score:number){ return score>=90?'Alta':score>=75?'Média':'Baixa' }

export default function App(){
 const [view,setView]=useState<View>('dashboard')
 const [query,setQuery]=useState('')
 const [minimum,setMinimum]=useState(300000)
 const [highScoreOnly,setHighScoreOnly]=useState(false)
 const [cpf,setCpf]=useState('')
 const [lookup,setLookup]=useState(false)
 const [session,setSession]=useState<any>(null)
 const [email,setEmail]=useState('')
 const [password,setPassword]=useState('')
 const [authMode,setAuthMode]=useState<'login'|'signup'>('login')
 const [authMessage,setAuthMessage]=useState('')
 const [opportunities,setOpportunities]=useState<DbOpportunity[]>([])
 const [orgId,setOrgId]=useState(fallbackOrgId)
 const [loading,setLoading]=useState(true)
 const [syncing,setSyncing]=useState(false)
 const [syncMessage,setSyncMessage]=useState('')

 useEffect(()=>{
   supabase.auth.getSession().then(({data})=>{ setSession(data.session); setLoading(false) })
   const {data:sub}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next))
   return ()=>sub.subscription.unsubscribe()
 },[])

 useEffect(()=>{ if(session) void bootstrap() },[session])

 async function bootstrap(){
   setLoading(true)
   const {data:members}=await supabase.from('organization_members').select('organization_id').limit(1)
   const currentOrg=members?.[0]?.organization_id||fallbackOrgId
   setOrgId(currentOrg)
   await loadOpportunities(currentOrg)
   setLoading(false)
 }

 async function loadOpportunities(currentOrg=orgId){
   const {data,error}=await supabase.from('opportunities').select('id,title,buyer_name,city,state,sphere,process_number,modality,object_text,estimated_value,published_at,deadline_at,source,source_url,status,score,ai_summary,is_favorite').eq('organization_id',currentOrg).order('score',{ascending:false}).limit(1000)
   if(error){ setSyncMessage(`Erro ao carregar: ${error.message}`); return }
   setOpportunities((data??[]) as DbOpportunity[])
 }

 async function authenticate(){
   setAuthMessage('')
   if(!email||!password){ setAuthMessage('Informe e-mail e senha.'); return }
   const result=authMode==='signup'
     ? await supabase.auth.signUp({email,password})
     : await supabase.auth.signInWithPassword({email,password})
   if(result.error){ setAuthMessage(result.error.message); return }
   setAuthMessage(authMode==='signup'?'Conta criada. Se houver confirmação por e-mail, confirme antes de entrar.':'Acesso realizado.')
 }

 async function runSync(){
   setSyncing(true); setSyncMessage('Executando PNCP + Compras.gov.br + conectores adicionais...')
   const {data,error}=await supabase.functions.invoke('sync-all',{body:{organization_id:orgId,days_back:30,days_ahead:120,max_pages:100,include_legacy:true}})
   if(error){ setSyncMessage(`Falha na varredura: ${error.message}`); setSyncing(false); return }
   const selected=(data?.results??[]).reduce((sum:number,item:any)=>sum+Number(item?.payload?.selected??0),0)
   setSyncMessage(`Varredura concluída. ${selected} registros jurídicos selecionados pelos coletores.`)
   await loadOpportunities(orgId)
   setSyncing(false)
 }

 async function toggleFavorite(item:DbOpportunity){
   const next=!item.is_favorite
   const {error}=await supabase.from('opportunities').update({is_favorite:next}).eq('id',item.id)
   if(!error) setOpportunities(list=>list.map(x=>x.id===item.id?{...x,is_favorite:next}:x))
 }

 const filtered=useMemo(()=>opportunities.filter(x=>{
   const hay=`${x.title} ${x.buyer_name??''} ${x.object_text??''} ${x.city??''} ${x.state??''}`.toLowerCase()
   const valueOk=x.estimated_value===null||x.estimated_value>=minimum
   return hay.includes(query.toLowerCase())&&valueOk&&(!highScoreOnly||x.score>=80)
 }),[opportunities,query,minimum,highScoreOnly])
 const totalValue=filtered.reduce((s,x)=>s+(x.estimated_value??0),0)
 const urgent=opportunities.filter(x=>daysUntil(x.deadline_at)<=7&&daysUntil(x.deadline_at)>=0).length

 if(loading&&!session) return <div className="auth-shell"><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark">N</div><div><strong>Nuvy</strong><span>Legal Radar</span></div></div><p>Conectando ao ambiente de licitações...</p></div></div>
 if(!session) return <div className="auth-shell"><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark">N</div><div><strong>Nuvy</strong><span>Legal Radar</span></div></div><h1>{authMode==='login'?'Entrar':'Criar primeiro acesso'}</h1><p>O primeiro usuário criado neste projeto recebe o perfil administrador automaticamente.</p><input className="auth-input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="E-mail" type="email"/><input className="auth-input" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Senha" type="password"/><button className="primary-button auth-button" onClick={authenticate}>{authMode==='login'?'Entrar':'Criar conta'}</button>{authMessage&&<div className="auth-message">{authMessage}</div>}<button className="link-button" onClick={()=>setAuthMode(authMode==='login'?'signup':'login')}>{authMode==='login'?'Primeiro acesso? Criar conta':'Já tenho conta'}</button></div></div>

 const nav=(id:View,label:string,Icon:any,count?:number)=><button className={`nav-item ${view===id?'active':''}`} onClick={()=>setView(id)}><Icon size={18}/>{label}{count!==undefined&&<span className="nav-count">{count}</span>}</button>
 const Card=({x}:{x:DbOpportunity})=><article className="opportunity-card"><div className="opportunity-top"><div className="score-box"><strong>{x.score}</strong><span>score</span></div><div className="opportunity-heading"><div className="eyebrow-row"><span className="source-pill">{x.source}</span><span>{x.sphere||'Esfera não informada'}</span><span>{x.state||'UF não informada'}</span></div><h3>{x.title}</h3><p className="organization"><Building2 size={15}/>{x.buyer_name||'Órgão não identificado'}{x.city?` · ${x.city}/${x.state??''}`:''}</p></div><button className={`icon-button ${x.is_favorite?'active':''}`} onClick={()=>void toggleFavorite(x)} aria-label="Favoritar"><Bookmark size={18}/></button></div><p className="object-text">{x.object_text||'Objeto não informado pela fonte.'}</p><div className="opportunity-metrics"><div><span>Valor estimado</span><strong>{x.estimated_value===null?'A validar':money.format(x.estimated_value)}</strong></div><div><span>Prazo</span><strong>{fmtDate(x.deadline_at)}</strong></div><div><span>Aderência</span><strong>{scoreLabel(x.score)}</strong></div><div><span>Status</span><strong>{x.status}</strong></div></div>{x.ai_summary&&<div className="ai-summary"><Sparkles size={17}/><p><b>Leitura rápida:</b> {x.ai_summary}</p></div>}{x.source_url&&<div className="card-footer"><a className="secondary-button" href={x.source_url} target="_blank" rel="noreferrer">Abrir fonte</a></div>}</article>

 return <div className="app-shell">
  <aside className="sidebar"><div className="brand"><div className="brand-mark">N</div><div><strong>Nuvy</strong><span>Legal Radar</span></div></div><div className="workspace"><span>Ambiente</span><strong>Monitoramento Jurídico</strong></div><nav>{nav('dashboard','Visão executiva',LayoutDashboard)}<div className="nav-label">OPORTUNIDADES</div>{nav('radar','Radar de oportunidades',Target,opportunities.length)}<div className="nav-label">OPERAÇÃO</div>{nav('pending','Fila de pendências',ListTodo,pendingItems.filter(x=>x.status!=='Concluído').length)}{nav('team','Desempenho da equipe',Users)}<div className="nav-label">PROCESSUAL</div>{nav('process','Consulta Escavador',ShieldCheck)}</nav><button className="nav-item settings-link"><Settings size={18}/>Configurações</button></aside>
  <main><header className="topbar"><div className="global-search"><Search size={18}/><input placeholder="Buscar oportunidade, órgão ou processo..." value={query} onChange={e=>setQuery(e.target.value)}/></div><button className="icon-button"><Bell size={19}/><span className="notification-dot"/></button><div className="user-chip"><div className="avatar">NU</div><div><strong>Administrador</strong><span>{session.user?.email}</span></div></div><button className="icon-button" onClick={()=>void supabase.auth.signOut()} title="Sair"><LogOut size={18}/></button></header>
  <div className="page-content">
   {view==='dashboard'&&<><section className="page-heading"><div><span className="kicker">MONITORAMENTO INTELIGENTE</span><h1>Painel executivo</h1><p>Dados reais do Supabase, coletados de PNCP, Compras.gov.br e fontes adicionais configuradas.</p></div><button className="primary-button" onClick={()=>void runSync()} disabled={syncing}><RefreshCw size={17}/>{syncing?'Varrendo fontes...':'Executar varredura'}</button></section>{syncMessage&&<div className="sync-banner">{syncMessage}</div>}<section className="stats-grid"><div className="stat-card"><div className="stat-icon"><FileSearch size={20}/></div><div><span>Oportunidades</span><strong>{opportunities.length}</strong><small>registros reais no banco</small></div></div><div className="stat-card"><div className="stat-icon"><CircleDollarSign size={20}/></div><div><span>Valor potencial</span><strong>{money.format(opportunities.reduce((s,x)=>s+(x.estimated_value??0),0))}</strong><small>valores estruturados</small></div></div><div className="stat-card urgent"><div className="stat-icon"><CalendarClock size={20}/></div><div><span>Prazo em 7 dias</span><strong>{urgent}</strong><small>exigem atenção</small></div></div><div className="stat-card"><div className="stat-icon"><Gauge size={20}/></div><div><span>Fontes</span><strong>{new Set(opportunities.map(x=>x.source)).size}</strong><small>com oportunidades encontradas</small></div></div></section><section className="radar-panel"><div className="results-heading"><div><strong>Prioridades de hoje</strong><span> · maior score primeiro</span></div></div><div className="opportunity-list">{opportunities.slice(0,3).map(x=><Card key={x.id} x={x}/>)}</div></section></>}
   {view==='radar'&&<><section className="page-heading"><div><span className="kicker">CENTRAL DE INTELIGÊNCIA</span><h1>Radar de oportunidades</h1><p>Licitações jurídicas qualificadas, com valor conhecido acima de R$ 300 mil ou valor ainda a validar.</p></div><button className="primary-button" onClick={()=>void runSync()} disabled={syncing}><RefreshCw size={17}/>{syncing?'Varrendo...':'Executar varredura'}</button></section>{syncMessage&&<div className="sync-banner">{syncMessage}</div>}<section className="radar-panel"><div className="panel-toolbar"><div className="search-field"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar..."/></div><div className="quick-filters">{[300000,500000,1000000].map(v=><button key={v} className={`filter-chip ${minimum===v?'active':''}`} onClick={()=>setMinimum(v)}>≥ {money.format(v)}</button>)}<button className={`filter-chip ${highScoreOnly?'active':''}`} onClick={()=>setHighScoreOnly(!highScoreOnly)}><Filter size={15}/>Aderência alta</button></div></div><div className="results-heading"><div><strong>{filtered.length} oportunidades</strong><span> · {money.format(totalValue)} em valor estruturado</span></div></div><div className="opportunity-list">{filtered.map(x=><Card key={x.id} x={x}/>)}</div></section></>}
   {view==='pending'&&<><section className="page-heading"><div><span className="kicker">FOLLOW-UP</span><h1>Fila de pendências</h1><p>Documentos e informações solicitados ao cliente, com prazo, urgência e responsável.</p></div><button className="primary-button">Nova pendência</button></section><section className="radar-panel"><div className="opportunity-list">{pendingItems.map(x=><article className="opportunity-card" key={x.id}><div className="results-heading"><div><strong>{x.client}</strong><span> · {x.request}</span></div><span className="source-pill">{x.urgency}</span></div><div className="opportunity-metrics"><div><span>Responsável</span><strong>{x.owner}</strong></div><div><span>Prazo</span><strong>{x.dueAt}</strong></div><div><span>Status</span><strong>{x.status}</strong></div><div><span>Ação</span><strong>Fazer follow-up</strong></div></div></article>)}</div></section></>}
   {view==='team'&&<><section className="page-heading"><div><span className="kicker">INDICADORES</span><h1>Desempenho por colaborador</h1><p>Tempo médio de resposta e indicadores operacionais.</p></div></section><section className="stats-grid">{collaboratorMetrics.map(x=><div className="stat-card" key={x.id}><div className="stat-icon"><Users size={20}/></div><div><span>{x.name}</span><strong>{x.averageResponseMinutes} min</strong><small>{x.handled} atendimentos · {x.pending} pendências</small></div></div>)}</section></>}
   {view==='process'&&<><section className="page-heading"><div><span className="kicker">MÓDULO INDEPENDENTE</span><h1>Consulta processual</h1><p>Consulta por CPF e resumo de andamento via integração com Escavador.</p></div></section><section className="radar-panel"><div className="panel-toolbar"><div className="search-field"><Search size={18}/><input value={cpf} onChange={e=>setCpf(e.target.value)} placeholder="Digite o CPF"/></div><button className="primary-button" onClick={()=>setLookup(true)}>Consultar</button></div>{lookup&&<div className="ai-summary"><ShieldCheck size={18}/><p><b>Integração aguardando credenciais do Escavador.</b> O fluxo está pronto para ativação quando a API for configurada.</p></div>}</section></>}
  </div></main>
 </div>
}

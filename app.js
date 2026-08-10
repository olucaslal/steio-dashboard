/* STEIO · Dashboard Comercial + Tráfego — backend Supabase */
(() => {
'use strict';

// ---------- CONFIG ----------
const ROLES = {
  sdr: { label:'SDR', tag:'sdr', color:'#3b82f6', fields:[
    {k:'contatos_feitos',label:'Ligações / mensagens que você fez',hint:'Quantas vezes você tentou falar com os leads hoje'},
    {k:'atendeu',label:'Quantos atenderam / responderam',hint:'Leads com quem você realmente conseguiu falar'},
    {k:'reunioes_agendadas',label:'Reuniões que você agendou',hint:'Calls marcadas com o lead'},
    {k:'no_shows',label:'Marcaram e não vieram (no-show)',hint:'Reuniões que furaram'},
  ]},
  social_seller: { label:'Social Seller', tag:'social_seller', color:'#a855f7', fields:[
    {k:'mensagens_enviadas',label:'Mensagens que você enviou',hint:'Total de mensagens no dia'},
    {k:'seguidores_novos',label:'Seguidores novos',hint:'Novos seguidores que chegaram no dia'},
    {k:'seguidores_abordados',label:'Pessoas que você abordou',hint:'Perfis que você chamou ativamente no dia'},
    {k:'directs_recebidos',label:'Directs que chegaram',hint:'DMs que você recebeu'},
    {k:'conversas_ativas',label:'Conversas que engataram',hint:'Pessoas que responderam e conversaram de verdade'},
    {k:'reunioes_agendadas',label:'Reuniões que você agendou',hint:'Calls marcadas a partir do Instagram'},
  ]},
  closer: { label:'Closer', tag:'closer', color:'#10b981', fields:[
    {k:'reunioes_feitas',label:'Reuniões que aconteceram',hint:'O lead compareceu na call'},
    {k:'no_show',label:'Não compareceram',hint:'Estava marcada mas a pessoa não apareceu'},
    {k:'vendas',label:'Vendas fechadas',hint:'Negócios fechados no dia'},
    {k:'valor_vendido',label:'Valor vendido (R$)',hint:'Soma do que você vendeu no dia'},
  ]},
  gestor: { label:'Gestor', tag:'gestor', color:'#64748b', fields:[] },
};
const ENTRY_ROLES = ['sdr','social_seller','closer'];

// Produtos / tickets (escada STEIO)
const PRODUCTS = {
  unity:        {label:'Unity',         ticket:195000},
  construmaster:{label:'ConstruMaster', ticket:95000},
  assessoria:   {label:'Assessoria',    ticket:45000},
  cpv:          {label:'CPV',           ticket:5000},
};
// Jornada do cliente (high ticket)
const ETAPAS = [
  {k:'1a_call',    label:'1ª call',          color:'#3b82f6'},
  {k:'negociacao', label:'Em negociação',    color:'#a855f7'},
  {k:'2a_call',    label:'2ª call agendada',  color:'#0ea5e9'},
  {k:'follow_up',  label:'Follow up',        color:'#f59e0b'},
  {k:'fechado',    label:'Fechado',          color:'#10b981'},
  {k:'perdido',    label:'Perdido',          color:'#ef4444'},
];
const ETAPA_MAP = Object.fromEntries(ETAPAS.map(e=>[e.k,e]));
const ETAPAS_ABERTAS = ['1a_call','negociacao','2a_call','follow_up'];

const DEFAULT_METAS = {
  pct_icp:        {label:'% ICP', target:80, dir:'up',  unit:'%'},
  cpl_cm:         {label:'CPL ConstruMaster', target:300, dir:'down', unit:'R$'},
  cpl_ass:        {label:'CPL Assessoria', target:120, dir:'down', unit:'R$'},
  custo_call:     {label:'Custo por call', target:250, dir:'down', unit:'R$'},
  custo_call_q:   {label:'Custo por call qualif.', target:450, dir:'down', unit:'R$'},
  cac:            {label:'Custo por conversão (CAC)', target:2500, dir:'down', unit:'R$'},
  sdr_connect:    {label:'Connect rate (SDR)', target:40, dir:'up', unit:'%'},
  sdr_agend:      {label:'Taxa agendamento (SDR)', target:25, dir:'up', unit:'%'},
  social_resp:    {label:'Taxa resposta (Social)', target:15, dir:'up', unit:'%'},
  social_agend:   {label:'Taxa agendamento (Social)', target:20, dir:'up', unit:'%'},
  show_rate:      {label:'Show-rate (Closer)', target:70, dir:'up', unit:'%'},
  close_rate:     {label:'Close rate (Closer)', target:25, dir:'up', unit:'%'},
};

// ---------- STATE ----------
let TRAFFIC = {daily:[], until:''};
let TODAY = '';
const LS = {
  get:(k,d)=>{try{return JSON.parse(localStorage.getItem('dc_'+k))??d}catch{return d}},
  set:(k,v)=>localStorage.setItem('dc_'+k,JSON.stringify(v)),
};
// ---- Supabase (backend + Auth) ----
const SUPA_URL='https://usfqgslpcqftafrbvxzd.supabase.co';
const SUPA_KEY='sb_publishable_T4aAxGIFncLq_MLEvQ6Nag_0IUnuM6f';
const EMAIL_DOMAIN='@steio.local';            // login "gabriel" -> gabriel@steio.local (interno, não envia email)
const sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
let USERS=[], ENTRIES=[], PROFILE=null, PIPELINE=[], METAS_DB={}, ESTEIRA=[];
async function loadProfile(){ const {data:{user}}=await sb.auth.getUser(); if(!user){PROFILE=null;return null;}
  const {data}=await sb.from('profiles').select('id,login,nome,role').eq('id',user.id).single(); PROFILE=data; return data; }
async function loadUsers(){ const {data}=await sb.from('profiles').select('id,login,nome,role'); USERS=data||[]; }
async function loadEntries(){ const {data}=await sb.from('dc_lancamentos').select('usuario_id,data,role,dados');
  ENTRIES=(data||[]).map(r=>({date:r.data,userId:r.usuario_id,role:r.role,data:r.dados||{}})); }
async function loadTraffic(){ const {data}=await sb.from('dc_traffic').select('*').order('data');
  TRAFFIC={daily:(data||[]).map(r=>({date:r.data,spend:Number(r.spend)||0,leads:r.leads,icpA:r.icp_a,icpB:r.icp_b,icpC:r.icp_c||0,icpD:r.icp_d||0,construmaster:r.construmaster,assessoria:r.assessoria}))};
  const n=new Date(); TODAY=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  overlayLiveLeads(); }   // não-bloqueante: mostra dc_traffic na hora e atualiza ao chegar o real-time

// Sobrepõe leads/ICP em tempo real, contando TODOS os funis (Sessão Estratégica, Site, Social/DM, Typebot, CPV).
// Mantém spend do dc_traffic (métrica de mídia paga). Se a chamada falhar, fica só com o dc_traffic.
async function overlayLiveLeads(){
  try{
    const since = lastNDates(120)[0];
    const r = await fetch(`https://trafego-steio.vercel.app/api/metrics?funil=todos&daily=1&since=${since}&until=${TODAY}`);
    const j = await r.json();
    if(!j || !Array.isArray(j.daily)) return;
    const byDate = Object.fromEntries(TRAFFIC.daily.map(d=>[d.date,d]));
    for(const d of j.daily){
      let row = byDate[d.date];
      if(!row){ row={date:d.date,spend:0,construmaster:d.icpA,assessoria:d.icpB}; TRAFFIC.daily.push(row); byDate[d.date]=row; }
      row.leads=d.leads; row.icpA=d.icpA; row.icpB=d.icpB; row.icpC=d.icpC; row.icpD=d.icpD; // leads/ICP = todos os funis, ao vivo
    }
    TRAFFIC.daily.sort((a,b)=>a.date<b.date?-1:1);
    TRAFFIC.live=true;
    // re-renderiza só as telas que dependem de leads (não mexe no formulário de lançamento)
    try{ if($('#app') && !$('#app').hidden){ renderDashboard(); if(typeof renderFunil==='function') renderFunil(); renderCalendar(); } }catch(e){}
  }catch(e){ /* mantém dc_traffic se a fonte real-time falhar */ }
}
async function loadPipeline(){ const {data}=await sb.from('dc_pipeline').select('*').order('created_at',{ascending:false}); PIPELINE=data||[]; }
async function loadEsteira(){ const {data}=await sb.from('dc_leads').select('*').order('data_chegada',{ascending:false}).limit(1500); ESTEIRA=data||[]; }
async function loadMetas(){ const {data}=await sb.from('dc_metas').select('chave,target'); METAS_DB=Object.fromEntries((data||[]).map(r=>[r.chave,Number(r.target)])); }
async function loadAll(){ await loadProfile(); await Promise.all([loadUsers(),loadEntries(),loadTraffic(),loadPipeline(),loadMetas(),loadEsteira()]); }
const getUsers   = ()=>USERS;
const getEntries = ()=>ENTRIES;
const getPipeline= ()=>PIPELINE;
const getMetas   = ()=>{const o={};for(const [k,m] of Object.entries(DEFAULT_METAS)) o[k]={...m, target:(k in METAS_DB)?METAS_DB[k]:m.target}; return o;};
const curUser    = ()=>PROFILE;

// ---------- HELPERS ----------
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
// ícones inline (substituem emojis)
const ICO_CAL='<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 2.8V7M16 2.8V7"/></svg>';
const ICO_WARN='<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5M12 17.4v.2"/></svg>';
const ICO_UP='<svg class="ico ico-xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>';
const ICO_DOWN='<svg class="ico ico-xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5.5 12.5 12 19l6.5-6.5"/></svg>';
const ICO_WA='<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.8a8.2 8.2 0 0 0-7 12.4L4 20.2l4.1-1a8.2 8.2 0 1 0 3.9-15.4Z"/><path d="M9.2 8.6c-.5 1.8 3.4 6.2 5.6 6.1l.8-1.3-1.7-1.1-.8.5c-.7-.4-1.6-1.3-2-2l.5-.8-1.1-1.7-1.3.3Z"/></svg>';
// WhatsApp clicável: 10-11 dígitos ganham 55; 12-13 começando com 55 vão direto; senão null
function waHref(tel){
  const d=String(tel||'').replace(/\D/g,'');
  if(d.length===10||d.length===11) return 'https://wa.me/55'+d;
  if((d.length===12||d.length===13)&&d.startsWith('55')) return 'https://wa.me/'+d;
  return null;
}
function formatTel(tel){
  let d=String(tel||'').replace(/\D/g,'');
  if((d.length===12||d.length===13)&&d.startsWith('55')) d=d.slice(2);
  if(d.length===11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if(d.length===10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return String(tel||'');
}
// Número visível vira link (mantém o texto, só linka). stopPropagation pra não abrir o modal do card.
function waTelHtml(tel){
  if(!tel) return '';
  const href=waHref(tel);
  if(!href) return `<span>${escHtml(tel)}</span>`;
  return `<a class="wa-link" href="${href}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${ICO_WA}${escHtml(formatTel(tel))}</a>`;
}
// Chip discreto pra cards compactos que não exibem o número
function waChipHtml(tel){
  const href=waHref(tel); if(!href) return '';
  return `<a class="wa-chip" href="${href}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Chamar no WhatsApp · ${tel}">${ICO_WA}</a>`;
}
const escHtml=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function initialsOf(name){
  const parts=String(name||'?').replace(/\([^)]*\)/g,'').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0]||'?')+(parts.length>1?(parts.at(-1)?.[0]||''):'')).toUpperCase();
}
function avatarTone(name){let hash=0;for(const ch of String(name||''))hash=(hash*31+ch.charCodeAt(0))|0;return Math.abs(hash)%6;}
function avatarHtml(name,photo='',extra='',decorative=false,title=name){
  const safeName=escHtml(name||'Pessoa'),safeTitle=escHtml(title||name||'Pessoa');
  const tone=avatarTone(name);
  const media=photo?`<img src="${escHtml(photo)}" alt="" loading="lazy">`:`<span aria-hidden="true">${initialsOf(name)}</span>`;
  return `<span class="avt avt-tone-${tone}${extra?` ${extra}`:''}" title="${safeTitle}" ${decorative?'aria-hidden="true"':`aria-label="${safeName}"`}>${media}</span>`;
}
function calendarAvatarHtml(name,photo='',size='avt-xs',extra='',title=name){
  const variants=['','avt-blue','avt-green','avt-warn','avt-red','avt-neutral'];
  return avatarHtml(name,photo,`${size} ${variants[avatarTone(name)]}${extra?` ${extra}`:''}`,true,title);
}
function wireJourneyCards(board,selector,open){
  board.querySelectorAll(selector).forEach(card=>{
    const name=card.querySelector('.jopen')?.textContent?.trim()||'lead';
    let draggedAt=0;
    if(card.draggable) card.setAttribute('aria-grabbed','false');
    card.addEventListener('dragstart',()=>{draggedAt=Date.now();card.setAttribute('aria-grabbed','true');});
    card.addEventListener('dragend',()=>{draggedAt=Date.now();card.setAttribute('aria-grabbed','false');});
    card.tabIndex=0; card.setAttribute('role','button'); card.setAttribute('aria-label',`Abrir ${name}`);
    const activate=e=>{
      if(Date.now()-draggedAt<350) return;
      if(e.target.closest('a,button,input,select,textarea,label')) return;
      if(e.type==='keydown'&&!['Enter',' '].includes(e.key)) return;
      if(e.type==='keydown') e.preventDefault();
      open(card);
    };
    card.onclick=activate; card.onkeydown=activate;
  });
}
const el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
const money=n=>!isFinite(n)||n==null?'—':'R$ '+Math.round(n).toLocaleString('pt-BR');
const pct=n=>!isFinite(n)||n==null?'—':(n).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
const intf=n=>(n||0).toLocaleString('pt-BR');
const produtoLabel=p=>PRODUCTS[p]?PRODUCTS[p].label:'—';
function lastNDates(n){const out=[];const base=new Date(TODAY+'T00:00:00');for(let i=n-1;i>=0;i--){const d=new Date(base);d.setDate(d.getDate()-i);out.push(d.toISOString().slice(0,10));}return out;}
/* Dia do calendário de BRASÍLIA de um timestamp.
   data_chegada é timestamptz e o Supabase devolve em UTC. Fatiar a string dava o dia UTC:
   lead que chegou 21:10 de Brasília (00:10Z) contava como o dia SEGUINTE e sumia do "hoje"
   do time. Todo lead do fim da tarde pra noite caía nesse buraco, todo dia.
   -03:00 fixo: o Brasil não tem horário de verão desde 2019. */
function diaBR(v){
  if(!v) return '';
  const s=String(v);
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;         // já é dia puro (coluna date): não mexe.
  const d=new Date(s);                                // senão new Date('2026-07-16') seria meia-noite
  if(isNaN(d)) return s.slice(0,10);                  // UTC e o -3h jogaria pro dia anterior.
  return new Date(d.getTime()-3*3600*1000).toISOString().slice(0,10);
}
function statusCls(val,key){const m=getMetas()[key];if(m==null||!isFinite(val)||val==null)return 'none';const up=m.dir==='up';return (up?val>=m.target:val<=m.target)?'ok':'bad';}

// ---------- AGGREGATION (tráfego + comercial) ----------
function aggTraffic(dates){const set=new Set(dates);const o={leads:0,icpA:0,icpB:0,icpC:0,icpD:0,cm:0,ass:0,spend:0};
  for(const d of TRAFFIC.daily){if(!set.has(d.date))continue;o.leads+=d.leads;o.icpA+=d.icpA;o.icpB+=d.icpB;o.icpC+=d.icpC;o.icpD+=d.icpD;o.cm+=d.construmaster;o.ass+=d.assessoria;o.spend+=d.spend;}return o;}
function aggCommercial(dates){const set=new Set(dates);const acc={sdr:{},social_seller:{},closer:{}};
  for(const r of ENTRY_ROLES)for(const f of ROLES[r].fields)acc[r][f.k]=0;
  for(const e of getEntries()){if(!set.has(e.date)||!acc[e.role])continue;for(const f of ROLES[e.role].fields)acc[e.role][f.k]+=Number(e.data[f.k]||0);}
  return acc;}

function computeFunnel(dates){
  const t=aggTraffic(dates), c=aggCommercial(dates);
  const agendadas=(c.sdr.reunioes_agendadas||0)+(c.social_seller.reunioes_agendadas||0);
  const feitas=c.closer.reunioes_feitas||0, vendas=c.closer.vendas||0;
  const mql=(t.icpA||0)+(t.icpB||0)+(t.icpC||0)+(t.icpD||0);
  return {
    t,c,agendadas,feitas,vendas,mql,
    leads:t.leads,
    icpA:t.icpA,icpB:t.icpB,icpC:t.icpC,icpD:t.icpD,
    pctIcp: mql? (t.icpA+t.icpB)/mql*100 : 0,   // qualificação sobre quem respondeu capital (A+B+C+D), não sobre o total
    cplCM: t.cm? t.spend/t.cm : NaN,
    cplAss: t.ass? t.spend/t.ass : NaN,
    custoCall: agendadas? t.spend/agendadas : NaN,
    custoCallQ: feitas? t.spend/feitas : NaN,
    cac: vendas? t.spend/vendas : NaN,
    convMql: t.leads? mql/t.leads*100 : 0,
    convAgenda: mql? agendadas/mql*100 : 0,
    showRate: agendadas? feitas/agendadas*100 : 0,
    closeRate: feitas? vendas/feitas*100 : 0,
    ticket: vendas? (c.closer.valor_vendido||0)/vendas : NaN,
    receita: c.closer.valor_vendido||0,
  };
}

// ---------- AGGREGATION (jornada / financeiro do CRM) ----------
// Gestor: financeiro/jornada agora vem da ESTEIRA (dc_leads), não do dc_pipeline morto.
function pipeScopeCards(){ return (ESTEIRA||[]).filter(l=>l.agendou); }
// ---- Esteira (dc_leads): leads do SDR logado + gravação ----
const isFieldRole = r => r==='sdr'||r==='social_seller';
function myLeads(){ const me=curUser(); let ls=ESTEIRA||[]; if(me&&isFieldRole(me.role)) ls=ls.filter(l=>l.sdr_id===me.id); return ls; }
function leadsInRange(ls){ const set=new Set(datesBetween(RANGE.start,RANGE.end)); return ls.filter(l=>{const d=diaBR(l.data_chegada); return !set.size||set.has(d);}); }
async function saveLead(id,patch){
  patch.updated_at=new Date().toISOString(); patch.updated_by=curUser()?.login||'';
  const {error}=await sb.from('dc_leads').update(patch).eq('id',id).select();
  if(error){ alert('Não consegui salvar: '+(error.message||error)); return false; }
  const row=(ESTEIRA||[]).find(l=>String(l.id)===String(id)); if(row) Object.assign(row,patch);
  return true;
}
// Todas leem leads da esteira (dc_leads): vendeu / valor / valor_proposto / produto / vendido_em / closerEtapa.
function computePipeline(cards){
  const m={naMesa:0, contratado:0, coletado:0, fechados:0, perdidos:0, abertos:0, total:cards.length};
  for(const l of cards){
    const et=closerEtapa(l);
    if(et==='fechado'){ m.fechados++; const v=Number(l.valor)||0; m.contratado+=v; m.coletado+=v; }
    else if(et==='perdido'){ m.perdidos++; }
    else { m.abertos++; m.naMesa+=Number(l.valor_proposto)||0; }
  }
  m.conv = cards.length? m.fechados/cards.length*100 : 0;
  m.ticketMedio = m.fechados? m.contratado/m.fechados : NaN;
  return m;
}
function fechadosIn(cards,dateSet){let count=0,contratado=0,coletado=0;
  for(const l of cards){ const d=l.vendido_em?String(l.vendido_em).slice(0,10):null;
    if(l.vendeu&&d&&dateSet.has(d)){count++;const v=Number(l.valor)||0;contratado+=v;coletado+=v;} }
  return {count,contratado,coletado};}
function pipeByDay(cards,dates){
  const idx=Object.fromEntries(dates.map(d=>[d,{contratos:0,contratado:0,coletado:0}]));
  for(const l of cards){ if(!l.vendeu||!l.vendido_em)continue; const r=idx[String(l.vendido_em).slice(0,10)]; if(r){r.contratos++;const v=Number(l.valor)||0;r.contratado+=v;r.coletado+=v;} }
  return dates.map(d=>({date:d,...idx[d]}));
}
function pipeByTicket(cards){
  const out={}; for(const k of Object.keys(PRODUCTS)) out[k]={count:0,contratado:0,coletado:0,emJornada:0,naMesa:0};
  for(const l of cards){ const p=l.produto; if(!p||!out[p])continue;
    if(l.vendeu){out[p].count++;const v=Number(l.valor)||0;out[p].contratado+=v;out[p].coletado+=v;}
    else if(closerEtapa(l)!=='perdido'){out[p].emJornada++;} }
  // "Em jornada" também conta os deals em aberto do dc_pipeline (todos os closers);
  // "na mesa" = soma do valor_apresentado desses deals abertos por produto
  for(const c of getPipeline()){ const p=c.produto; if(!p||!out[p])continue;
    if(ETAPAS_ABERTAS.includes(c.etapa||'1a_call')){ out[p].emJornada++; out[p].naMesa+=Number(c.valor_apresentado)||0; } }
  return out;
}

// ---------- RENDER: DASHBOARD (sub-abas) ----------
let RANGE={start:'',end:''};
function addDays(ds,delta){const d=new Date(ds+'T00:00:00');d.setDate(d.getDate()+delta);return d.toISOString().slice(0,10);}
function datesBetween(start,end){const out=[];if(!start||!end||start>end)return out;let d=new Date(start+'T00:00:00');const e=new Date(end+'T00:00:00');while(d<=e){out.push(d.toISOString().slice(0,10));d.setDate(d.getDate()+1);}return out;}
function presetRange(p){if(p==='hoje')return{start:TODAY,end:TODAY};if(p==='ontem'){const y=addDays(TODAY,-1);return{start:y,end:y};}const n=Number(p);return{start:addDays(TODAY,-(n-1)),end:TODAY};}

function renderDashboard(){
  renderGeral();
  if(!isFieldRole(curUser()?.role)) renderFunil();   // SDR/Social não carregam funil/campanhas
  renderJornada();
  renderMissing();
}
function refreshRangeViews(){
  const r=curUser()?.role;
  if(isFieldRole(r)){ renderGeral(); renderJornada(); }
  else if(r==='closer'){ renderGeral(); renderFunil(); renderJornada(); }
  else renderFunil();
}

// ===== Sub-aba GERAL =====
function renderGeral(){
  const r=curUser()?.role;
  if(isFieldRole(r)) return renderMeuFunil();
  if(r==='closer') return renderCloserGeral();
  const cards=pipeScopeCards();
  const fHoje=fechadosIn(cards,new Set([TODAY]));
  const fSemana=fechadosIn(cards,new Set(lastNDates(7)));
  const P=computePipeline(cards);
  // Dinheiro na mesa global: deals em aberto do dc_pipeline, todos os closers
  const pipeAb=pipeAbertos(getPipeline());
  const pipeMesa=pipeAb.reduce((s,c)=>s+(Number(c.valor_apresentado)||0),0);
  const kg=$('#finKpis');
  if(kg) kg.innerHTML=`
    <div class="kpi none kpi-mesa"><div class="k-label">Dinheiro na mesa</div><div class="k-val">${money(pipeMesa)}</div><div class="k-meta">${intf(pipeAb.length)} deals em aberto</div></div>
    <div class="kpi none kpi-cash"><div class="k-label">Vendas hoje</div><div class="k-val">${intf(fHoje.count)}</div><div class="k-meta">${money(fHoje.contratado)} em contrato</div></div>
    <div class="kpi none kpi-cash"><div class="k-label">Vendas semana</div><div class="k-val">${intf(fSemana.count)}</div><div class="k-meta">${money(fSemana.contratado)} em contrato</div></div>
    <div class="kpi none kpi-money"><div class="k-label">Cash collect hoje</div><div class="k-val">${money(fHoje.coletado)}</div><div class="k-meta">entrou no caixa</div></div>
    <div class="kpi none kpi-money"><div class="k-label">Cash collect semana</div><div class="k-val">${money(fSemana.coletado)}</div><div class="k-meta">entrou no caixa</div></div>
    <div class="kpi none"><div class="k-label">Ticket médio</div><div class="k-val">${money(P.ticketMedio)}</div><div class="k-meta">por contrato fechado</div></div>`;
  renderCharts(cards);
  renderTicketCards(cards);
}

let _charts={};
const cssVar=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const hexA=(hex,a)=>hex+Math.round(a*255).toString(16).padStart(2,'0');
const lineGrad=hex=>c=>{const{ctx,chartArea}=c.chart;if(!chartArea)return hexA(hex,.1);
  const g=ctx.createLinearGradient(0,chartArea.bottom,0,chartArea.top);
  g.addColorStop(0,hexA(hex,0));g.addColorStop(.55,hexA(hex,.12));g.addColorStop(1,hexA(hex,.34));return g;};
const barGrad=(top,bottom)=>c=>{const{ctx,chartArea}=c.chart;if(!chartArea)return top;
  const g=ctx.createLinearGradient(0,chartArea.top,0,chartArea.bottom);g.addColorStop(0,top);g.addColorStop(1,bottom);return g;};
const compact=v=>Math.abs(Number(v)||0)>=1000?new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(v):v;
const seriesGlow={id:'seriesGlow',beforeDatasetDraw(ch,args){const meta=ch.getDatasetMeta(args.index);if(meta.type!=='line')return;
  ch.ctx.save();ch.ctx.shadowColor=ch.data.datasets[args.index].borderColor||'transparent';ch.ctx.shadowBlur=10;},
  afterDatasetDraw(ch,args){if(ch.getDatasetMeta(args.index).type==='line')ch.ctx.restore();}};
const hoverGuide={id:'hoverGuide',afterDatasetsDraw(ch){if(ch.config.type==='doughnut'||ch.config.type==='pie'||!ch.tooltip)return;
  const active=ch.tooltip.getActiveElements();if(!active.length)return;const x=active[0].element.x,{ctx,chartArea}=ch;
  ctx.save();ctx.beginPath();ctx.setLineDash([4,4]);ctx.moveTo(x,chartArea.top);ctx.lineTo(x,chartArea.bottom);
  ctx.lineWidth=1;ctx.strokeStyle=cssVar('--chart-guide')||'rgba(229,196,106,.5)';ctx.stroke();ctx.restore();}};
const emptyDoughnut={id:'emptyDoughnut',beforeDraw(ch){if(ch.config.type!=='doughnut')return;
  const empty=ch.data.datasets.every(d=>d.data.reduce((a,b)=>a+(Number(b)||0),0)===0);if(!empty)return;
  const{ctx,chartArea}=ch,x=(chartArea.left+chartArea.right)/2,y=(chartArea.top+chartArea.bottom)/2;
  ctx.save();ctx.beginPath();ctx.arc(x,y,Math.min(chartArea.width,chartArea.height)*.29,0,Math.PI*2);
  ctx.lineWidth=16;ctx.strokeStyle=cssVar('--panel2');ctx.stroke();ctx.restore();}};
const centerText={id:'centerText',afterDraw(ch){const t=ch.config.options._center;if(!t)return;
  const{ctx,chartArea}=ch;const x=(chartArea.left+chartArea.right)/2,y=(chartArea.top+chartArea.bottom)/2;
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle=cssVar('--ink');ctx.font="800 24px 'Inter',sans-serif";ctx.fillText(t.big,x,y-7);
  ctx.fillStyle=cssVar('--mut');ctx.font="600 11px 'Inter',sans-serif";ctx.fillText(t.small,x,y+13);ctx.restore();}};
function drawChart(id,type,labels,datasets,opts){
  if(!window.Chart) return;
  const cv=document.getElementById(id); if(!cv) return;
  if(_charts[id]){ _charts[id].destroy(); }
  Chart.defaults.font.family="'Inter',-apple-system,'Segoe UI',Roboto,sans-serif";
  const tick=cssVar('--chart-tick'),grid=cssVar('--chart-grid');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const aria=cv.closest('.card,.ticket-card')?.querySelector('h2,.t-name')?.textContent?.trim()||'Gráfico do dashboard';
  cv.setAttribute('role','img');cv.setAttribute('aria-label',aria);
  datasets.forEach(d=>{if(d.fill&&typeof d.borderColor==='string'&&d.borderColor[0]==='#')d.backgroundColor=lineGrad(d.borderColor);});
  const base={
    responsive:true,maintainAspectRatio:false,resizeDelay:100,normalized:true,
    interaction:{mode:'index',intersect:false},
    animation:reduced?false:{duration:720,easing:'easeOutQuart'},
    transitions:{active:{animation:{duration:180}}},
    layout:{padding:{top:6,right:4,bottom:0,left:2}},
    plugins:{
      legend:{display:datasets.length>1,labels:{boxWidth:8,boxHeight:8,usePointStyle:true,pointStyle:'circle',font:{size:11,weight:600},color:tick,padding:12}},
      tooltip:{backgroundColor:cssVar('--chart-tooltip')||'rgba(18,21,24,.98)',titleColor:cssVar('--ink'),bodyColor:cssVar('--ink2'),borderColor:cssVar('--line'),borderWidth:1,cornerRadius:10,padding:11,caretSize:6,boxPadding:5,usePointStyle:true,titleFont:{weight:700},
        callbacks:{label(c){const raw=c.chart.config.type==='doughnut'?c.parsed:(c.parsed?.y??0);
          const name=c.chart.config.type==='doughnut'?c.label:(c.dataset.label||'');
          const value=/contratado|coletado|valor|cash/i.test(c.dataset.label||'')?money(raw):intf(raw);
          return `${name}${name?': ':''}${value}`;}}},
    },
    scales:{y:{beginAtZero:true,ticks:{font:{size:10.5,weight:500},color:tick,padding:8,maxTicksLimit:6,callback:compact},grid:{color:grid,lineWidth:1},border:{display:false}},x:{ticks:{font:{size:10.5,weight:500},color:tick,padding:5,maxRotation:0},grid:{display:false},border:{display:false}}},
    elements:{line:{borderWidth:2.5,tension:.42,cubicInterpolationMode:'monotone',capBezierPoints:true},point:{radius:0,hoverRadius:5,hitRadius:18,hoverBorderWidth:2},bar:{borderRadius:7,borderSkipped:false}},
  };
  if(type==='doughnut'||type==='pie'){
    delete base.scales;
    base.cutout='70%';
    base.plugins.legend={display:true,position:'bottom',labels:{boxWidth:8,boxHeight:8,usePointStyle:true,pointStyle:'circle',font:{size:11,weight:600},color:tick,padding:14}};
  }
  _charts[id]=new Chart(cv,{type,data:{labels,datasets},plugins:[emptyDoughnut,seriesGlow,hoverGuide,centerText],options:Object.assign(base,opts||{})});
}
// ===== Meu funil (Dashboard do SDR) =====
function renderMeuFunil(){
  const pane=$('#sub-geral'); if(!pane) return;
  const all=myLeads(), inR=leadsInRange(all);
  const hoje=all.filter(l=>diaBR(l.data_chegada)===TODAY);
  const cnt=(arr,f)=>arr.filter(f).length;
  const steps=[
    ['Chegaram', inR.length, '#3b82f6'],
    ['Qualificados', cnt(inR,l=>l.qualificado), '#6366f1'],
    ['Responderam', cnt(inR,l=>l.respondeu), '#8b5cf6'],
    ['Agendaram', cnt(inR,l=>l.agendou), '#a855f7'],
    ['Compareceram', cnt(inR,l=>l.compareceu), '#0ea5e9'],
  ];
  pane.innerHTML=`
    <section class="kpi-grid">
      <div class="kpi none kpi-b"><div class="k-label">Leads hoje</div><div class="k-val">${intf(hoje.length)}</div><div class="k-meta">chegaram pra você</div></div>
      <div class="kpi none"><div class="k-label">Chegaram no período</div><div class="k-val">${intf(inR.length)}</div><div class="k-meta">leads seus</div></div>
      <div class="kpi none"><div class="k-label">Qualificados</div><div class="k-val">${intf(steps[1][1])}</div><div class="k-meta">ICP</div></div>
      <div class="kpi none kpi-p"><div class="k-label">Agendaram</div><div class="k-val">${intf(steps[3][1])}</div><div class="k-meta">reuniões marcadas</div></div>
      <div class="kpi none kpi-g"><div class="k-label">Compareceram</div><div class="k-val">${intf(steps[4][1])}</div><div class="k-meta">apareceram na call</div></div>
    </section>
    <div class="two-col">
      <section class="card"><h2>Agendados por dia</h2><div class="chart-box"><canvas id="chartAgend"></canvas></div></section>
      <section class="card"><h2>Seu funil</h2><div id="meuFunnel" class="funnel"></div></section>
    </div>
    ${curUser()?.role==='social_seller'?socialPerfSection():''}`;
  const dates=lastNDates(8), labels=dates.map(fmtDate);
  const byDay=dates.map(d=>all.filter(l=>l.agendou&&(l.agendado_em||'').slice(0,10)===d).length);
  drawChart('chartAgend','bar',labels,[{label:'Agendados',data:byDay,backgroundColor:barGrad('#c084fc','#6d28d9'),borderColor:'#c084fc',borderWidth:1,borderRadius:7,maxBarThickness:26}]);
  renderFunnelBars($('#meuFunnel'), steps);
  if(curUser()?.role==='social_seller'){
    const s=mySocialAgg();
    renderFunnelBars($('#socialFunnel'),[
      ['Mensagens enviadas',   s.mensagens_enviadas,   '#3b82f6'],
      ['Seguidores novos',     s.seguidores_novos,     '#6366f1'],
      ['Seguidores abordados', s.seguidores_abordados, '#8b5cf6'],
      ['Directs recebidos',    s.directs_recebidos,    '#a855f7'],
      ['Agendamentos',         s.reunioes_agendadas,   '#22c55e'],
    ]);
  }
}
// Funil em colunas verticais (estilo bar-chart): pill arredondada por etapa,
// altura relativa à MAIOR etapa; a maior ganha destaque dourado.
function fnCols(wrap, items){ // items: [{lab, v, convHtml, extraHtml}]
  if(!wrap) return;
  const max=Math.max(1,...items.map(s=>s.v||0));
  const hi=items.findIndex(s=>(s.v||0)===max&&max>0);
  wrap.innerHTML='';
  items.forEach((s,i)=>{
    // escala em raiz quadrada: alturas seguem a quantidade sem esmagar as etapas pequenas
    const h=Math.max(5,Math.sqrt((s.v||0)/max)*100);
    const col=el('div','fn-col'+(i===hi?' on':''));
    col.innerHTML=`<div class="fn-val">${intf(s.v)}</div><div class="fn-track"><div class="fn-pill" style="height:${h}%"></div></div><div class="fn-name">${s.lab}</div>${s.convHtml||''}${s.extraHtml||''}`;
    wrap.appendChild(col);
  });
}
function renderFunnelBars(wrap, steps){
  if(!wrap) return;
  fnCols(wrap, steps.map(([lab,v],i)=>{
    let convHtml='';
    if(i>0){const prev=steps[i-1][1]||0;const conv=prev?Math.round(100*(v||0)/prev):0;const up=conv>100;
      convHtml=`<div class="fn-conv ${up?'':conv>=40?'ok':conv>0?'':'bad'}">${up?ICO_UP:ICO_DOWN} ${conv}%</div>`;}
    return {lab, v, convHtml};
  }));
}
function renderCharts(cards){
  const dates=lastNDates(8), labels=dates.map(fmtDate), s=pipeByDay(cards,dates);
  drawChart('chartContratos','bar',labels,[{label:'Contratos',data:s.map(x=>x.contratos),backgroundColor:barGrad('#f0d68a','#a5762a'),borderColor:'#e5c46a',borderWidth:1,borderRadius:7,maxBarThickness:28}]);
  drawChart('chartValor','line',labels,[
    {label:'Contratado',data:s.map(x=>x.contratado),borderColor:'#e5c46a',pointBackgroundColor:'#e5c46a',pointBorderColor:cssVar('--card'),fill:true,tension:.42},
    {label:'Coletado',data:s.map(x=>x.coletado),borderColor:'#22c55e',pointBackgroundColor:'#22c55e',pointBorderColor:cssVar('--card'),borderDash:[6,4],fill:true,tension:.42},
  ]);
}
function renderTicketCards(cards){
  const grid=$('#ticketCards'); if(!grid) return;
  const by=pipeByTicket(cards);
  grid.innerHTML=`<div class="ticket-card donut-card"><div class="chart-box"><canvas id="chartTickets"></canvas></div></div>`+
    Object.entries(PRODUCTS).map(([k,p])=>{const d=by[k];
    return `<div class="ticket-card">
      <div class="t-name">${p.label}</div>
      <div class="t-ticket">${money(p.ticket)}</div>
      <div class="t-stats"><span><b>${intf(d.count)}</b> fechados</span><a href="#" class="jorn-open" data-jorn="${k}" title="Ver quem está em jornada"><b>${intf(d.emJornada)}</b> em jornada</a></div>
      <div class="t-money mesa">${money(d.naMesa)} <small>na mesa</small></div>
      <div class="t-money">${money(d.contratado)} <small>contratado</small></div>
      <div class="t-money cash">${money(d.coletado)} <small>coletado</small></div>
    </div>`;}).join('');
  grid.querySelectorAll('.jorn-open').forEach(a=>a.onclick=e=>{e.preventDefault();openJornadaProdutoModal(a.dataset.jorn);});
  const dLabels=Object.values(PRODUCTS).map(p=>p.label);
  const dData=Object.keys(PRODUCTS).map(k=>by[k].count);
  const total=dData.reduce((a,b)=>a+b,0);
  drawChart('chartTickets','doughnut',dLabels,[{data:dData,backgroundColor:['#f0d68a','#d9ae4f','#a5762a','#68707d'],borderColor:cssVar('--card'),borderWidth:3,hoverOffset:6,spacing:1}],
    {_center:{big:intf(total),small:'fechados'},rotation:-90});
}
// Gestor · quem está "em jornada" naquele produto: deals do dc_pipeline + leads da esteira,
// separados por origem pra ficar claro de onde vem o número. Só leitura.
function openJornadaProdutoModal(k){
  const p=PRODUCTS[k]; if(!p) return;
  const userName=id=>(getUsers().find(u=>String(u.id)===String(id))||{}).nome||'·';
  const deals=getPipeline().filter(c=>c.produto===k&&ETAPAS_ABERTAS.includes(c.etapa||'1a_call'));
  const leads=pipeScopeCards().filter(l=>l.produto===k&&!l.vendeu&&closerEtapa(l)!=='perdido');
  const mesa=deals.reduce((s,c)=>s+(Number(c.valor_apresentado)||0),0);
  const row=(nome,closer,tagHtml,etapa,valor,tel)=>`<div class="jp-row">
    <div class="jp-main"><b>${nome||'(sem nome)'} ${waChipHtml(tel)}</b><span class="muted sm">${closer}</span></div>
    <div class="jp-meta">${tagHtml}<span class="pipe-status">${etapa}</span><b>${money(valor)}</b></div></div>`;
  const dHtml=deals.length?deals.map(c=>row(c.lead_nome,userName(c.closer_id),
      `<span class="temp ${c.temperatura||'morno'}">${TEMP_LABEL[c.temperatura]||''}</span>`,
      (ETAPA_MAP[c.etapa||'1a_call']||{label:c.etapa}).label,c.valor_apresentado,c.telefone)).join('')
    :'<p class="muted sm">nenhum deal do pipeline nesse produto</p>';
  const lHtml=leads.length?leads.map(l=>row(l.nome,userName(l.closer_id),
      (l.icp?`<span class="badge ${l.icp==='A'||l.icp==='B'?'ok':'none'}">ICP ${l.icp}</span>`:'')+leadFlagsHtml(l),
      (CLOSER_ETAPAS.find(e=>e.k===closerEtapa(l))||{}).label||'',l.valor_proposto,l.telefone)).join('')
    :'<p class="muted sm">nenhum lead da esteira nesse produto</p>';
  const m=$('#leadModal');
  m.innerHTML=`<div class="modal-card">
    <button class="modal-x" id="mClose">×</button>
    <h2>${p.label} · em jornada</h2>
    <p class="muted sm" style="margin:0 0 12px">${intf(deals.length+leads.length)} em aberto · ${money(mesa)} na mesa (deals)</p>
    <div class="ml-move" style="margin-top:0"><span class="ml-lbl">Deals (pipeline) · ${intf(deals.length)}</span><div class="jp-list">${dHtml}</div></div>
    <div class="ml-move"><span class="ml-lbl">Leads da esteira · ${intf(leads.length)}</span><div class="jp-list">${lHtml}</div></div>
  </div>`;
  m.hidden=false;
  $('#mClose').onclick=closeModal;
  m.onclick=e=>{if(e.target===m)closeModal();};
}

// ===== Sub-aba FUNIL DE VENDA (seletor de funil -> funil comercial + custos + árvore de campanhas) =====
const DC_METRICS_API='https://steio.vercel.app/api/dc-metrics';
const FUNIS_VENDA=['Formulário V1','Formulário V3','Formulário V4','Typebot','Página (Site)','Social Selling','Link da Bio'];
const FUNIL_APELIDO={'Formulário V1':'Formulário V1','Formulário V3':'Formulário V3','Formulário V4':'Formulário V4','Typebot':'Typebot','Página (Site)':'Página','Social Selling':'Social Selling','Link da Bio':'Link da Bio'};
const STEP_DEFS=[['leads','Chegaram','#3b82f6'],['qualificados','Qualificados','#6366f1'],['responderam','Responderam','#8b5cf6'],['agendaram','Agendaram','#a855f7'],['compareceram','Compareceram','#0ea5e9'],['venderam','Vendas','#22c55e']];
let _dcCache={key:'',data:null};
let SELFUNIL='Formulário V1';

async function renderFunil(){
  if(curUser()?.role==='closer') return renderCloserFunil();
  const pick=$('#funnelPicker'); if(!pick) return;
  const since=RANGE.start||TODAY, until=RANGE.end||TODAY, key=since+'|'+until;
  // cache com validade de 55s: campanhas sempre frescas, sem piscar a tela (mantém o dado antigo enquanto rebusca)
  const temAntigo=_dcCache.key===key && _dcCache.data;
  let d=(temAntigo && Date.now()-(_dcCache.ts||0)<55_000)?_dcCache.data:null;
  if(!d){
    const kg=$('#kpiTop');
    if(!temAntigo){ pick.innerHTML=''; if(kg) kg.innerHTML='<div class="muted sm" style="padding:10px">Carregando funis…</div>'; }
    try{ d=await (await fetch(`${DC_METRICS_API}?since=${since}&until=${until}`,{cache:'no-store'})).json(); _dcCache={key,data:d,ts:Date.now()}; }
    catch(e){ if(temAntigo){ d=_dcCache.data; } else { if(kg) kg.innerHTML='<div class="muted sm" style="padding:10px">Não consegui carregar os funis agora.</div>'; return; } }
  }
  // seletor de funil
  const maxLeads=Math.max(1,...FUNIS_VENDA.map(nome=>Number((d.funis||[]).find(x=>x.nome===nome)?.leads)||0));
  pick.innerHTML=FUNIS_VENDA.map(nome=>{
    const f=(d.funis||[]).find(x=>x.nome===nome)||{};
    const selected=nome===SELFUNIL, share=Math.round(100*(Number(f.leads)||0)/maxLeads);
    return `<button type="button" class="fpick ${selected?'on is-active':''}" data-funil="${nome}" aria-pressed="${selected}">
      <span class="fp-name">${FUNIL_APELIDO[nome]}</span>
      <span class="fp-stats"><strong>${intf(f.leads||0)}</strong><small>leads</small><b>${money(f.spend)}</b></span>
      <span class="fp-meter" aria-hidden="true"><i style="width:${share}%"></i></span></button>`;
  }).join('');
  pick.querySelectorAll('.fpick').forEach(b=>b.onclick=()=>{ SELFUNIL=b.dataset.funil; renderFunilSelecionado(d); });
  renderFunilSelecionado(d);
}

function renderFunilSelecionado(d){
  const f=(d.funis||[]).find(x=>x.nome===SELFUNIL)||{};
  $('#funnelPicker')?.querySelectorAll('.fpick').forEach(b=>{const on=b.dataset.funil===SELFUNIL;b.classList.toggle('on',on);b.classList.toggle('is-active',on);b.setAttribute('aria-pressed',String(on));});

  // KPIs do funil (parecido com o tráfego)
  const kg=$('#kpiTop');
  if(kg){
    const cards=[
      ['Leads', intf(f.leads||0), 'b'],
      ['CPL', money(f.cpl), ''],
      ['CPM', money(f.cpm), ''],
      ['Custo / call', money(f.custoAgendamento), ''],
      ['Custo / venda', money(f.custoVenda), ''],
      ['Faturamento', money(f.faturamento), 'g'],
      ['Investido', money(f.spend), 'p'],
    ];
    kg.innerHTML=cards.map(([l,v,c])=>`<div class="kpi none kpi-${c||'x'}"><div class="k-label">${l}</div><div class="k-val">${v}</div></div>`).join('');
  }
  // Funil comercial (barras descendentes)
  const wrap=$('#funnel');
  if(wrap){
    fnCols(wrap, STEP_DEFS.map(([k,lab],i)=>{
      const v=f[k]||0;
      let convHtml='';
      if(i>0){ const prev=f[STEP_DEFS[i-1][0]]||0; const conv=prev?Math.round(100*v/prev):0;
        convHtml=`<div class="fn-conv ${conv>=40?'ok':conv>0?'':'bad'}">${ICO_DOWN} ${conv}%</div>`; }
      return {lab, v, convHtml};
    }));
  }
  // Custos (cascata)
  const wf=$('#waterfall');
  if(wf){
    const rows=[['CPL (por lead)',f.cpl],['Custo por call',f.custoAgendamento],['Custo por venda',f.custoVenda]];
    const max=Math.max(...rows.map(r=>isFinite(r[1])&&r[1]?r[1]:0),1);
    wf.innerHTML='';
    rows.forEach(([lab,val])=>{
      const w=isFinite(val)&&val?Math.max(5,val/max*100):0;
      const row=el('div','wf-row');
      row.innerHTML=`<div class="wf-label">${lab}</div><div class="wf-bar"><div class="wf-fill" style="width:${w}%;background:#d9ae4f"></div><div class="wf-val">${money(val)}</div></div>`;
      wf.appendChild(row);
    });
  }
  renderCampTree((d.arvore||{})[SELFUNIL]||[]);
}

// Árvore campanha -> conjunto -> anúncio (drill-down estilo Facebook Ads)
function nodeRow(n,nivel){
  const has=n.filhos&&n.filhos.length;
  return `<div class="ct-node lvl-${nivel}">
    <div class="ct-row ${has?'clik':''}" ${has?`data-toggle="1"`:''}>
      <span class="ct-arrow">${has?'▸':''}</span>
      <span class="ct-name">${n.nome}</span>
      <span class="ct-metrics">
        <b class="ct-spend">${money(n.spend)}</b>
        <span>chegaram <b>${intf(n.leads)}</b></span>
        <span>agend. <b>${intf(n.agendaram)}</b></span>
        <span>compar. <b>${intf(n.compareceram)}</b></span>
        <span>vendas <b class="pos">${intf(n.venderam)}</b></span>
        <span>CPL <b>${money(n.cpl)}</b></span>
      </span>
    </div>
    ${has?`<div class="ct-kids" hidden>${n.filhos.map(c=>nodeRow(c,nivel+1)).join('')}</div>`:''}
  </div>`;
}
function renderCampTree(camps){
  const box=$('#campTree'); if(!box) return;
  if(!camps.length){ box.innerHTML='<div class="muted sm" style="padding:14px">Nenhuma campanha ativa nesse funil no período.</div>'; return; }
  box.innerHTML=`<div class="ct-head">
    <span class="ct-name">Campanha / conjunto / anúncio</span>
    <span class="ct-metrics"><b>Invest.</b><span>chegaram</span><span>agend.</span><span>compar.</span><span>vendas</span><span>CPL</span></span>
  </div>`+camps.map(c=>nodeRow(c,0)).join('');
  box.querySelectorAll('.ct-row.clik').forEach(r=>r.onclick=()=>{
    const kids=r.parentElement.querySelector(':scope > .ct-kids'); if(!kids)return;
    kids.hidden=!kids.hidden; r.querySelector('.ct-arrow').textContent=kids.hidden?'▸':'▾';
  });
}
function renderFunnel(F){
  const wrap=$('#funnel'); if(!wrap) return;
  const stages=[
    {n:'Leads',v:F.leads,color:'#3b82f6'},
    {n:'MQL (qualificados)',v:F.mql,color:'#6366f1',conv:F.convMql,key:null,convLabel:'qualificação',icp:true},
    {n:'Reuniões agendadas',v:F.agendadas,color:'#a855f7',conv:F.convAgenda,key:null,convLabel:'agendamento'},
    {n:'Reuniões feitas',v:F.feitas,color:'#0ea5e9',conv:F.showRate,key:'show_rate',convLabel:'show-rate'},
    {n:'Vendas',v:F.vendas,color:'#10b981',conv:F.closeRate,key:'close_rate',convLabel:'fechamento'},
  ];
  fnCols(wrap, stages.map((s,i)=>{
    let convHtml='';
    if(i>0){const cls=s.key?statusCls(s.conv,s.key):'ok';
      convHtml=`<div class="fn-conv ${cls}">${ICO_DOWN} ${pct(s.conv)} ${s.convLabel}</div>`;}
    const extraHtml=s.icp?`<div class="fn-icp"><span class="icp-pill a">A: ${intf(F.icpA)}</span><span class="icp-pill b">B: ${intf(F.icpB)}</span><span class="icp-pill c">C: ${intf(F.icpC)}</span><span class="icp-pill d">D: ${intf(F.icpD)}</span></div>`:'';
    return {lab:s.n, v:s.v, convHtml, extraHtml};
  }));
}
function renderWaterfall(F){
  const wrap=$('#waterfall'); if(!wrap) return;
  const rows=[
    {label:'CPL (lead)',val:F.leads?F.t.spend/F.leads:NaN,key:null},
    {label:'Custo / call',val:F.custoCall,key:'custo_call'},
    {label:'Custo / call qualif.',val:F.custoCallQ,key:'custo_call_q'},
    {label:'CAC (venda)',val:F.cac,key:'cac'},
  ];
  const max=Math.max(...rows.map(r=>isFinite(r.val)?r.val:0),1);
  wrap.innerHTML='';
  for(const r of rows){
    const cls=r.key?statusCls(r.val,r.key):'none';
    const color=cls==='bad'?'var(--bad)':cls==='ok'?'var(--ok)':'#cbd5e1';
    const w=isFinite(r.val)?Math.max(4,r.val/max*100):0;
    const row=el('div','wf-row');
    row.innerHTML=`<div class="wf-label">${r.label}</div><div class="wf-bar"><div class="wf-fill" style="width:${w}%;background:${color}"></div><div class="wf-val">${money(r.val)}</div></div>`;
    wrap.appendChild(row);
  }
}
function renderRoleCards(c,F){
  const grid=$('#roleCards'); if(!grid) return; grid.innerHTML='';
  const sdr=c.sdr;const icpLeads=F.t.icpA+F.t.icpB;
  const connect=sdr.contatos_feitos?sdr.atendeu/sdr.contatos_feitos*100:NaN;
  const sAgend=icpLeads?sdr.reunioes_agendadas/icpLeads*100:NaN;
  grid.appendChild(roleCard('SDR','#3b82f6',[
    ['Leads que chegaram',intf(F.leads),'auto'],
    ['Leads qualificados (ICP)',intf(icpLeads),'auto'],
    ['Falaram com você',intf(sdr.atendeu),null],
    ['Connect rate',pct(connect),statusCls(connect,'sdr_connect')],
    ['Reuniões agendadas',intf(sdr.reunioes_agendadas),null],
    ['Taxa de agendamento',pct(sAgend),statusCls(sAgend,'sdr_agend')],
  ]));
  const so=c.social_seller;const resp=so.seguidores_abordados?so.directs_recebidos/so.seguidores_abordados*100:NaN;
  const soAgend=so.conversas_ativas?so.reunioes_agendadas/so.conversas_ativas*100:NaN;
  grid.appendChild(roleCard('Social Seller','#a855f7',[
    ['Seguidores abordados',intf(so.seguidores_abordados),null],
    ['Mensagens enviadas',intf(so.mensagens_enviadas),null],
    ['Taxa de resposta',pct(resp),statusCls(resp,'social_resp')],
    ['Taxa agendamento',pct(soAgend),statusCls(soAgend,'social_agend')],
    ['Reuniões agendadas',intf(so.reunioes_agendadas),null],
  ]));
  grid.appendChild(roleCard('Closer','#10b981',[
    ['Reuniões feitas',intf(F.feitas),null],
    ['Show-rate',pct(F.showRate),statusCls(F.showRate,'show_rate')],
    ['Close rate',pct(F.closeRate),statusCls(F.closeRate,'close_rate')],
    ['Vendas',intf(F.vendas),null],
    ['Ticket médio',money(F.ticket),null],
    ['Receita',money(F.receita),null],
  ]));
}
function roleCard(name,color,rows){
  const card=el('div','role-card');card.style.borderTopColor=color;
  let h=`<h3><span style="color:${color}">●</span> ${name}</h3>`;
  for(const [n,v,cls] of rows){
    const badge=cls?` <span class="badge ${cls}">${cls==='ok'?'meta ✓':cls==='bad'?'abaixo':cls==='auto'?'auto ⚡':'—'}</span>`:'';
    h+=`<div class="metric-row"><span class="m-name">${n}</span><span class="m-val">${v}${badge}</span></div>`;
  }
  card.innerHTML=h;return card;
}

// ===== Sub-aba JORNADA DO CLIENTE (board interativo: arrastar + clicar) =====
let _dragId=null;
// ===== Sub-aba JORNADA DO CLIENTE — dispatcher SDR / Closer =====
const SDR_ETAPAS=[
  {k:'chegaram',    label:'Chegaram',    color:'#3b82f6'},
  {k:'contactados', label:'Contactados', color:'#6366f1'},
  {k:'responderam', label:'Responderam', color:'#8b5cf6'},
  {k:'followup',    label:'Follow up',   color:'#f59e0b'},
  {k:'agendaram',   label:'Agendaram',   color:'#a855f7'},
  {k:'compareceu',  label:'Compareceu',  color:'#0ea5e9'},
  {k:'desqualificado', label:'Desqualificado', color:'#64748b'},
];
// Motivos da desqualificação — mesmo vocabulário do "motivo" que a esteira já usa.
const MOTIVOS_DESQ=[
  ['sem_capital',     'Sem capital'],
  ['so_investimento', 'Só quer investimento'],
  ['fora_perfil',     'Fora do perfil (não é incorporador)'],
  ['sem_interesse',   'Sem interesse'],
  ['nao_responde',    'Não responde'],
  ['numero_errado',   'Número errado'],
  ['ja_cliente',      'Já é cliente'],
  ['outro',           'Outro'],
];
const motivoLabel=k=>(MOTIVOS_DESQ.find(m=>m[0]===k)||[,k||''])[1];
const desqualificado=l=>l.sdr_status==='desqualificado';
function sdrEtapa(l){
  if(desqualificado(l))return'desqualificado';  // vence o resto: saiu do fluxo
  if(l.compareceu)return'compareceu';
  if(l.agendou)return'agendaram';
  if(l.sdr_status==='follow_up'||l.follow_up)return'followup';
  if(l.respondeu)return'responderam';
  if(l.atendeu)return'contactados';
  return'chegaram';
}
let JVIEW=null;  // 'sdr' | 'closer'
let JQ='';       // busca por nome na jornada
function renderJornada(){
  const me=curUser(); if(!me) return;
  // define a visão conforme o papel (gestor pode alternar)
  if(JVIEW===null) JVIEW = (me.role==='sdr'||me.role==='social_seller') ? 'sdr' : (me.role==='gestor'?'sdr':'closer');
  if(me.role==='closer') JVIEW='closer';
  if(me.role==='sdr'||me.role==='social_seller') JVIEW='sdr';
  // toggle (só faz sentido pro gestor, que enxerga tudo)
  const tools=$('#jornadaTools');
  if(tools){
    const toggle = me.role==='gestor'
      ? `<div class="jtoggle"><button class="jt ${JVIEW==='sdr'?'on':''}" data-v="sdr">SDR</button><button class="jt ${JVIEW==='closer'?'on':''}" data-v="closer">Closer</button></div>`
      : '';
    const hint = JVIEW==='sdr'
      ? `<span class="muted sm">Leads que chegaram no período: se já foram contactados, responderam e agendaram.</span>`
      : (me.role==='closer'
        ? `<span class="muted sm">Seus negócios: arraste o card pra mudar de etapa ou clique no card pra abrir.</span>`
        : `<span class="muted sm">Suas calls: arraste o card pra mudar de etapa ou clique no card pra abrir.</span>`);
    const search = (me.role==='gestor'||me.role==='sdr'||me.role==='social_seller'||me.role==='closer')
      ? `<input type="search" id="jBusca" class="lead-busca" placeholder="buscar lead" value="${JQ}">` : '';
    const addBtn = me.role==='closer'
      ? `<button type="button" class="btn-mini ok" id="jAddBtn">+ Novo deal</button>`
      : (JVIEW==='sdr' ? `<button type="button" class="btn-mini ok" id="jAddLeadBtn">+ Cadastrar lead</button>` : '');
    tools.innerHTML = toggle + addBtn + search + hint;
    tools.querySelectorAll('.jt').forEach(b=>b.onclick=()=>{ JVIEW=b.dataset.v; renderJornada(); });
    const add=$('#jAddBtn'); if(add) add.onclick=openAddModal;
    const addL=$('#jAddLeadBtn'); if(addL) addL.onclick=openAddLeadModal;
    const jb=$('#jBusca'); if(jb){ jb.oninput=()=>{ JQ=jb.value; if(JVIEW==='sdr') renderJornadaSDR(); else renderJornadaCloserView(); const f=$('#jBusca'); if(f){f.focus();f.setSelectionRange(f.value.length,f.value.length);} }; }
  }
  if(JVIEW==='sdr') renderJornadaSDR(); else renderJornadaCloserView();
}
// Lead antigo (importado das planilhas, antigo=true) ainda sem interação do SDR
function antigoPendente(l){ return !!l.antigo && sdrEtapa(l)==='chegaram'; }
function renderJornadaSDR(){
  const board=$('#jornadaBoard'); if(!board) return;
  const me=curUser();
  const dateSet=new Set(datesBetween(RANGE.start,RANGE.end));
  let base=(ESTEIRA||[]);
  if(me.role==='sdr'||me.role==='social_seller') base=base.filter(l=>l.sdr_id===me.id);
  if(JQ.trim()){ const q=JQ.trim().toLowerCase(); base=base.filter(l=>(l.nome||'').toLowerCase().includes(q)); }
  // Coluna "Leads Antigos": antigo=true sem interação, ignora o filtro de período (datas de abr-jun)
  const antigos=base.filter(l=>antigoPendente(l)&&l.sdr_status!=='perdido');
  const leads=base.filter(l=>{
    if(antigoPendente(l)) return false;                 // pendente só aparece em "Leads Antigos"
    if(l.antigo) return true;                           // antigo já trabalhado entra no fluxo normal, sem filtro de data
    const d=diaBR(l.data_chegada); return !dateSet.size||dateSet.has(d);
  });
  const kp=$('#jornadaKpis');
  if(kp) kp.innerHTML=SDR_ETAPAS.map(E=>{const n=leads.filter(l=>sdrEtapa(l)===E.k).length;
    return `<div class="kpi none" style="--sc:${E.color}"><div class="k-label">${E.label}</div><div class="k-val">${intf(n)}</div><div class="k-meta">leads</div></div>`;}).join('');
  const isMgr=me.role==='gestor';
  const canMove=isFieldRole(me.role);   // o próprio SDR/Social move seus leads
  board.classList.remove('jb-sdr','jb-closer');
  const antCard=l=>{
    const orig=l.funil||(l.campanha||'').replace(/\[[^\]]*\]/g,'').trim()||'·';
    const dc=diaBR(l.data_chegada);
    const nm=isMgr?((getUsers().find(u=>u.id===l.sdr_id)||{}).nome||''):'';
    return `<div class="jcard jcard-antigo" data-lid="${l.id}" data-nome="${(l.nome||'').toLowerCase()}" draggable="${canMove}">
      <div class="jcard-person">${avatarHtml(l.nome,l.foto_url||l.avatar_url,'avt-sm')}<b class="jopen">${l.nome||'(sem nome)'}</b></div>
      <div class="jcard-foot"><span class="badge antigo">antigo</span>${waChipHtml(l.telefone)}${nm?`<span class="muted">${nm}</span>`:''}</div>
      <div class="muted sm" style="margin-top:5px">${orig}${dc?` · ${fmtDate(dc)}`:''}</div>
    </div>`;
  };
  const antBody=antigos.length?antigos.map(antCard).join(''):'<p class="muted sm">nenhum lead antigo pendente</p>';
  const antCol=`<div class="jcol jcol-antigos">
    <div class="jcol-head" style="--sc:#64748b">Leads Antigos <span id="antCount">${antigos.length}</span></div>
    <div class="ant-tools"><input type="search" id="antBusca" class="lead-busca ant-busca" placeholder="buscar antigo"></div>
    <div class="jcol-body">${antBody}</div>
  </div>`;
  board.innerHTML=antCol+SDR_ETAPAS.map(E=>{
    const cs=leads.filter(l=>sdrEtapa(l)===E.k);
    const body=cs.length?cs.map(l=>{
      const sdrName=isMgr?((getUsers().find(u=>u.id===l.sdr_id)||{}).nome||''):'';
      const orig=l.funil||(l.campanha||'').replace(/\[[^\]]*\]/g,'').trim()||'—';
      const extra = l.agendou&&l.agendado_em ? `<div class="jcard-cash" style="color:var(--purple)">${ICO_CAL} ${fmtDate(l.agendado_em)}${l.agendado_hora?` ${l.agendado_hora}`:''}</div>` : '';
      const fl=leadFlagsHtml(l);
      return `<div class="jcard" data-lid="${l.id}" draggable="${canMove}">
        <div class="jcard-person">${avatarHtml(l.nome,l.foto_url||l.avatar_url,'avt-sm')}<b class="jopen">${l.nome||'(sem nome)'}</b></div>
        <div class="jcard-foot"><span class="temp ${l.qualificado?'frio':'morno'}">${l.qualificado?'ICP '+(l.icp||'✓'):'a qualificar'}</span>${waChipHtml(l.telefone)}${sdrName?`<span class="muted">${sdrName}</span>`:''}</div>
        ${fl?`<div class="jflags">${fl}</div>`:''}
        <div class="muted sm" style="margin-top:5px">${orig}</div>${extra}
      </div>`;}).join(''):'<p class="muted sm">sem leads</p>';
    return `<div class="jcol" data-sstage="${E.k}"><div class="jcol-head" style="--sc:${E.color}">${E.label} <span>${cs.length}</span></div><div class="jcol-body">${body}</div></div>`;
  }).join('');
  wireJourneyCards(board,'.jcard[data-lid]',card=>openEsteiraLeadModal(card.dataset.lid));
  if(canMove){
    board.querySelectorAll('.jcard[data-lid]').forEach(card=>{
      card.ondragstart=e=>{_dragId=card.dataset.lid;e.dataTransfer.effectAllowed='move';};
      card.ondragend=()=>{_dragId=null;board.querySelectorAll('.jcol').forEach(c=>c.classList.remove('drop'));};
    });
    board.querySelectorAll('.jcol[data-sstage]').forEach(col=>{
      col.ondragover=e=>{e.preventDefault();col.classList.add('drop');};
      col.ondragleave=()=>col.classList.remove('drop');
      col.ondrop=e=>{e.preventDefault();col.classList.remove('drop');const id=_dragId,st=col.dataset.sstage;if(id&&st)moverLeadSDR(id,st);};
    });
  }
  // Busca local da coluna Leads Antigos (filtra sem re-render, contador acompanha)
  const ab=$('#antBusca');
  if(ab){ ab.oninput=()=>{ const q=ab.value.trim().toLowerCase(); let n=0;
    board.querySelectorAll('.jcard-antigo').forEach(c=>{ const hit=!q||(c.dataset.nome||'').includes(q); c.style.display=hit?'':'none'; if(hit)n++; });
    const cnt=$('#antCount'); if(cnt) cnt.textContent=n; }; }
}
function sdrStagePatch(stage){
  const P={atendeu:false,respondeu:false,follow_up:false,agendou:false,compareceu:false};
  if(stage==='contactados') P.atendeu=true;
  if(stage==='responderam'){ P.atendeu=true; P.respondeu=true; }
  if(stage==='followup'){ P.atendeu=true; P.respondeu=true; P.follow_up=true; }
  if(stage==='agendaram'){ P.atendeu=true; P.respondeu=true; P.agendou=true; }
  if(stage==='compareceu'){ P.atendeu=true; P.respondeu=true; P.agendou=true; P.compareceu=true; }
  return P;
}
async function moverLeadSDR(id,stage){
  const l=(ESTEIRA||[]).find(x=>String(x.id)===String(id)); if(!l) return;
  if(stage==='agendaram' && !l.agendou){ abrirAgendamento(id); return; }
  // arrastar pra coluna Desqualificado também exige o motivo
  if(stage==='desqualificado'){ if(!desqualificado(l)) abrirDesqualificacao(id); return; }
  const patch=sdrStagePatch(stage);
  if(desqualificado(l)){ patch.sdr_status=null; patch.motivo=null; }  // voltou pro fluxo
  if(stage==='agendaram'&&!l.agendado_em) patch.agendado_em=TODAY;
  const ok=await saveLead(id,patch);
  if(ok) refreshLeadViews();
}
// Pop-up no dia da call: leads que já passaram do agendamento e ainda não foram confirmados
function checarComparecimentos(){
  const me=curUser(); if(!me) return;
  const pend=myLeads().filter(l=>l.agendou && l.agendado_em && String(l.agendado_em).slice(0,10)<=TODAY && !l.compareceu && !l.compareceu_confirmado && !aguardandoReagendamento(l));
  if(!pend.length) return;
  const m=$('#leadModal'); if(!m) return;
  m.innerHTML=`<div class="modal-card"><button class="modal-x" id="mClose">×</button>
    <h2>Confirmar comparecimento</h2>
    <p class="muted sm" style="margin-bottom:12px">Esses leads tinham call marcada. Eles compareceram?</p>
    <div class="cmp-list">${pend.map(l=>`<div class="cmp-row" data-lid="${l.id}">
      <div><b>${l.nome||'(sem nome)'}</b> ${waChipHtml(l.telefone)}<div class="muted sm">${ICO_CAL} ${fmtDate(l.agendado_em)}${l.agendado_hora?` · ${l.agendado_hora}`:''}</div></div>
      <div class="cmp-btns"><button class="btn-mini ok" data-cmp="1">Compareceu</button><button class="btn-mini bad" data-cmp="0">Não veio</button></div>
    </div>`).join('')}</div></div>`;
  m.hidden=false;
  $('#mClose').onclick=closeModal;
  m.onclick=e=>{if(e.target===m)closeModal();};
  m.querySelectorAll('.cmp-row').forEach(row=>{
    row.querySelectorAll('[data-cmp]').forEach(b=>b.onclick=async()=>{
      const id=row.dataset.lid, val=b.dataset.cmp==='1';
      if(!val){ await marcarNoShow(id); row.remove(); if(!m.querySelector('.cmp-row')){ closeModal(); renderGeral(); renderJornada(); if(isFieldRole(curUser().role)) renderSDRLancar(); } return; }
      const ok=await saveLead(id,{compareceu:true, compareceu_confirmado:true});
      if(!ok) return;
      row.remove();
      if(!m.querySelector('.cmp-row')){ closeModal(); renderGeral(); renderJornada(); if(isFieldRole(curUser().role)) renderSDRLancar(); }
    });
  });
}
// ===== CLOSER — mesma esteira (dc_leads), na ótica das calls =====
const CLOSER_ETAPAS=[
  {k:'agendada',   label:'Call marcada',         color:'#3b82f6'},
  {k:'noshow',     label:'No-show',              color:'#ef4444'},
  {k:'realizada',  label:'Reunião realizada',    color:'#0ea5e9'},
  {k:'negociacao', label:'Em negociação',        color:'#a855f7'},
  {k:'segunda',    label:'2ª reunião realizada', color:'#8b5cf6'},
  {k:'followup',   label:'Follow up',            color:'#f59e0b'},
  {k:'fechado',    label:'Fechado',              color:'#22c55e'},
  {k:'perdido',    label:'Perdido',              color:'#64748b'},
];
function closerEtapa(l){
  if(l.vendeu||l.closer_status==='fechado') return 'fechado';
  if(l.closer_status==='perdido') return 'perdido';
  if(l.closer_status==='follow_up') return 'followup';
  if(l.closer_status==='segunda') return 'segunda';
  if(l.closer_status==='negociacao') return 'negociacao';
  if(l.compareceu) return 'realizada';
  if(l.compareceu_confirmado && !l.compareceu) return 'noshow';
  return 'agendada';
}
function closerScopeLeads(){
  const me=curUser(); let ls=(ESTEIRA||[]).filter(l=>l.agendou);
  if(me.role==='closer') ls=ls.filter(l=>l.closer_id==null||String(l.closer_id)===String(me.id));
  return ls;
}
function closerLeadsInRange(){ const set=new Set(datesBetween(RANGE.start,RANGE.end));
  return closerScopeLeads().filter(l=>{const d=(l.agendado_em||'').slice(0,10); return !set.size||(d&&set.has(d));}); }
function closerStagePatch(stage){
  switch(stage){
    case 'agendada':   return {compareceu:false,compareceu_confirmado:false,closer_status:null,vendeu:false};
    case 'noshow':     return {compareceu:false,compareceu_confirmado:true,closer_status:null,vendeu:false};
    case 'realizada':  return {compareceu:true,compareceu_confirmado:true,closer_status:null,vendeu:false};
    case 'negociacao': return {compareceu:true,compareceu_confirmado:true,closer_status:'negociacao',vendeu:false};
    case 'segunda':    return {compareceu:true,compareceu_confirmado:true,closer_status:'segunda',vendeu:false};
    case 'followup':   return {compareceu:true,compareceu_confirmado:true,closer_status:'follow_up',vendeu:false};
    case 'fechado':    return {compareceu:true,compareceu_confirmado:true,closer_status:'fechado',vendeu:true,vendido_em:TODAY};
    case 'perdido':    return {closer_status:'perdido',vendeu:false,vendido_em:null};
  }
  return {};
}
// ===== No-show e remarcação =====
// Furou e ainda não tem data nova no futuro: o SDR precisa reagendar
function aguardandoReagendamento(l){
  if(!(Number(l.noshows)||0)) return false;
  if(l.compareceu||l.vendeu) return false;
  const d=(l.agendado_em||'').slice(0,10);
  return !d||d<TODAY;
}
function leadFlagsHtml(l){
  let h='';
  const n=Number(l.noshows)||0;
  if(n>0) h+=` <span class="badge nshow">no-show ×${n}</span>`;
  if(l.remarcado) h+=` <span class="badge remarcado">remarcado</span>`;
  if(aguardandoReagendamento(l)) h+=` <span class="badge reagendar">reagendar</span>`;
  if(desqualificado(l)) h+=` <span class="badge desq">${l.motivo?motivoLabel(l.motivo):'desqualificado'}</span>`;
  return h;
}
// No-show: soma 1 no contador, marca que não veio e já abre o reagendamento
async function marcarNoShow(id){
  const l=(ESTEIRA||[]).find(x=>String(x.id)===String(id)); if(!l) return;
  const patch={...closerStagePatch('noshow'), noshows:(Number(l.noshows)||0)+1};
  const ok=await saveLead(id,patch); if(!ok) return;
  refreshLeadViews();
  abrirReagendamento(id,{aposNoShow:true});
}
function abrirReagendamento(id,{aposNoShow=false}={}){
  const l=(ESTEIRA||[]).find(x=>String(x.id)===String(id)); if(!l) return;
  abrirPrompt({
    titulo: aposNoShow?'No-show marcado · tentar reagendar':'Remarcar call',
    sub: aposNoShow?'Combina uma nova data com o lead. Sem data ainda? Feche aqui: o lead fica com o aviso "reagendar".':'Nova data e horário da call.',
    campos:[
      {key:'data', type:'date', label:'Nova data', value:'', required:true},
      {key:'hora', type:'time', label:'Horário', value:l.agendado_hora||''},
    ],
    onSalvar: async(d)=>{
      if(!d.data) return;
      const patch={agendou:true, agendado_em:d.data, agendado_hora:d.hora||null, remarcado:true, compareceu:false, compareceu_confirmado:false};
      const ok=await saveLead(id,patch); if(ok) refreshLeadViews();
    }
  });
}
async function moverLeadCloser(id,stage){
  if(stage==='noshow'){ marcarNoShow(id); return; }
  if(stage==='realizada'||stage==='segunda'){ abrirResumoReuniao(id,stage); return; }
  const l=(ESTEIRA||[]).find(x=>String(x.id)===String(id)); if(!l) return;
  const patch=closerStagePatch(stage);
  const me=curUser(); if(me.role==='closer' && l.closer_id==null) patch.closer_id=me.id;
  const ok=await saveLead(id,patch);
  if(ok) refreshLeadViews();
}
function closerControlsInner(l){
  const cur=closerEtapa(l);
  const pills=CLOSER_ETAPAS.map(E=>`<button type="button" class="stage-pill${cur===E.k?' on':''}" data-cmv="${E.k}" style="--sc:${E.color}" aria-pressed="${cur===E.k}">${E.label}</button>`).join('');
  const prodOpts=['<option value="">Produto…</option>'].concat(Object.entries(PRODUCTS).map(([k,p])=>`<option value="${k}"${l.produto===k?' selected':''}>${p.label}</option>`)).join('');
  const meetingDone = !['agendada','noshow'].includes(cur);   // reunião aconteceu -> pede o resumo
  const resumoField = meetingDone ? `<label class="full">Resumo da call <small class="muted">(obrigatório após a reunião)</small><textarea data-cf="resumo_call" rows="3" placeholder="Como foi a call, dores, objeções, próximos passos...">${l.resumo_call||''}</textarea></label>` : '';
  const vendaField = (cur==='fechado') ? `<label class="full">Valor da venda (R$)<input type="number" min="0" step="100" data-cf="valor" value="${l.valor||''}"></label>` : '';
  const map = l.mapeamento ? `<div class="closer-map"><b>📋 Mapeamento do SDR</b><p>${String(l.mapeamento).replace(/</g,'&lt;')}</p></div>` : '';
  return `<div class="stage-row journey-stepper" role="group" aria-label="Etapa da call">${pills}</div>
    <div class="closer-fields">
      <div class="cf-row">
        <label>Produto<select data-cf="produto">${prodOpts}</select></label>
        <label>Valor proposto (R$)<input type="number" min="0" step="100" data-cf="valor_proposto" value="${l.valor_proposto||''}" placeholder="0"></label>
      </div>
      ${resumoField}
      ${vendaField}
      <button type="button" class="btn-primary" data-csave="${l.id}">Salvar</button>
      ${!['fechado','perdido'].includes(cur)?`<button type="button" class="btn-mini" data-remark="${l.id}">Remarcar call</button>`:''}
      <span class="sdr-ag-msg" id="cfmsg-${l.id}"></span>
    </div>${map}`;
}
function wireCloserControls(scope){
  scope.querySelectorAll('[data-cmv]').forEach(b=>b.onclick=()=>{
    const id=b.closest('[data-clead]').dataset.clead, stage=b.dataset.cmv;
    if(stage==='realizada'||stage==='segunda') abrirResumoReuniao(id,stage);
    else moverLeadCloser(id,stage);
  });
  scope.querySelectorAll('[data-csave]').forEach(b=>b.onclick=()=>salvarCloserLead(b.dataset.csave));
  scope.querySelectorAll('[data-remark]').forEach(b=>b.onclick=()=>abrirReagendamento(b.dataset.remark));
}
// Pop-up de resumo ao marcar Reunião realizada / 2ª reunião (obrigatório antes de salvar)
function abrirResumoReuniao(id,stage){
  const l=(ESTEIRA||[]).find(x=>String(x.id)===String(id)); if(!l) return;
  const card=document.querySelector(`[data-clead="${id}"]`);
  const produto=card?.querySelector('[data-cf="produto"]')?.value;
  const valorProp=card?.querySelector('[data-cf="valor_proposto"]')?.value;
  const prev = stage==='segunda' ? (l.resumo_call2||'') : (l.resumo_call||'');
  abrirPrompt({
    titulo: stage==='segunda' ? 'Resumo da 2ª reunião' : 'Resumo da reunião',
    sub: 'Cole a transcrição ou escreva o resumo. Sem isso não dá pra salvar.',
    campos: [{key:'resumo', type:'textarea', label:'Resumo / transcrição da reunião', value:prev, required:true, ph:'O que rolou na call, dores, objeções, próximos passos...'}],
    onSalvar: async(data)=>{
      const patch={...closerStagePatch(stage)};
      if(produto!==undefined) patch.produto=produto||null;
      if(valorProp!==undefined) patch.valor_proposto=Number(valorProp||0);
      if(stage==='segunda') patch.resumo_call2=data.resumo; else patch.resumo_call=data.resumo;
      const me=curUser(); if(me.role==='closer' && l.closer_id==null) patch.closer_id=me.id;
      const ok=await saveLead(id,patch); if(ok) refreshLeadViews();
    }
  });
}
// Pop-up genérico (usado no agendamento do SDR e no resumo do Closer)
function abrirPrompt({titulo, sub, campos, onSalvar}){
  let ov=document.getElementById('promptModal');
  if(!ov){ ov=document.createElement('div'); ov.id='promptModal'; ov.className='modal-overlay prompt-overlay'; document.body.appendChild(ov); }
  const fieldHtml=campos.map(f=>{
    if(f.type==='textarea') return `<label class="full">${f.label}<textarea data-pk="${f.key}" rows="5" ${f.required?'data-req':''} placeholder="${f.ph||''}">${f.value||''}</textarea></label>`;
    if(f.type==='select') return `<label class="full">${f.label}<select data-pk="${f.key}" ${f.required?'data-req':''}>${f.options||''}</select></label>`;
    return `<label>${f.label}<input type="${f.type}" data-pk="${f.key}" ${f.required?'data-req':''} value="${f.value||''}"></label>`;
  }).join('');
  ov.innerHTML=`<div class="modal-card"><button class="modal-x" id="pmX">×</button>
    <h2>${titulo}</h2>${sub?`<p class="muted sm" style="margin:0 0 12px">${sub}</p>`:''}
    <div class="prompt-fields">${fieldHtml}</div>
    <div class="ml-actions"><button class="btn-primary" id="pmSave" disabled>Salvar</button></div></div>`;
  ov.hidden=false;
  const check=()=>{ const ok=[...ov.querySelectorAll('[data-req]')].every(e=>String(e.value).trim()); const sv=document.getElementById('pmSave'); if(sv) sv.disabled=!ok; };
  ov.querySelectorAll('[data-pk]').forEach(e=>{ e.oninput=check; e.onchange=check; }); check();
  const close=()=>{ ov.hidden=true; ov.innerHTML=''; };
  document.getElementById('pmX').onclick=close; ov.onclick=e=>{ if(e.target===ov) close(); };
  document.getElementById('pmSave').onclick=async()=>{ const data={}; ov.querySelectorAll('[data-pk]').forEach(e=>data[e.dataset.pk]=e.value); close(); await onSalvar(data); };
}
async function salvarCloserLead(id){
  const modal=$('#leadModal'); const sc=(modal&&!modal.hidden)?modal:document;
  const card=sc.querySelector(`[data-clead="${id}"]`)||document.querySelector(`[data-clead="${id}"]`); if(!card) return;
  const g=s=>{const e=card.querySelector(`[data-cf="${s}"]`); return e?e.value:undefined;};
  const patch={};
  const prod=g('produto'); if(prod!==undefined) patch.produto=prod||null;
  const vp=g('valor_proposto'); if(vp!==undefined) patch.valor_proposto=Number(vp||0);
  const vv=g('valor'); if(vv!==undefined) patch.valor=Number(vv||0);
  const rc=g('resumo_call'); if(rc!==undefined) patch.resumo_call=rc;
  const m=card.querySelector('.sdr-ag-msg'); if(m){m.style.color='var(--ink2)';m.textContent='Salvando...';}
  const ok=await saveLead(id,patch);
  if(ok){ if(m){m.style.color='var(--ok)';m.textContent='✓ salvo';} setTimeout(()=>refreshLeadViews(),700); }
}
function closerLeadCard(l){
  const orig=l.funil||'—'; const dc=(l.agendado_em||'').slice(0,10);
  return `<div class="sdr-card" data-clead="${l.id}" data-nome="${(l.nome||'').toLowerCase()}">
    <div class="sdr-card-head">
      <div><b class="sdr-open" data-open="${l.id}">${l.nome||'(sem nome)'}</b> ${l.icp?`<span class="badge ${l.icp==='A'||l.icp==='B'?'ok':'none'}">ICP ${l.icp}</span>`:''}${leadFlagsHtml(l)}</div>
      <span class="muted sm">${orig}${dc?` · ${ICO_CAL} ${fmtDate(dc)}${l.agendado_hora?` ${l.agendado_hora}`:''}`:''}</span>
    </div>
    ${l.telefone?`<div class="muted sm">${waTelHtml(l.telefone)}</div>`:''}
    ${closerControlsInner(l)}
  </div>`;
}
let CLOSER_FILTRO='abrir';   // abrir | hoje | todos
function renderCloserLancar(){
  const lbl=$('#entryRoleLabel'), form=$('#entryForm'), msg=$('#entryMsg');
  if(msg) msg.textContent='';
  const card=form.closest('.card'); if(card){card.classList.remove('narrow');card.classList.add('sdr-lancar');}
  form.classList.add('sdr-form');
  lbl.innerHTML=`Suas calls · <b>atualize o que rolou em cada uma</b>`;
  let leads=closerScopeLeads().slice().sort((a,b)=>(b.agendado_em||'').localeCompare(a.agendado_em||''));
  if(CLOSER_FILTRO==='hoje') leads=leads.filter(l=>(l.agendado_em||'').slice(0,10)===TODAY);
  else if(CLOSER_FILTRO==='abrir') leads=leads.filter(l=>!['fechado','perdido'].includes(closerEtapa(l)));
  const chip=(k,t)=>`<button type="button" class="sdr-fil ${CLOSER_FILTRO===k?'on':''}" data-cfil="${k}">${t}</button>`;
  const filtros=`<div class="sdr-filtros">${chip('abrir','Em aberto')}${chip('hoje','Calls de hoje')}${chip('todos','Histórico completo')}
    <input type="search" id="closerBusca" class="lead-busca" placeholder="buscar lead" value="${SDR_Q}">
    <span class="muted sm" id="sdrCount">${leads.length} calls</span></div>`;
  const rows=leads.length?leads.map(l=>closerLeadCard(l)).join(''):'<p class="muted sm" style="padding:12px">Nenhuma call nesse filtro.</p>';
  form.innerHTML=filtros+`<div class="sdr-list">${rows}</div>`;
  form.querySelectorAll('.sdr-fil').forEach(b=>b.onclick=()=>{CLOSER_FILTRO=b.dataset.cfil;renderCloserLancar();});
  form.querySelectorAll('.sdr-open').forEach(b=>b.onclick=()=>openEsteiraLeadModal(b.dataset.open));
  wireCloserControls(form);
  const busca=$('#closerBusca'); if(busca){busca.oninput=()=>{SDR_Q=busca.value;filtrarSdrCards();}; if(SDR_Q)filtrarSdrCards();}
  renderCloserDeals();   // painel de deals (dc_pipeline) ao lado da worklist
}
// ---- Meus deals (dc_pipeline) · visão do closer ----
function myPipeCards(){ const me=curUser(); return me?getPipeline().filter(c=>String(c.closer_id)===String(me.id)):[]; }
function pipeAbertos(cards){ return cards.filter(c=>ETAPAS_ABERTAS.includes(c.etapa||'1a_call')); }
// Bloco "deals em aberto por produto" (formato dos cards "Contratos por ticket" do gestor,
// sempre com os 4 produtos fixos: Unity, ConstruMaster, Assessoria, CPV)
function closerDealsPorProduto(abertos){
  const byProd={}; for(const k of Object.keys(PRODUCTS)) byProd[k]=[];
  let semProduto=0;
  for(const c of abertos){ if(byProd[c.produto]) byProd[c.produto].push(c); else semProduto++; }
  const tempPill=(cs,t)=>{const n=cs.filter(c=>(c.temperatura||'morno')===t).length;
    return n?`<span class="temp ${t}">${intf(n)} ${TEMP_LABEL[t].toLowerCase()}${n>1?'s':''}</span>`:'';};
  const cards=Object.entries(PRODUCTS).map(([k,p])=>{const cs=byProd[k];
    const soma=cs.reduce((s,c)=>s+(Number(c.valor_apresentado)||0),0);
    const temps=cs.length?`${tempPill(cs,'quente')}${tempPill(cs,'morno')}${tempPill(cs,'frio')}`:'<span class="muted sm">sem deals em aberto</span>';
    return `<div class="ticket-card${cs.length?'':' tk-zero'}">
      <div class="t-name">${p.label}</div>
      <div class="t-ticket">${money(p.ticket)}</div>
      <div class="t-stats"><span><b>${intf(cs.length)}</b> em aberto</span></div>
      <div class="t-stats">${temps}</div>
      <div class="t-money">${money(soma)} <small>na mesa</small></div>
    </div>`;}).join('');
  const extra=semProduto?`<p class="muted sm" style="margin:8px 0 0">${intf(semProduto)} deal(s) sem produto definido também em aberto · defina o produto no card.</p>`:'';
  return `<h2 class="section-title">Deals em aberto por produto</h2><section class="ticket-grid tg-closer">${cards}</section>${extra}`;
}
function renderCloserGeral(){
  const pane=$('#sub-geral'); if(!pane) return;
  const deals=myPipeCards(), abertos=pipeAbertos(deals);
  const naMesa=abertos.reduce((s,c)=>s+(Number(c.valor_apresentado)||0),0);
  const inR=closerLeadsInRange(), all=closerScopeLeads();
  const hoje=all.filter(l=>(l.agendado_em||'').slice(0,10)===TODAY);
  const cnt=(a,f)=>a.filter(f).length;
  const marcadas=inR.length, compareceram=cnt(inR,l=>l.compareceu);
  const noshow=cnt(inR,l=>l.compareceu_confirmado&&!l.compareceu);
  const followup=cnt(all,l=>closerEtapa(l)==='followup');
  const fechadas=cnt(inR,l=>l.vendeu);
  const faturamento=inR.filter(l=>l.vendeu).reduce((s,l)=>s+(Number(l.valor)||0),0);
  const txComp=marcadas?100*compareceram/marcadas:NaN, txConv=compareceram?100*fechadas/compareceram:NaN;
  const kc=(l,v,c)=>`<div class="kpi none kpi-${c||'x'}"><div class="k-label">${l}</div><div class="k-val">${v}</div></div>`;
  pane.innerHTML=`
    <section class="kpi-grid kg-closer">
      <div class="kpi none kpi-mesa"><div class="k-label">Dinheiro na mesa</div><div class="k-val">${money(naMesa)}</div><div class="k-meta">${intf(abertos.length)} deals em aberto · em negociação</div></div>
      ${kc('Calls hoje',intf(hoje.length),'b')}
      ${kc('Calls marcadas',intf(marcadas))}
      ${kc('Compareceram',intf(compareceram),'t')}
      ${kc('No-show',intf(noshow))}
      ${kc('Em follow up',intf(followup),'p')}
      ${kc('Taxa de comparecimento',pct(txComp))}
      ${kc('Taxa de conversão',pct(txConv),'g')}
      ${kc('Faturamento',money(faturamento),'g')}
    </section>
    ${closerDealsPorProduto(abertos)}
    <div class="two-col">
      <section class="card"><h2>Calls por dia</h2><div class="chart-box"><canvas id="chartCalls"></canvas></div></section>
      <section class="card"><h2>Seu funil comercial</h2><div id="closerFunnelMini" class="funnel"></div></section>
    </div>`;
  const dates=lastNDates(8),labels=dates.map(fmtDate);
  const marc=dates.map(d=>all.filter(l=>(l.agendado_em||'').slice(0,10)===d).length);
  const comp=dates.map(d=>all.filter(l=>(l.agendado_em||'').slice(0,10)===d&&l.compareceu).length);
  drawChart('chartCalls','bar',labels,[
    {label:'Marcadas',data:marc,backgroundColor:barGrad('#60a5fa','#1d4ed8'),borderColor:'#60a5fa',borderWidth:1,borderRadius:7,maxBarThickness:20},
    {label:'Compareceram',data:comp,backgroundColor:barGrad('#4ade80','#15803d'),borderColor:'#4ade80',borderWidth:1,borderRadius:7,maxBarThickness:20},
  ]);
  renderFunnelBars($('#closerFunnelMini'),[
    ['Marcadas',marcadas,'#3b82f6'],
    ['Compareceram',compareceram,'#0ea5e9'],
    ['Negociação',cnt(inR,l=>['negociacao','segunda','fechado'].includes(closerEtapa(l))),'#a855f7'],
    ['Fechadas',fechadas,'#22c55e'],
  ]);
}
function renderCloserFunil(){
  const pick=$('#funnelPicker'); if(pick) pick.innerHTML='';
  const inR=closerLeadsInRange(); const cnt=(f)=>inR.filter(f).length;
  const marcadas=inR.length, compareceram=cnt(l=>l.compareceu),
        negoc=cnt(l=>['negociacao','segunda','fechado'].includes(closerEtapa(l))),
        fechadas=cnt(l=>l.vendeu), perdidas=cnt(l=>closerEtapa(l)==='perdido'),
        noshow=cnt(l=>l.compareceu_confirmado&&!l.compareceu), followup=cnt(l=>closerEtapa(l)==='followup');
  const fat=inR.filter(l=>l.vendeu).reduce((s,l)=>s+(Number(l.valor)||0),0);
  const kg=$('#kpiTop'); if(kg){ const kc=(l,v,c)=>`<div class="kpi none kpi-${c||'x'}"><div class="k-label">${l}</div><div class="k-val">${v}</div></div>`;
    kg.innerHTML=[['Calls marcadas',intf(marcadas),'b'],['Compareceram',intf(compareceram),'t'],['Fechadas',intf(fechadas),'g'],['Perdidas',intf(perdidas),''],['No-show',intf(noshow),''],['Faturamento',money(fat),'g']].map(([l,v,c])=>kc(l,v,c)).join(''); }
  renderFunnelBars($('#funnel'),[
    ['Calls marcadas',marcadas,'#3b82f6'],
    ['Compareceram',compareceram,'#0ea5e9'],
    ['Negociação',negoc,'#a855f7'],
    ['Fechadas',fechadas,'#22c55e'],
  ]);
  const wf=$('#waterfall'); if(wf){ const row=(n,v)=>`<div class="metric-row"><span class="m-name">${n}</span><span class="m-val">${v}</span></div>`;
    wf.innerHTML=row('Taxa de comparecimento',pct(marcadas?100*compareceram/marcadas:NaN))
      +row('Taxa de conversão',pct(compareceram?100*fechadas/compareceram:NaN))
      +row('Em follow up',intf(followup))+row('No-show',intf(noshow))+row('Perdidas',intf(perdidas)); }
  const h1=document.querySelector('#sub-funil .two-col .card:nth-child(1) h2'); if(h1) h1.textContent='Funil comercial';
  const h2b=document.querySelector('#sub-funil .two-col .card:nth-child(2) h2'); if(h2b) h2b.textContent='Taxas';
  const st=document.querySelector('#sub-funil .section-title'); if(st) st.style.display='none';
  const ct=$('#campTree'); if(ct) ct.innerHTML='';
}
function renderJornadaCloser(){
  const board=$('#jornadaBoard'); if(!board) return;
  board.classList.remove('jb-sdr'); board.classList.add('jb-closer');
  const me=curUser(); const canMove=me.role==='closer';
  let leads=closerScopeLeads();
  if(JQ.trim()){ const q=JQ.trim().toLowerCase(); leads=leads.filter(l=>(l.nome||'').toLowerCase().includes(q)); }
  const kp=$('#jornadaKpis');
  if(kp) kp.innerHTML=CLOSER_ETAPAS.map(E=>{const n=leads.filter(l=>closerEtapa(l)===E.k).length;
    return `<div class="kpi none" style="--sc:${E.color}"><div class="k-label">${E.label}</div><div class="k-val">${intf(n)}</div><div class="k-meta">calls</div></div>`;}).join('');
  const isMgr=me.role==='gestor';
  board.innerHTML=CLOSER_ETAPAS.map(E=>{
    const cs=leads.filter(l=>closerEtapa(l)===E.k);
    const body=cs.length?cs.map(l=>{
      const dt=l.agendado_em?`<div class="muted sm" style="margin-top:5px">${ICO_CAL} ${fmtDate(l.agendado_em)}${l.agendado_hora?` ${l.agendado_hora}`:''}</div>`:'';
      const info=(l.produto||l.valor_proposto)?`<div class="muted sm" style="margin-top:4px">${l.produto?produtoLabel(l.produto):''}${l.valor_proposto?`${l.produto?' · ':''}${money(l.valor_proposto)} proposto`:''}</div>`:'';
      const val=l.vendeu&&l.valor?`<div class="jcard-cash">${money(l.valor)} vendido</div>`:'';
      const fl=leadFlagsHtml(l);
      return `<div class="jcard" data-lid="${l.id}" draggable="${canMove}"><div class="jcard-person">${avatarHtml(l.nome,l.foto_url||l.avatar_url,'avt-sm')}<b class="jopen">${l.nome||'(sem nome)'}</b></div>
        <div class="jcard-foot"><span class="temp ${l.qualificado?'frio':'morno'}">${l.icp?('ICP '+l.icp):''}</span>${waChipHtml(l.telefone)}${isMgr?`<span class="muted">${(getUsers().find(u=>u.id===l.closer_id)||{}).nome||''}</span>`:''}</div>
        ${fl?`<div class="jflags">${fl}</div>`:''}
        ${dt}${info}${val}</div>`;}).join(''):'<p class="muted sm">—</p>';
    return `<div class="jcol" data-cstage="${E.k}"><div class="jcol-head" style="--sc:${E.color}">${E.label} <span>${cs.length}</span></div><div class="jcol-body">${body}</div></div>`;
  }).join('');
  wireJourneyCards(board,'.jcard[data-lid]',card=>openEsteiraLeadModal(card.dataset.lid));
  if(canMove){
    board.querySelectorAll('.jcard[data-lid]').forEach(card=>{
      card.ondragstart=e=>{_dragId=card.dataset.lid;e.dataTransfer.effectAllowed='move';};
      card.ondragend=()=>{_dragId=null;board.querySelectorAll('.jcol').forEach(c=>c.classList.remove('drop'));};
    });
    board.querySelectorAll('.jcol').forEach(col=>{
      col.ondragover=e=>{e.preventDefault();col.classList.add('drop');};
      col.ondragleave=()=>col.classList.remove('drop');
      col.ondrop=e=>{e.preventDefault();col.classList.remove('drop');const id=_dragId,st=col.dataset.cstage;if(id&&st)moverLeadCloser(id,st);};
    });
  }
}
// Jornada do CLOSER logado: lê os deals do dc_pipeline (closer_id = usuário logado).
// O gestor continua vendo a visão de esteira (renderJornadaCloser acima).
function renderJornadaCloserView(){ if(curUser()?.role==='closer') renderJornadaCloserPipe(); else renderJornadaCloser(); }
function renderJornadaCloserPipe(){
  const board=$('#jornadaBoard'); if(!board) return;
  board.classList.remove('jb-sdr'); board.classList.add('jb-closer');
  let cards=myPipeCards();
  if(JQ.trim()){ const q=JQ.trim().toLowerCase(); cards=cards.filter(c=>(c.lead_nome||'').toLowerCase().includes(q)); }
  const etapaDe=c=>ETAPA_MAP[c.etapa]?c.etapa:'1a_call';
  const kp=$('#jornadaKpis');
  if(kp) kp.innerHTML=ETAPAS.map(E=>{const n=cards.filter(c=>etapaDe(c)===E.k).length;
    return `<div class="kpi none" style="--sc:${E.color}"><div class="k-label">${E.label}</div><div class="k-val">${intf(n)}</div><div class="k-meta">deals</div></div>`;}).join('');
  board.innerHTML=ETAPAS.map(E=>{
    const cs=cards.filter(c=>etapaDe(c)===E.k);
    const body=cs.length?cs.map(c=>{
      const info=(c.produto||c.valor_apresentado)?`<div class="muted sm" style="margin-top:4px">${c.produto?produtoLabel(c.produto):''}${Number(c.valor_apresentado)?`${c.produto?' · ':''}${money(c.valor_apresentado)} proposto`:''}</div>`:'';
      const val=E.k==='fechado'?`<div class="jcard-cash">${money(c.valor_contrato)} contratado · ${money(c.valor_coletado)} coletado</div>`:'';
      return `<div class="jcard" data-pid="${c.id}" draggable="true"><div class="jcard-person">${avatarHtml(c.lead_nome,c.foto_url||c.avatar_url,'avt-sm')}<b class="jopen">${c.lead_nome||'(sem nome)'}</b></div>
        <div class="jcard-foot"><span class="temp ${c.temperatura||'morno'}">${TEMP_LABEL[c.temperatura]||'Morno'}</span>${waChipHtml(c.telefone)}</div>
        ${info}${val}</div>`;}).join(''):'<p class="muted sm">·</p>';
    return `<div class="jcol" data-pstage="${E.k}"><div class="jcol-head" style="--sc:${E.color}">${E.label} <span>${cs.length}</span></div><div class="jcol-body">${body}</div></div>`;
  }).join('');
  wireJourneyCards(board,'.jcard[data-pid]',card=>openLeadModal(card.dataset.pid));
  board.querySelectorAll('.jcard[data-pid]').forEach(card=>{
    card.ondragstart=e=>{_dragId=card.dataset.pid;e.dataTransfer.effectAllowed='move';};
    card.ondragend=()=>{_dragId=null;board.querySelectorAll('.jcol').forEach(c=>c.classList.remove('drop'));};
  });
  board.querySelectorAll('.jcol').forEach(col=>{
    col.ondragover=e=>{e.preventDefault();col.classList.add('drop');};
    col.ondragleave=()=>col.classList.remove('drop');
    col.ondrop=e=>{e.preventDefault();col.classList.remove('drop');const id=_dragId,st=col.dataset.pstage;if(id&&st)moveLead(id,st);};
  });
}
function moveLead(id,stage){ if(stage==='fechado') pipeFechar(id); else pipeSetEtapa(id,stage); }
function cardById(id){ return getPipeline().find(c=>String(c.id)===String(id)); }
function closeModal(){ const m=$('#leadModal'); if(m){m.hidden=true;m.innerHTML='';} }
function openLeadModal(id){
  const c=cardById(id); if(!c)return;
  const me=curUser(); const own=me.role==='closer'&&String(c.closer_id)===String(me.id);
  const E=ETAPA_MAP[c.etapa]||{label:c.etapa};
  const ownerName=(getUsers().find(u=>u.id===c.closer_id)||{}).nome||'';
  const m=$('#leadModal');
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  const movePills=own
    ? `<div class="ml-move"><span class="ml-lbl">Mover na jornada:</span><div class="stage-row journey-stepper" role="group" aria-label="Etapa do deal">${ETAPAS.map(s=>`<button type="button" class="stage-pill${s.k===c.etapa?' on':''}" data-mv="${s.k}" style="--sc:${s.color}" aria-pressed="${s.k===c.etapa}">${s.label}</button>`).join('')}</div></div>
       <div class="ml-actions"><button type="button" class="btn-mini" data-del="1">🗑 Excluir cliente</button></div>`
    : '';
  if(own){
    // Deal editável: nome, produto, temperatura e valores atualizam o dc_pipeline
    const prodOpts=['<option value="">Produto…</option>'].concat(Object.entries(PRODUCTS).map(([k,p])=>`<option value="${k}"${c.produto===k?' selected':''}>${p.label} · ${money(p.ticket)}</option>`)).join('');
    const tempOpts=Object.entries(TEMP_LABEL).map(([k,l])=>`<option value="${k}"${(c.temperatura||'morno')===k?' selected':''}>${l}</option>`).join('');
    const fechadoFields=c.etapa==='fechado'?`
        <label>Valor do contrato (R$)<input type="number" min="0" step="100" data-pf="valor_contrato" value="${c.valor_contrato??''}"></label>
        <label>Coletado · cash collect (R$)<input type="number" min="0" step="100" data-pf="valor_coletado" value="${c.valor_coletado??''}"></label>`:'';
    m.innerHTML=`<div class="modal-card lead-detail" role="dialog" aria-modal="true" aria-labelledby="leadTitle-${c.id}">
      <button type="button" class="modal-x" id="mClose" aria-label="Fechar modal">×</button>
      <header class="lead-modal-head">${avatarHtml(c.lead_nome,c.foto_url||c.avatar_url,'avt-lg')}<div><span class="lead-modal-kicker">Editar deal</span><h2 id="leadTitle-${c.id}">${escHtml(c.lead_nome||'(sem nome)')}</h2><span class="lead-stage-chip" style="--sc:${E.color||'var(--gold-2)'}">${E.label}</span></div></header>
      <form id="pipeEditForm" class="entry-form" style="margin:0">
        <label class="full">Cliente (nome)<input data-pf="lead_nome" value="${esc(c.lead_nome)}" required></label>
        <label>Produto<select data-pf="produto">${prodOpts}</select></label>
        <label>Temperatura<select data-pf="temperatura">${tempOpts}</select></label>
        <label>WhatsApp / telefone<input type="tel" data-pf="telefone" value="${esc(c.telefone)}" placeholder="(DDD) 99999-9999"></label>
        <label>Valor proposto (R$)<input type="number" min="0" step="100" data-pf="valor_apresentado" value="${c.valor_apresentado??''}"></label>
        ${fechadoFields}
        <button class="btn-primary full" type="submit">Salvar alterações</button>
        <p class="entry-msg" id="pipeEditMsg"></p>
      </form>
      ${movePills}
    </div>`;
  } else {
    const fechadoInfo=c.etapa==='fechado'
      ? `<div class="ml-item"><span class="ml-chip-label">Valor do contrato</span><strong>${money(c.valor_contrato)}</strong></div>
         <div class="ml-item"><span class="ml-chip-label">Cash collect</span><strong class="cash">${money(c.valor_coletado)}</strong></div>`
      : '';
    m.innerHTML=`<div class="modal-card lead-detail" role="dialog" aria-modal="true" aria-labelledby="leadTitle-${c.id}">
      <button type="button" class="modal-x" id="mClose" aria-label="Fechar modal">×</button>
      <header class="lead-modal-head">${avatarHtml(c.lead_nome,c.foto_url||c.avatar_url,'avt-lg')}<div><span class="lead-modal-kicker">Etapa atual</span><h2 id="leadTitle-${c.id}">${escHtml(c.lead_nome||'(sem nome)')}</h2><span class="lead-stage-chip" style="--sc:${E.color||'var(--gold-2)'}">${E.label}</span></div></header>
      <div class="ml-grid">
        <div class="ml-item"><span class="ml-chip-label">Produto</span><strong>${c.produto?produtoLabel(c.produto)+' · '+money(PRODUCTS[c.produto].ticket):'—'}</strong></div>
        <div class="ml-item"><span class="ml-chip-label">Temperatura</span><strong>${TEMP_LABEL[c.temperatura]||'—'}</strong></div>
        <div class="ml-item ml-item-action"><span class="ml-chip-label">WhatsApp</span><strong>${c.telefone?waTelHtml(c.telefone):'—'}</strong></div>
        <div class="ml-item"><span class="ml-chip-label">Valor proposto</span><strong>${money(c.valor_apresentado)}</strong></div>
        ${fechadoInfo}
        ${me.role==='gestor'?`<div class="ml-item"><span class="ml-chip-label">Closer</span><strong>${ownerName||'—'}</strong></div>`:''}
      </div>
    </div>`;
  }
  m.hidden=false;
  $('#mClose').onclick=closeModal;
  m.onclick=e=>{if(e.target===m)closeModal();};
  if(own){
    const f=$('#pipeEditForm');
    if(f) f.onsubmit=async ev=>{
      ev.preventDefault();
      const g=k=>{const el2=f.querySelector(`[data-pf="${k}"]`);return el2?el2.value:undefined;};
      const patch={lead_nome:(g('lead_nome')||'').trim(),produto:g('produto')||null,temperatura:g('temperatura')||'morno',telefone:(g('telefone')||'').trim()||null,valor_apresentado:Number(g('valor_apresentado')||0),updated_at:new Date().toISOString()};
      if(g('valor_contrato')!==undefined) patch.valor_contrato=Number(g('valor_contrato')||0);
      if(g('valor_coletado')!==undefined) patch.valor_coletado=Number(g('valor_coletado')||0);
      if(!patch.lead_nome) return;
      const msg=$('#pipeEditMsg'); if(msg){msg.style.color='var(--ink2)';msg.textContent='Salvando...';}
      try{ const {error}=await sb.from('dc_pipeline').update(patch).eq('id',c.id); if(error)throw error;
        await loadPipeline(); closeModal(); refreshPipelineViews(); }
      catch(e2){ if(msg){msg.style.color='var(--bad)';msg.textContent='Erro: '+(e2.message||e2);} }
    };
    m.querySelectorAll('[data-mv]').forEach(b=>b.onclick=()=>{const s=b.dataset.mv;closeModal();if(s==='fechado')pipeFechar(c.id);else pipeSetEtapa(c.id,s);});
    const del=m.querySelector('[data-del]'); if(del) del.onclick=()=>{closeModal();pipeExcluir(c.id);};
  }
}
function openAddModal(){
  const prodOpts=Object.entries(PRODUCTS).map(([k,p])=>`<option value="${k}">${p.label} · ${money(p.ticket)}</option>`).join('');
  const m=$('#leadModal');
  m.innerHTML=`<div class="modal-card">
    <button class="modal-x" id="mClose">×</button>
    <h2>Novo cliente</h2>
    <form id="addForm" class="entry-form">
      <label class="full">Cliente (nome)<input name="lead_nome" autocomplete="off" required></label>
      <label>Produto<select name="produto">${prodOpts}</select></label>
      <label>Temperatura<select name="temperatura"><option value="quente">Quente</option><option value="morno" selected>Morno</option><option value="frio">Frio</option></select></label>
      <label>WhatsApp / telefone<input type="tel" name="telefone" placeholder="(DDD) 99999-9999"></label>
      <label>Valor proposto (R$)<input type="number" min="0" step="1" name="valor_apresentado"></label>
      <button class="btn-primary full" type="submit">Adicionar</button>
    </form>
  </div>`;
  m.hidden=false;
  $('#mClose').onclick=closeModal;
  m.onclick=e=>{if(e.target===m)closeModal();};
  $('#addForm').onsubmit=async e=>{ await pipeAdd(e); closeModal(); };
}

function renderMissing(){
  const me=curUser();const b=$('#missingBanner');b.hidden=false;
  const ok=()=>{b.style.background='var(--ok-bg)';b.style.color='var(--ok-text)';b.style.borderColor='rgba(34,197,94,.45)';};
  const warn=()=>{b.style.background='';b.style.color='';b.style.borderColor='';};
  const START=TRAFFIC.daily.length?TRAFFIC.daily[0].date:TODAY;
  if(TODAY<START){ ok(); b.innerHTML=`${ICO_CAL} A operação começa em <b>${fmtDate(START)}</b>. Os lançamentos começam aí.`; return; }
  if(me.role!=='gestor'){
    const filled=getEntries().some(e=>e.userId===me.id&&e.date===TODAY);
    if(filled){ok();b.innerHTML=`✓ Você já lançou os dados de hoje (${fmtDate(TODAY)}).`;}
    else{warn();b.innerHTML=`${ICO_WARN} Você ainda não lançou os dados de hoje (${fmtDate(TODAY)}). <a href="#" id="goLancar">Lançar agora →</a>`;
      const a=$('#goLancar');if(a)a.onclick=ev=>{ev.preventDefault();document.querySelector('.tab[data-tab="lancar"]').click();};}
    return;
  }
  const users=getUsers().filter(u=>ENTRY_ROLES.includes(u.role));
  if(!users.length){b.hidden=true;return;}
  const todays=getEntries().filter(e=>e.date===TODAY);
  const missing=users.filter(u=>!todays.some(e=>e.userId===u.id));
  if(!missing.length){ok();b.innerHTML=`✓ Todo mundo lançou os dados de hoje (${fmtDate(TODAY)}).`;return;}
  warn();b.innerHTML=`${ICO_WARN} Não lançaram hoje (${fmtDate(TODAY)}): `+missing.map(u=>`<b>${u.nome} (${ROLES[u.role].label})</b>`).join(', ');
}
function fmtDate(d){const[y,m,dd]=d.split('-');return `${dd}/${m}`;}

// ---------- ENTRY (lançar dados do dia) ----------
function renderEntryForm(){
  const u=curUser();const lbl=$('#entryRoleLabel');const form=$('#entryForm');
  if(isFieldRole(u.role)) return renderSDRLancar();
  if(u.role==='closer') return renderCloserLancar();
  if(!ENTRY_ROLES.includes(u.role)){
    lbl.innerHTML='Gestor · <b>Gasto de tráfego</b>';
    const date=$('#entryDate').value;const t=TRAFFIC.daily.find(d=>d.date===date);const cur=t?t.spend:0;
    form.innerHTML=`<label class="full">Gasto de tráfego do dia (R$)<input type="number" min="0" step="0.01" name="spend" value="${cur||''}" placeholder="ex: 850.00" /><small class="field-hint">Quanto você gastou em ads nesse dia (você vê no Meta Ads). É isso que faz o CPL, CAC e custo por call calcularem.</small></label><button class="btn-primary full" type="submit">Salvar gasto</button>`;
    return;
  }
  lbl.innerHTML=`Função: <b>${ROLES[u.role].label}</b> · ${u.nome}`;
  const date=$('#entryDate').value;
  const existing=getEntries().find(e=>e.userId===u.id&&e.date===date);
  form.innerHTML='';
  if(u.role==='sdr'){
    const t=TRAFFIC.daily.find(d=>d.date===date);
    const leads=t?t.leads:0, icp=t?(t.icpA+t.icpB):0;
    const box=el('div','auto-box full');
    box.innerHTML=`<div class="auto-item"><span>Leads que chegaram</span><b>${leads}</b></div>
      <div class="auto-item"><span>Leads qualificados (ICP)</span><b>${icp}</b></div>
      <div class="auto-tag">⚡ automático</div>`;
    form.appendChild(box);
  }
  for(const f of ROLES[u.role].fields){
    const wrap=el('label');
    wrap.innerHTML=`${f.label}<input type="number" min="0" step="1" name="${f.k}" value="${existing?existing.data[f.k]??'':''}" />${f.hint?`<small class="field-hint">${f.hint}</small>`:''}`;
    form.appendChild(wrap);
  }
  const btn=el('button','btn-primary full');btn.type='submit';btn.textContent=existing?'Atualizar lançamento':'Salvar lançamento';
  form.appendChild(btn);
}
async function saveEntry(ev){
  ev.preventDefault();const u=curUser();const date=$('#entryDate').value;
  const data={};for(const f of ROLES[u.role].fields)data[f.k]=Number(new FormData($('#entryForm')).get(f.k)||0);
  const msg=$('#entryMsg');msg.style.color='var(--ink2)';msg.textContent='Salvando...';
  if(u.role==='gestor'){
    const spend=Number(new FormData($('#entryForm')).get('spend')||0);
    try{ const {error}=await sb.from('dc_traffic').upsert({data:date,spend},{onConflict:'data'}); if(error)throw error;
      await loadTraffic(); msg.style.color='var(--ok)';msg.textContent='✓ Gasto salvo para '+fmtDate(date);
      renderDashboard();renderEntryForm(); setTimeout(()=>{if(msg.textContent.startsWith('✓'))msg.textContent='';},2500);
    }catch(e){msg.style.color='var(--bad)';msg.textContent='Erro: '+(e.message||e);} return;
  }
  try{
    const {error}=await sb.from('dc_lancamentos').upsert({usuario_id:u.id,data:date,role:u.role,dados:data,updated_at:new Date().toISOString()},{onConflict:'usuario_id,data'});
    if(error) throw error;
    await loadEntries();
    msg.style.color='var(--ok)';msg.textContent='✓ Salvo para '+fmtDate(date);
    renderDashboard();renderCalendar();renderEntryForm();
    setTimeout(()=>{if(msg.textContent.startsWith('✓'))msg.textContent='';},2500);
  }catch(e){msg.style.color='var(--bad)';msg.textContent='Erro ao salvar: '+(e.message||e);}
}

// ===== Social Seller (Tiago): métricas próprias de prospecção na DM =====
function mySocialAgg(){
  const me=curUser(); const set=new Set(datesBetween(RANGE.start,RANGE.end));
  const acc={}; ROLES.social_seller.fields.forEach(f=>acc[f.k]=0);
  getEntries().forEach(e=>{ if(e.userId===me.id && e.role==='social_seller' && (!set.size||set.has(e.date)))
    ROLES.social_seller.fields.forEach(f=>acc[f.k]+=Number(e.data[f.k]||0)); });
  return acc;
}
function socialPerfSection(){
  const s=mySocialAgg();
  const resp  = s.mensagens_enviadas? (100*s.directs_recebidos/s.mensagens_enviadas):NaN;
  const agend = s.conversas_ativas?   (100*s.reunioes_agendadas/s.conversas_ativas):NaN;
  const row=(n,v)=>`<div class="metric-row"><span class="m-name">${n}</span><span class="m-val">${v}</span></div>`;
  return `<h2 class="section-title">Seu funil de Social Selling</h2>
    <div class="two-col">
      <section class="card"><h2>Funil</h2><div id="socialFunnel" class="funnel"></div></section>
      <section class="card"><h2>Volume e taxas</h2>
        ${row('Conversas ativas',intf(s.conversas_ativas))}
        ${row('Taxa de resposta',pct(resp))}
        ${row('Taxa de agendamento',pct(agend))}
      </section>
    </div>`;
}
function socialMetricsFormHTML(){
  const me=curUser(); const date=$('#entryDate').value||TODAY;
  const ex=getEntries().find(e=>e.userId===me.id&&e.date===date&&e.role==='social_seller');
  const fields=ROLES.social_seller.fields.map(f=>`<label>${f.label}<input type="number" min="0" step="1" data-sm="${f.k}" value="${ex?(ex.data[f.k]??''):''}"><small class="field-hint">${f.hint||''}</small></label>`).join('');
  return `<div class="social-metrics">
    <div class="sm-head">Suas métricas de Social Seller · <b>${fmtDate(date)}</b></div>
    <div class="sm-grid">${fields}</div>
    <button type="button" class="btn-primary" id="smSave">Salvar métricas do dia</button>
    <span class="sm-msg" id="smMsg"></span>
  </div>`;
}
async function saveSocialMetrics(){
  const me=curUser(); const date=$('#entryDate').value||TODAY;
  const data={}; document.querySelectorAll('[data-sm]').forEach(i=>data[i.dataset.sm]=Number(i.value||0));
  const msg=$('#smMsg'); if(msg){msg.style.color='var(--ink2)';msg.textContent='Salvando...';}
  try{
    const {error}=await sb.from('dc_lancamentos').upsert({usuario_id:me.id,data:date,role:'social_seller',dados:data,updated_at:new Date().toISOString()},{onConflict:'usuario_id,data'});
    if(error) throw error;
    await loadEntries();
    if(msg){msg.style.color='var(--ok)';msg.textContent='✓ métricas salvas';setTimeout(()=>{if(msg)msg.textContent='';},2000);}
    renderGeral(); renderCalendar();
  }catch(e){ if(msg){msg.style.color='var(--bad)';msg.textContent='Erro: '+(e.message||e);} }
}

// ===== LANÇAR DADOS — worklist do SDR (marca o que fez em cada lead) =====
let SDR_FILTRO='pendentes';   // pendentes | hoje | todos
const SDR_CHECKS=[
  {f:'atendeu',   label:'Contatou'},
  {f:'respondeu', label:'Respondeu'},
  {f:'follow_up', label:'Follow up'},
  {f:'agendou',   label:'Agendou'},
  {f:'compareceu',label:'Compareceu'},
  // não é coluna do banco: vive no sdr_status. Marcar exige motivo (pop-up).
  {f:'desqualificado', label:'Desqualificado', bad:true},
];
const chkLigado=(l,f)=> f==='desqualificado' ? desqualificado(l) : !!l[f];
let SDR_Q='';
function renderSDRLancar(){
  const lbl=$('#entryRoleLabel'), form=$('#entryForm'), msg=$('#entryMsg');
  const cd=$('#closerDeals'); if(cd) cd.hidden=true;
  if(msg) msg.textContent='';
  const card=form.closest('.card'); if(card){ card.classList.remove('narrow'); card.classList.add('sdr-lancar'); }
  form.classList.add('sdr-form');
  lbl.innerHTML=`Seus leads · <b>marque o que já fez em cada um</b>`;
  let leads=myLeads().slice().sort((a,b)=>(b.data_chegada||'').localeCompare(a.data_chegada||''));
  const nAntigos=leads.filter(l=>antigoPendente(l)&&l.sdr_status!=='perdido').length;
  if(SDR_FILTRO==='hoje') leads=leads.filter(l=>diaBR(l.data_chegada)===TODAY);
  else if(SDR_FILTRO==='pendentes') leads=leads.filter(l=>!l.agendou&&!l.compareceu&&l.sdr_status!=='perdido'&&!antigoPendente(l));   // antigos pendentes têm categoria própria
  else if(SDR_FILTRO==='antigos') leads=leads.filter(l=>antigoPendente(l)&&l.sdr_status!=='perdido');   // importados ainda sem interação
  const chip=(k,t)=>`<button type="button" class="sdr-fil ${SDR_FILTRO===k?'on':''}" data-fil="${k}">${t}</button>`;
  const filtros=`<div class="sdr-filtros">${chip('pendentes','A trabalhar')}${chip('hoje','Chegaram hoje')}${chip('antigos',`Leads Antigos · ${intf(nAntigos)}`)}${chip('todos','Histórico completo')}
    <button type="button" class="btn-mini ok" id="wlAddLead">+ Cadastrar lead</button>
    <input type="search" id="sdrBusca" class="lead-busca" placeholder="buscar lead pelo nome" value="${SDR_Q}">
    <span class="muted sm" id="sdrCount">${leads.length} leads</span></div>`;
  const rows = leads.length ? leads.map(l=>sdrLeadCard(l)).join('') : '<p class="muted sm" style="padding:12px">Nenhum lead nesse filtro. 🎉</p>';
  const socialTop = curUser().role==='social_seller' ? socialMetricsFormHTML() : '';
  form.innerHTML=socialTop+filtros+`<div class="sdr-list">${rows}</div>`;
  const sm=$('#smSave'); if(sm) sm.onclick=saveSocialMetrics;
  const wlAdd=$('#wlAddLead'); if(wlAdd) wlAdd.onclick=openAddLeadModal;
  form.querySelectorAll('.sdr-fil').forEach(b=>b.onclick=()=>{SDR_FILTRO=b.dataset.fil;renderSDRLancar();});
  form.querySelectorAll('.sdr-chk').forEach(b=>b.onclick=()=>toggleSdrCheck(b.dataset.id,b.dataset.f));
  form.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>salvarAgendamento(b.dataset.save));
  form.querySelectorAll('[data-nshow]').forEach(b=>b.onclick=()=>marcarNoShow(b.dataset.nshow));
  form.querySelectorAll('[data-remark]').forEach(b=>b.onclick=()=>abrirReagendamento(b.dataset.remark));
  form.querySelectorAll('.sdr-open').forEach(b=>b.onclick=()=>openEsteiraLeadModal(b.dataset.open));
  const busca=$('#sdrBusca');
  if(busca){ busca.oninput=()=>{ SDR_Q=busca.value; filtrarSdrCards(); }; if(SDR_Q) filtrarSdrCards(); }
}
function filtrarSdrCards(){
  const q=SDR_Q.trim().toLowerCase(); let n=0;
  $$('.sdr-list .sdr-card').forEach(c=>{ const hit=!q||(c.dataset.nome||'').includes(q); c.style.display=hit?'':'none'; if(hit)n++; });
  const cnt=$('#sdrCount'); if(cnt) cnt.textContent=`${n} leads`;
}
function sdrChecksHTML(l){ return SDR_CHECKS.map(c=>{ const on=chkLigado(l,c.f);
  return `<button type="button" class="sdr-chk ${on?'on is-checked':''}${c.bad?' chk-bad':''}" data-id="${l.id}" data-f="${c.f}" aria-pressed="${on}"><span class="check-box" aria-hidden="true">${on?'✓':''}</span><span>${c.label}</span></button>`;}).join('')
  + (desqualificado(l)&&l.motivo?`<span class="desq-tag" title="Motivo da desqualificação">${motivoLabel(l.motivo)}</span>`:''); }
function sdrAgendHTML(l){ return l.agendou ? `<div class="sdr-agend">
      <div class="sdr-agend-row">
        <label>Closer<select data-ag="closer_id">${closerOptions(l.closer_id)}</select></label>
        <label>Data<input type="date" data-ag="agendado_em" value="${l.agendado_em||TODAY}"></label>
        <label>Horário<input type="time" data-ag="agendado_hora" value="${l.agendado_hora||''}"></label>
      </div>
      <label class="full">Mapeamento (cole aqui)<textarea data-ag="mapeamento" rows="4" placeholder="Perfil, capital, terreno, quando pretende, travamento, observações...">${l.mapeamento||''}</textarea></label>
      <button type="button" class="btn-primary" data-save="${l.id}">Salvar agendamento</button>
      <button type="button" class="btn-mini bad" data-nshow="${l.id}">No-show</button>
      <button type="button" class="btn-mini" data-remark="${l.id}">Remarcar</button>
      <span class="sdr-ag-msg" id="agmsg-${l.id}"></span>
    </div>` : ''; }
function sdrLeadCard(l){
  const orig=l.funil||(l.campanha||'').replace(/\[[^\]]*\]/g,'').trim()||'—';
  const dc=diaBR(l.data_chegada);
  return `<div class="sdr-card" data-lead="${l.id}" data-nome="${(l.nome||'').toLowerCase()}">
    <div class="sdr-card-head">
      <div><b class="sdr-open" data-open="${l.id}">${l.nome||'(sem nome)'}</b> ${l.icp?`<span class="badge ${l.icp==='A'||l.icp==='B'?'ok':'none'}">ICP ${l.icp}</span>`:(l.qualificado?'<span class="badge ok">ICP</span>':'')}${l.antigo?' <span class="badge antigo">antigo</span>':''}${leadFlagsHtml(l)}</div>
      <span class="muted sm">${orig}${dc?` · ${fmtDate(dc)}`:''}</span>
    </div>
    ${l.telefone?`<div class="muted sm">${waTelHtml(l.telefone)}</div>`:''}
    <div class="sdr-checks">${sdrChecksHTML(l)}</div>
    ${sdrAgendHTML(l)}
  </div>`;
}
// ===== Cadastro manual de lead (pescado fora dos funis: Instagram, indicação...) =====
const LEAD_ORIGENS=['Instagram','Tráfego','Indicação','Evento','Outro'];
function openAddLeadModal(){
  const me=curUser(); if(!me) return;
  const donos=getUsers().filter(u=>isFieldRole(u.role));
  const donoOpts=donos.map(u=>`<option value="${u.id}"${String(u.id)===String(me.id)?' selected':''}>${u.nome}</option>`).join('');
  const m=$('#leadModal'); if(!m) return;
  m.innerHTML=`<div class="modal-card">
    <button class="modal-x" id="mClose">×</button>
    <h2>Cadastrar lead</h2>
    <p class="muted sm" style="margin:0 0 12px">Lead pescado fora dos funis. Ele entra na esteira do SDR dono como lead novo.</p>
    <form id="addLeadForm" class="entry-form" style="margin:0">
      <label class="full">Nome<input name="nome" autocomplete="off" required></label>
      <label>WhatsApp / telefone<input type="tel" name="telefone" placeholder="(DDD) 99999-9999"></label>
      <label>E-mail<input type="email" name="email" placeholder="opcional"></label>
      <label>Origem<select name="origem">${LEAD_ORIGENS.map(o=>`<option>${o}</option>`).join('')}</select></label>
      <label>SDR dono<select name="sdr_id">${donoOpts}</select></label>
      <label class="full">Observação (opcional)<textarea name="obs" rows="2" placeholder="Contexto do lead, de onde veio, o que já conversou..."></textarea></label>
      <button class="btn-primary full" type="submit">Cadastrar lead</button>
      <p class="entry-msg" id="addLeadMsg"></p>
    </form>
  </div>`;
  m.hidden=false;
  $('#mClose').onclick=closeModal;
  m.onclick=e=>{if(e.target===m)closeModal();};
  $('#addLeadForm').onsubmit=addLeadManual;
}
async function addLeadManual(ev){
  ev.preventDefault();
  const me=curUser();
  const fd=new FormData(ev.target);
  const nome=(fd.get('nome')||'').trim(); if(!nome) return;
  const msg=$('#addLeadMsg'); if(msg){msg.style.color='var(--ink2)';msg.textContent='Salvando...';}
  const tel=(fd.get('telefone')||'').trim(), dig=tel.replace(/\D/g,'');
  const slug=nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  const origem=fd.get('origem')||'Outro';
  const rec={
    lead_key:'manual:'+(dig||slug+'-'+Date.now()),
    nome, telefone:tel||null, email:(fd.get('email')||'').trim()||null,
    funil:'Manual · '+origem, campanha:'Manual · '+origem,
    sdr_id:fd.get('sdr_id')||(me?me.id:null),
    data_chegada:new Date().toISOString(),
    qualificado:false, antigo:false, sdr_status:'novo',
  };
  const obs=(fd.get('obs')||'').trim(); if(obs) rec.mapeamento=obs;
  try{
    const {error}=await sb.from('dc_leads').insert(rec);
    if(error){
      if(String(error.code)==='23505'||/duplicate|unique/i.test(error.message||'')){
        if(msg){msg.style.color='var(--bad)';msg.textContent='Esse telefone já está cadastrado na esteira.';}
        return;
      }
      throw error;
    }
    await loadEsteira(); closeModal(); refreshLeadViews();
  }catch(e2){ if(msg){msg.style.color='var(--bad)';msg.textContent='Erro: '+(e2.message||e2);} }
}
let MODAL_LEAD=null;
function refreshLeadViews(){
  renderGeral(); renderJornada();
  const lanc=$('#tab-lancar');
  if(lanc && !lanc.hidden){ const r=curUser()?.role;
    if(isFieldRole(r)) renderSDRLancar();
    else if(r==='closer') renderCloserLancar(); }
  if(MODAL_LEAD!=null){ const m=$('#leadModal'); if(m && !m.hidden) openEsteiraLeadModal(MODAL_LEAD); }
}
async function toggleSdrCheck(id,f){
  const l=(ESTEIRA||[]).find(x=>String(x.id)===String(id)); if(!l) return;
  // Marcar "Agendou" abre o pop-up obrigatório (closer + data + hora + mapeamento)
  if(f==='agendou' && !l.agendou){ abrirAgendamento(id); return; }
  // Desqualificar abre o pop-up do motivo; desmarcar devolve o lead pro fluxo
  if(f==='desqualificado'){ if(desqualificado(l)) requalificar(id); else abrirDesqualificacao(id); return; }
  const patch={}; patch[f]=!l[f];
  // sair da desqualificação ao mexer em qualquer etapa do fluxo
  if(desqualificado(l)){ patch.sdr_status=null; patch.motivo=null; }
  // encadeamento lógico: marcar etapa avançada acende as anteriores
  if(patch[f]===true){
    if(f==='respondeu') patch.atendeu=true;
    if(f==='compareceu'){ patch.atendeu=true; patch.respondeu=true; patch.agendou=true; }
    if(f==='follow_up') patch.atendeu=true;
  }
  const ok=await saveLead(id,patch);
  if(ok) refreshLeadViews();
}
// Closers cadastrados, pro SDR escolher pra quem vai a reunião
function closerOptions(sel){
  const cs=getUsers().filter(u=>u.role==='closer');
  return '<option value="">Escolher closer...</option>'+
    cs.map(u=>`<option value="${u.id}"${String(sel||'')===String(u.id)?' selected':''}>${u.nome}</option>`).join('');
}
// Pop-up obrigatório ao agendar (closer, data, horário, mapeamento) — o lead só sai de "A trabalhar" depois disso
function abrirAgendamento(id){
  const l=(ESTEIRA||[]).find(x=>String(x.id)===String(id)); if(!l) return;
  abrirPrompt({
    titulo:'Agendar reunião', sub:'Escolha o closer, o dia, o horário e cole o mapeamento. Tudo é obrigatório.',
    campos:[
      {key:'closer_id', type:'select', label:'Closer da reunião', options:closerOptions(l.closer_id), required:true},
      {key:'agendado_em', type:'date', label:'Dia da reunião', value:l.agendado_em||TODAY, required:true},
      {key:'agendado_hora', type:'time', label:'Horário', value:l.agendado_hora||'', required:true},
      {key:'mapeamento', type:'textarea', label:'Mapeamento do lead', value:l.mapeamento||'', required:true, ph:'Perfil, capital, terreno, quando pretende, travamento, observações...'},
    ],
    onSalvar: async(data)=>{
      const ok=await saveLead(id,{agendou:true, atendeu:true, respondeu:true, closer_id:data.closer_id||null,
        agendado_em:data.agendado_em, agendado_hora:data.agendado_hora, mapeamento:data.mapeamento,
        sdr_status:'agendado', closer_status:'agendado'});
      if(ok) refreshLeadViews();
    }
  });
}
// Pop-up obrigatório ao desqualificar: sem motivo o lead não sai do fluxo
function abrirDesqualificacao(id){
  const l=(ESTEIRA||[]).find(x=>String(x.id)===String(id)); if(!l) return;
  abrirPrompt({
    titulo:'Desqualificar lead', sub:`${l.nome||'Esse lead'} sai do fluxo. Diga o motivo — é obrigatório.`,
    campos:[
      {key:'motivo', type:'select', label:'Motivo da desqualificação', required:true,
       options:'<option value="">Escolher motivo...</option>'+
         MOTIVOS_DESQ.map(m=>`<option value="${m[0]}"${l.motivo===m[0]?' selected':''}>${m[1]}</option>`).join('')},
      {key:'map_obs', type:'textarea', label:'Detalhe (opcional)', value:'', ph:'O que aconteceu, se quiser registrar.'},
    ],
    onSalvar: async(data)=>{
      const patch={sdr_status:'desqualificado', motivo:data.motivo, agendou:false, compareceu:false};
      if(String(data.map_obs||'').trim()) patch.map_obs=data.map_obs;
      const ok=await saveLead(id,patch);
      if(ok) refreshLeadViews();
    }
  });
}
// Tira o lead da desqualificação e devolve pro fluxo
async function requalificar(id){
  const ok=await saveLead(id,{sdr_status:null, motivo:null});
  if(ok) refreshLeadViews();
}
async function salvarAgendamento(id){
  const modal=$('#leadModal'); const scope=(modal&&!modal.hidden)?modal:document;
  const card=scope.querySelector(`.sdr-card[data-lead="${id}"]`)||document.querySelector(`.sdr-card[data-lead="${id}"]`); if(!card) return;
  const g=s=>card.querySelector(`[data-ag="${s}"]`)?.value||'';
  const patch={ agendado_em:g('agendado_em')||TODAY, agendado_hora:g('agendado_hora'), mapeamento:g('mapeamento'), agendou:true, atendeu:true, respondeu:true, closer_id:g('closer_id')||null };
  // Trocou data/hora de uma call que já existia: conta como remarcação
  const l=(ESTEIRA||[]).find(x=>String(x.id)===String(id));
  if(l&&l.agendado_em&&(String(l.agendado_em).slice(0,10)!==patch.agendado_em||String(l.agendado_hora||'')!==String(patch.agendado_hora||''))) patch.remarcado=true;
  const m=card.querySelector('.sdr-ag-msg'); if(m){m.style.color='var(--ink2)';m.textContent='Salvando...';}
  const ok=await saveLead(id,patch);
  if(ok){ if(m){ m.style.color='var(--ok)'; m.textContent='✓ agendamento salvo'; } setTimeout(()=>refreshLeadViews(),700); }
}
// Modal de detalhe do lead (esteira) — abre ao clicar no nome na Jornada ou na worklist
function openEsteiraLeadModal(id){
  const l=(ESTEIRA||[]).find(x=>String(x.id)===String(id)); if(!l) return;
  const m=$('#leadModal'); if(!m) return; MODAL_LEAD=l.id;
  const me=curUser();
  const isCloser = me.role==='closer' || (me.role==='gestor' && JVIEW==='closer');
  const orig=l.funil||(l.campanha||'').replace(/\[[^\]]*\]/g,'').trim()||'—';
  const sdrName=(getUsers().find(u=>u.id===l.sdr_id)||{}).nome||'—';
  const stageDef=isCloser
    ? CLOSER_ETAPAS.find(e=>e.k===closerEtapa(l))
    : SDR_ETAPAS.find(e=>e.k===sdrEtapa(l));
  const etapa=stageDef?.label||'—';
  const controls = isCloser
    ? `<div class="ml-move"><span class="ml-lbl">Atualizar call</span>
        <div class="sdr-card" data-clead="${l.id}">${closerControlsInner(l)}</div></div>`
    : `<div class="ml-move"><span class="ml-lbl">Mover na jornada</span>
        <div class="stage-row journey-stepper" role="group" aria-label="Etapa do lead">${SDR_ETAPAS.map(E=>`<button type="button" class="stage-pill${sdrEtapa(l)===E.k?' on':''}" data-mv="${E.k}" style="--sc:${E.color}" aria-pressed="${sdrEtapa(l)===E.k}">${E.label}</button>`).join('')}</div></div>
      <div class="ml-move"><span class="ml-lbl">Marcar o que já fez</span>
        <div class="sdr-card" data-lead="${l.id}"><div class="sdr-checks">${sdrChecksHTML(l)}</div>${sdrAgendHTML(l)}</div></div>`;
  m.innerHTML=`<div class="modal-card lead-detail" role="dialog" aria-modal="true" aria-labelledby="leadTitle-${l.id}">
    <button type="button" class="modal-x" id="mClose" aria-label="Fechar modal">×</button>
    <header class="lead-modal-head">${avatarHtml(l.nome,l.foto_url||l.avatar_url,'avt-lg')}<div><span class="lead-modal-kicker">Etapa atual</span><h2 id="leadTitle-${l.id}">${escHtml(l.nome||'(sem nome)')}</h2><div class="lead-stage-line"><span class="lead-stage-chip" style="--sc:${stageDef?.color||'var(--gold-2)'}">${etapa}</span>${leadFlagsHtml(l)}</div></div></header>
    <div class="ml-grid">
      <div class="ml-item"><span class="ml-chip-label">Origem</span><strong>${escHtml(orig)}</strong></div>
      <div class="ml-item"><span class="ml-chip-label">ICP</span><strong>${l.icp?('ICP '+escHtml(l.icp)):(l.qualificado?'Qualificado':'—')}</strong></div>
      <div class="ml-item ml-item-action"><span class="ml-chip-label">WhatsApp</span><strong>${l.telefone?waTelHtml(l.telefone):'—'}</strong></div>
      <div class="ml-item"><span class="ml-chip-label">E-mail</span><strong>${escHtml(l.email||'—')}</strong></div>
      ${l.agendado_em?`<div class="ml-item"><span class="ml-chip-label">Call marcada</span><strong>${fmtDate(l.agendado_em)}${l.agendado_hora?` · ${l.agendado_hora}`:''}</strong></div>`:''}
      ${me.role==='gestor'?`<div class="ml-item"><span class="ml-chip-label">SDR</span><strong>${escHtml(sdrName)}</strong></div>`:''}
    </div>
    ${controls}
  </div>`;
  m.hidden=false;
  const close=()=>{ MODAL_LEAD=null; closeModal(); };
  $('#mClose').onclick=close; m.onclick=e=>{ if(e.target===m) close(); };
  if(isCloser){ wireCloserControls(m); }
  else{
    m.querySelectorAll('[data-mv]').forEach(b=>b.onclick=()=>moverLeadSDR(l.id,b.dataset.mv));
    m.querySelectorAll('.sdr-chk').forEach(b=>b.onclick=()=>toggleSdrCheck(b.dataset.id,b.dataset.f));
    m.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>salvarAgendamento(b.dataset.save));
    m.querySelectorAll('[data-nshow]').forEach(b=>b.onclick=()=>marcarNoShow(b.dataset.nshow));
    m.querySelectorAll('[data-remark]').forEach(b=>b.onclick=()=>abrirReagendamento(b.dataset.remark));
  }
}

// ---------- CALENDAR ----------
let calMonth;
let selectedCalDay='';
function calendarScopeLeads(me){
  const scheduled=(ESTEIRA||[]).filter(l=>l.agendou&&l.agendado_em);
  if(me.role==='gestor') return scheduled;
  if(me.role==='closer') return scheduled.filter(l=>l.closer_id==null||String(l.closer_id)===String(me.id));
  return scheduled.filter(l=>String(l.sdr_id)===String(me.id));
}
function calendarLeadState(l){
  if(l.compareceu===true) return {cls:'is-done',label:'Concluída'};
  if(l.compareceu_confirmado===true&&l.compareceu!==true) return {cls:'is-missing',label:'No-show'};
  if(l.agendou) return {cls:'is-scheduled',label:'Agendada'};
  return {cls:'is-pending',label:'Pendente'};
}
function calendarOwner(l){
  const id=l.closer_id||l.sdr_id;
  return getUsers().find(u=>String(u.id)===String(id))||{nome:'Sem responsável'};
}
function renderCalendar(){
  const grid=$('#calGrid');grid.innerHTML='';
  const[y,m]=calMonth.split('-').map(Number);
  $('#calLabel').textContent=new Date(y,m-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const mp=$('#calMonthPick'); if(mp) mp.value=calMonth;
  grid.setAttribute('role','grid'); grid.setAttribute('aria-label',`Calendário de ${$('#calLabel').textContent}`);
  ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].forEach(d=>{const head=el('div','cal-cell head',d);head.setAttribute('role','columnheader');grid.appendChild(head);});
  const first=new Date(y,m-1,1).getDay();
  const prevDays=new Date(y,m-1,0).getDate();
  for(let i=0;i<first;i++){
    const outside=el('div','cal-cell outside-month',`<div class="cd">${prevDays-first+i+1}</div>`);
    outside.setAttribute('role','gridcell'); outside.setAttribute('aria-hidden','true'); grid.appendChild(outside);
  }
  const days=new Date(y,m,0).getDate();
  const me=curUser();const isMgr=me.role==='gestor';
  const teamUsers=getUsers().filter(u=>ENTRY_ROLES.includes(u.role));
  const scheduled=calendarScopeLeads(me);
  const lg=$('#calLegend');
  lg.innerHTML=`<span class="legend-title">Agenda</span><span class="legend-item"><i class="legend-swatch is-scheduled"></i> agendada</span><span class="legend-item"><i class="legend-swatch is-done"></i> concluída</span><span class="legend-item"><i class="legend-swatch is-missing"></i> no-show</span><span class="legend-note">${isMgr?'Avatares no rodapé mostram os lançamentos do time.':'Seu avatar no rodapé mostra o lançamento do dia.'}</span>`;
  const START='2026-07-06';   // kick-off da operação (segunda). Antes disso o calendário fica apagado.
  for(let d=1;d<=days;d++){
    const ds=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const tr=TRAFFIC.daily.find(x=>x.date===ds);
    const entries=getEntries().filter(e=>e.date===ds);
    const dow=new Date(ds+'T00:00:00').getDay();   // fim de semana é opcional: pode preencher, mas não conta como falta
    const countable=(ds>=START && ds<=TODAY && dow!==0 && dow!==6);
    const cell=el('div','cal-cell'+(ds===TODAY?' today':'')+(ds===selectedCalDay?' is-selected':''));
    let dots='',miss=false;
    if(isMgr){
      for(const u of teamUsers){const has=entries.some(e=>e.userId===u.id);const st=has?'done':(countable?'miss':'pending');if(!has&&countable)miss=true;
        const status=has?'lançou ✓':(countable?'faltou ✗':'ainda não');
        dots+=calendarAvatarHtml(u.nome,u.foto_url||u.avatar_url,'avt-sm',`fill-${st}`,`${u.nome} (${ROLES[u.role].label}) — ${status}`);}
    } else {
      const has=entries.some(e=>e.userId===me.id),st=has?'done':(countable?'miss':'pending');miss=!has&&countable;
      dots=calendarAvatarHtml(me.nome,me.foto_url||me.avatar_url,'avt-sm',`fill-${st}`,`${me.nome} — ${has?'lançou ✓':(countable?'faltou ✗':'ainda não')}`);
    }
    if(miss)cell.classList.add('cell-miss');
    const calls=scheduled.filter(l=>String(l.agendado_em||'').slice(0,10)===ds).sort((a,b)=>String(a.agendado_hora||'').localeCompare(String(b.agendado_hora||'')));
    const events=calls.slice(0,2).map(l=>{const st=calendarLeadState(l),owner=calendarOwner(l),firstName=String(owner.nome||'Sem responsável').split(/\s+/)[0];const title=`${owner.nome} · ${l.nome||'(sem nome)'}`;return `<div class="cal-event ${st.cls}" title="${escHtml(title)}" aria-label="${escHtml(`${l.agendado_hora||'Sem horário'} · ${title} · ${st.label}`)}"><span class="cal-event-mark" aria-hidden="true"></span><span class="cal-event-time">${escHtml(l.agendado_hora||'—')}</span>${calendarAvatarHtml(owner.nome,owner.foto_url||owner.avatar_url,'avt-xs')}<span class="cal-event-label">${escHtml(firstName)}</span></div>`;}).join('');
    const hiddenCount=Math.max(0,calls.length-2);
    const more=hiddenCount?`<span class="cal-more">+ ${hiddenCount} evento${hiddenCount>1?'s':''}</span>`:'';
    cell.innerHTML=`<div class="cd">${d}</div>${tr?`<div class="cl">${intf(tr.leads)} leads</div>`:''}<div class="cal-events" aria-label="Eventos de ${fmtDate(ds)}">${events}${more}</div><div class="dots">${dots}</div>`;
    cell.dataset.date=ds; cell.tabIndex=0; cell.setAttribute('role','gridcell'); cell.setAttribute('aria-label',`${fmtDate(ds)}: ${intf(calls.length)} reunião${calls.length===1?'':'ões'}${tr?`, ${intf(tr.leads)} leads`:''}`); if(ds===selectedCalDay)cell.setAttribute('aria-selected','true');
    const openDay=e=>{if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;if(e.type==='keydown')e.preventDefault();showDay(ds);};
    cell.onclick=openDay; cell.onkeydown=openDay;
    grid.appendChild(cell);
  }
  const trailing=42-first-days;
  for(let d=1;d<=trailing;d++){
    const outside=el('div','cal-cell outside-month',`<div class="cd">${d}</div>`);
    outside.setAttribute('role','gridcell'); outside.setAttribute('aria-hidden','true'); grid.appendChild(outside);
  }
}
function showDay(ds){
  selectedCalDay=ds;
  document.querySelectorAll('#calGrid .cal-cell[data-date]').forEach(cell=>{const on=cell.dataset.date===ds;cell.classList.toggle('is-selected',on);if(on)cell.setAttribute('aria-selected','true');else cell.removeAttribute('aria-selected');});
  const box=$('#dayDetail'),me=curUser(),all=calendarScopeLeads(me);
  const calls=all.filter(l=>String(l.agendado_em||'').slice(0,10)===ds).sort((a,b)=>String(a.agendado_hora||'').localeCompare(String(b.agendado_hora||'')));
  const agendaRows=calls.length?calls.map(l=>{const st=calendarLeadState(l),owner=calendarOwner(l),orig=l.funil||(l.campanha||'').replace(/\[[^\]]*\]/g,'').trim()||'—';return `<article class="agenda-item ${st.cls}" data-lead="${l.id}" role="button" tabindex="0" aria-label="Abrir ${escHtml(l.nome||'lead')}"><span class="agenda-hour">${escHtml(l.agendado_hora||'—')}</span><div class="agenda-body"><div class="agenda-person">${calendarAvatarHtml(owner.nome,owner.foto_url||owner.avatar_url,'avt-sm')}<span>${escHtml(owner.nome)}</span></div><span class="agenda-lead">${escHtml(l.nome||'(sem nome)')} · ${escHtml(orig)}</span><span class="agenda-status">${st.label}</span></div></article>`;}).join(''):'<p class="context-empty">Nenhuma reunião neste dia. Selecione outra data para consultar a agenda.</p>';
  const date=new Date(ds+'T00:00:00'),weekStart=addDays(ds,-date.getDay()),weekEnd=addDays(weekStart,6),weekSet=new Set(datesBetween(weekStart,weekEnd));
  const weekMeetings=all.filter(l=>weekSet.has(String(l.agendado_em||'').slice(0,10))),weekDone=weekMeetings.filter(l=>l.compareceu===true).length;
  const weekLeads=TRAFFIC.daily.filter(d=>weekSet.has(d.date)).reduce((sum,d)=>sum+(Number(d.leads)||0),0),attendance=weekMeetings.length?100*weekDone/weekMeetings.length:0;
  const weekStartDate=new Date(weekStart+'T00:00:00'),weekEndDate=new Date(weekEnd+'T00:00:00');
  const weekLabel=weekStartDate.getMonth()===weekEndDate.getMonth()?`${weekStartDate.getDate()}–${weekEndDate.getDate()} de ${weekEndDate.toLocaleDateString('pt-BR',{month:'long'})}`:`${fmtDate(weekStart)}–${fmtDate(weekEnd)}`;
  const fullDate=date.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'}).replace(/^./,c=>c.toUpperCase());
  const metric=(cls,label,value,progress,max=100)=>`<div class="week-metric ${cls}"><div class="week-metric-head"><span class="week-metric-label">${label}</span><span class="week-metric-value">${value}</span></div><div class="week-track" role="progressbar" aria-valuenow="${Math.round(progress)}" aria-valuemin="0" aria-valuemax="${max}"><span style="--metric-value:${Math.max(0,Math.min(100,progress))}%"></span></div></div>`;
  box.innerHTML=`<div class="context-head"><div><span class="context-kicker">Dia selecionado</span><h2>${fullDate}</h2></div><span class="context-count" aria-label="${calls.length} reuniões">${calls.length}</span></div><div class="context-agenda" aria-label="Agenda do dia selecionado">${agendaRows}</div><section class="week-summary" aria-labelledby="weekSummaryTitle"><span class="week-kicker">${weekLabel}</span><h3 id="weekSummaryTitle">Resumo da semana</h3><div class="week-metrics">${metric('is-meetings','Reuniões',intf(weekMeetings.length),weekMeetings.length?100:0)}${metric('is-attendance','Comparecimento',pct(attendance),attendance)}${metric('is-leads','Leads',intf(weekLeads),weekLeads?100:0)}</div></section>`;
  box.hidden=false;
  box.querySelectorAll('.agenda-item[data-lead]').forEach(row=>{const open=e=>{if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;if(e.type==='keydown')e.preventDefault();openEsteiraLeadModal(row.dataset.lead);};row.onclick=open;row.onkeydown=open;});
}

// ---------- EQUIPE & METAS ----------
function renderEquipe(){
  const t=$('#teamTbl');const users=getUsers();
  t.innerHTML='<tr><th>Nome</th><th>Login</th><th>Função</th></tr>'+
    (users.length?users.map(u=>`<tr><td>${avatarHtml(u.nome,u.foto_url||u.avatar_url,'tm-ava avt-lg')}${u.nome}</td><td>${u.login}</td><td><span class="tag ${u.role}">${ROLES[u.role].label}</span></td></tr>`).join(''):'<tr><td colspan=3 class="muted">Ninguém cadastrado ainda.</td></tr>');
  const isMgr=curUser().role==='gestor';
  const mt=$('#metaTbl');const M=getMetas();
  mt.innerHTML='<tr><th>Métrica</th><th>Direção</th><th>Meta</th></tr>'+
    Object.entries(M).map(([k,m])=>`<tr><td class="meta-name">${m.label}</td><td><span class="dir-pill ${m.dir}">${m.dir==='up'?'≥ maior melhor':'≤ menor melhor'}</span></td>
      <td>${isMgr?`<span class="meta-field"><input type="number" data-meta="${k}" value="${m.target}"><em>${m.unit}</em></span>`:`<b>${m.unit==='R$'?money(m.target):m.target+m.unit}</b>`}</td></tr>`).join('');
  if(isMgr) mt.querySelectorAll('input[data-meta]').forEach(inp=>inp.onchange=()=>saveMeta(inp.dataset.meta,Number(inp.value)));
  const hint=$('#metaHint'); if(hint) hint.textContent=isMgr?'Você ajusta as metas. Valem pra todo o time.':'Somente o gestor pode alterar as metas. Aqui você acompanha os alvos.';
}
async function saveMeta(chave,target){
  try{ const {error}=await sb.from('dc_metas').upsert({chave,target,updated_at:new Date().toISOString()},{onConflict:'chave'}); if(error)throw error;
    await loadMetas(); renderDashboard(); }
  catch(e){ alert('Erro ao salvar meta: '+(e.message||e)); }
}

// ---------- CRM / JORNADA (closer cria e move os cards em Lançar dados) ----------
const TEMP_LABEL={quente:'Quente',morno:'Morno',frio:'Frio'};
function pipeKpiHtml(P){
  return `<div class="kpi-grid" style="margin-bottom:16px">
    <div class="kpi none"><div class="k-label">Em jornada</div><div class="k-val">${intf(P.abertos)}</div><div class="k-meta">${money(P.naMesa)} na mesa</div></div>
    <div class="kpi none kpi-cash"><div class="k-label">Coletado</div><div class="k-val">${money(P.coletado)}</div><div class="k-meta">${intf(P.fechados)} fechados · ${money(P.contratado)} contratado</div></div>
    <div class="kpi ${statusCls(P.conv,'close_rate')}"><div class="k-label">% Conversão</div><div class="k-val">${pct(P.conv)}</div><div class="k-meta">fechados ÷ total</div></div>
  </div>`;
}
function pipeCardHtml(c,{manage=false}={}){
  const et=c.etapa||'1a_call'; const E=ETAPA_MAP[et]||{label:et};
  const prod=c.produto?`<span class="prod-pill">${produtoLabel(c.produto)}</span>`:'';
  const valLine = et==='fechado'
    ? `<div class="pipe-mid">Contrato: <b>${money(c.valor_contrato)}</b> · Coletado: <b class="cash">${money(c.valor_coletado)}</b></div>`
    : `<div class="pipe-mid">Proposto: <b>${money(c.valor_apresentado)}</b></div>`;
  let controls='';
  if(manage){
    const pills=ETAPAS.map(s=>`<button class="stage-pill${s.k===et?' on':''}" data-id="${c.id}" data-stage="${s.k}" style="--sc:${s.color}">${s.label}</button>`).join('');
    controls=`<div class="stage-row">${pills}</div><div class="pipe-actions"><button data-act="excluir" data-id="${c.id}" class="btn-mini">🗑 Excluir</button></div>`;
  }
  return `<div class="pipe-card st-${et}" data-pipe="${c.id}">
    <div class="pipe-top"><b>${c.lead_nome}</b> <span class="temp ${c.temperatura||'morno'}">${TEMP_LABEL[c.temperatura]||''}</span></div>
    <div class="pipe-prod">${prod}<span class="pipe-status et-${et}">${E.label}</span></div>
    ${c.telefone?`<div class="pipe-mid">${waTelHtml(c.telefone)}</div>`:''}
    ${valLine}
    ${controls}</div>`;
}
// Painel de deals do closer no "Lançar dados": lista os deals do dc_pipeline do usuário
// logado; clicar no card abre o modal de edição (openLeadModal).
function renderCloserDeals(){
  const box=$('#closerDeals'); if(!box) return;
  const wrap=$('#lancarWrap');
  const me=curUser();
  if(!me||me.role!=='closer'){ box.hidden=true; if(wrap)wrap.classList.remove('two'); return; }
  box.hidden=false; if(wrap)wrap.classList.add('two');
  const cards=myPipeCards();
  const abertos=pipeAbertos(cards);
  const naMesa=abertos.reduce((s,c)=>s+(Number(c.valor_apresentado)||0),0);
  const listHtml=cards.length?cards.map(c=>pipeCardHtml(c)).join(''):'<p class="muted" style="margin-top:10px">Nenhum deal ainda. Crie o primeiro no botão acima.</p>';
  box.innerHTML=`
    <h2>Meus deals · jornada do cliente</h2>
    <div class="sdr-filtros" style="margin:10px 0 0">
      <button type="button" class="btn-mini ok" id="dealAddBtn">+ Novo deal</button>
      <span class="muted sm">${intf(abertos.length)} em aberto · ${money(naMesa)} na mesa · clique no card pra editar</span>
    </div>
    <div class="pipe-list">${listHtml}</div>`;
  const add=$('#dealAddBtn'); if(add) add.onclick=openAddModal;
  box.querySelectorAll('.pipe-card[data-pipe]').forEach(el2=>el2.onclick=()=>openLeadModal(el2.dataset.pipe));
}
function refreshPipelineViews(){ renderCloserDeals(); renderJornada(); renderGeral(); }
async function pipeAdd(ev){
  ev.preventDefault();const me=curUser();const fd=new FormData(ev.target);
  const rec={closer_id:me.id,lead_nome:(fd.get('lead_nome')||'').trim(),produto:fd.get('produto')||null,temperatura:fd.get('temperatura'),telefone:(fd.get('telefone')||'').trim()||null,valor_apresentado:Number(fd.get('valor_apresentado')||0),etapa:'1a_call'};
  if(!rec.lead_nome)return;
  const msg=$('#pipeMsg');if(msg){msg.style.color='var(--ink2)';msg.textContent='Salvando...';}
  try{ const {error}=await sb.from('dc_pipeline').insert(rec); if(error)throw error;
    await loadPipeline(); refreshPipelineViews(); }
  catch(e){ if(msg){msg.style.color='var(--bad)';msg.textContent='Erro: '+(e.message||e);} }
}
async function pipeSetEtapa(id,etapa){
  const patch={etapa,updated_at:new Date().toISOString()};
  if(etapa!=='fechado') patch.fechado_em=null;
  try{ const {error}=await sb.from('dc_pipeline').update(patch).eq('id',id); if(error)throw error;
    await loadPipeline(); refreshPipelineViews(); }
  catch(e){ alert('Erro: '+(e.message||e)); }
}
async function pipeFechar(id){
  const contrato=prompt('Valor do CONTRATO fechado (R$)?'); if(contrato===null)return;
  const coletado=prompt('Valor COLETADO agora — a entrada que entrou no caixa (R$)?\nO resto parcelado você atualiza depois.'); if(coletado===null)return;
  try{ const {error}=await sb.from('dc_pipeline').update({etapa:'fechado',valor_contrato:Number(contrato)||0,valor_coletado:Number(coletado)||0,fechado_em:TODAY,updated_at:new Date().toISOString()}).eq('id',id); if(error)throw error;
    await loadPipeline(); refreshPipelineViews(); }
  catch(e){ alert('Erro: '+(e.message||e)); }
}
async function pipeExcluir(id){
  if(!confirm('Excluir este cliente do CRM?'))return;
  try{ const {error}=await sb.from('dc_pipeline').delete().eq('id',id); if(error)throw error;
    await loadPipeline(); refreshPipelineViews(); }
  catch(e){ alert('Erro: '+(e.message||e)); }
}

// ---------- AUTH / NAV ----------
function showApp(){
  $('#loginScreen').hidden=true;$('#app').hidden=false;
  const u=curUser();$('#whoami').textContent=`${u.nome} · ${ROLES[u.role].label}`;
  // Restaura as áreas de gestão antes de aplicar as restrições específicas de cada papel.
  const calTab=document.querySelector('.tab[data-tab="calendario"]');
  const equipeTab=document.querySelector('.tab[data-tab="equipe"]');
  const funilSub=document.querySelector('.subtab[data-sub="funil"]');
  const jornadaSub=document.querySelector('.subtab[data-sub="jornada"]');
  if(calTab) calTab.style.removeProperty('display');
  if(equipeTab) equipeTab.style.removeProperty('display');
  if(funilSub) funilSub.style.removeProperty('display');
  if(jornadaSub) jornadaSub.style.removeProperty('display');
  $('#entryDate').value=TODAY;calMonth=TODAY.slice(0,7);
  RANGE=presetRange('7');$('#periodFrom').value=RANGE.start;$('#periodTo').value=RANGE.end;
  // Gestor só visualiza: o gasto de tráfego entra automático, ele não lança nada.
  if(u.role==='gestor'){
    const lt=document.querySelector('.tab[data-tab="lancar"]'); if(lt) lt.style.display='none';
    const lp=$('#tab-lancar'); if(lp) lp.hidden=true;
  }
  // SDR / Social: só enxergam o que é deles. Sem Funil de Venda (V1/V3/campanhas) nem Equipe&Metas.
  if(isFieldRole(u.role)){
    const fsub=document.querySelector('.subtab[data-sub="funil"]'); if(fsub) fsub.style.display='none';
    const et=document.querySelector('.tab[data-tab="equipe"]'); if(et) et.style.display='none';
    const ep=$('#tab-equipe'); if(ep) ep.hidden=true;
    const geralSub=document.querySelector('.subtab[data-sub="geral"]'); if(geralSub) geralSub.textContent='Meu funil';
  }
  // Closer: mantém a aba Funil (mas é o funil comercial dele), sem Equipe&Metas.
  if(u.role==='closer'){
    const et=document.querySelector('.tab[data-tab="equipe"]'); if(et) et.style.display='none';
    const ep=$('#tab-equipe'); if(ep) ep.hidden=true;
    const fsub=document.querySelector('.subtab[data-sub="funil"]'); if(fsub) fsub.textContent='Funil';
    const gsub=document.querySelector('.subtab[data-sub="geral"]'); if(gsub) gsub.textContent='Meus números';
  }
  renderAll();
  if(isFieldRole(u.role)) checarComparecimentos();
}
function renderAll(){renderDashboard();renderEntryForm();renderCloserDeals();renderCalendar();renderEquipe();}
async function logout(){ try{await sb.auth.signOut();}catch(e){} location.reload(); }

function initLogin(){
  $('#loginForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);
    const login=(fd.get('login')||'').trim().toLowerCase(),senha=fd.get('senha');const msg=$('#loginMsg');
    if(!login||!senha){msg.textContent='Preencha login e senha.';return;}
    const btn=$('#loginSubmit');btn.disabled=true;const old=btn.textContent;btn.textContent='...';msg.textContent='';
    try{
      const {error}=await sb.auth.signInWithPassword({email:login+EMAIL_DOMAIN,password:senha});
      if(error){msg.textContent='Login ou senha inválidos.';return;}
      await loadAll();showApp();
    }catch(err){msg.textContent='Erro: '+(err.message||err);}
    finally{btn.disabled=false;btn.textContent=old;}
  };
}
function animateView(node){
  if(!node||window.matchMedia('(prefers-reduced-motion: reduce)').matches||typeof node.animate!=='function')return;
  try{ node.getAnimations().forEach(a=>a.cancel()); }catch(_){ }
  node.animate(
    [{opacity:.35,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}],
    {duration:260,easing:'cubic-bezier(.16,1,.3,1)'}
  );
}
function initNav(){
  $$('.tab').forEach(t=>t.onclick=()=>{$$('.tab').forEach(x=>x.classList.toggle('active',x===t));
    $$('.tabpane').forEach(p=>p.hidden=true);const pane=$('#tab-'+t.dataset.tab);pane.hidden=false;
    if(t.dataset.tab==='calendario') renderCalendar();
    if(t.dataset.tab==='equipe') renderEquipe();
    animateView(pane);});
  $$('.subtab').forEach(t=>t.onclick=()=>{$$('.subtab').forEach(x=>x.classList.toggle('active',x===t));
    $$('.subpane').forEach(p=>p.hidden=true);const pane=$('#sub-'+t.dataset.sub);pane.hidden=false;
    if(t.dataset.sub==='geral') renderGeral();
    if(t.dataset.sub==='funil') renderFunil();
    if(t.dataset.sub==='jornada') renderJornada();
    animateView(pane);});
  $('#periodSel').onclick=e=>{const p=e.target.dataset.p;if(!p)return;RANGE=presetRange(p);
    $$('#periodSel button').forEach(b=>b.classList.toggle('active',b===e.target));
    $('#periodFrom').value=RANGE.start;$('#periodTo').value=RANGE.end;refreshRangeViews();animateView(document.querySelector('.subpane:not([hidden])'));};
  const onRange=()=>{const f=$('#periodFrom').value,t=$('#periodTo').value;if(f&&t&&f<=t){RANGE={start:f,end:t};$$('#periodSel button').forEach(b=>b.classList.remove('active'));refreshRangeViews();animateView(document.querySelector('.subpane:not([hidden])'));}};
  $('#periodFrom').onchange=onRange;$('#periodTo').onchange=onRange;
  $('#entryDate').onchange=renderEntryForm;
  $('#entryForm').onsubmit=saveEntry;
  $('#calPrev').onclick=()=>{calMonth=shiftMonth(calMonth,-1);renderCalendar();};
  $('#calNext').onclick=()=>{calMonth=shiftMonth(calMonth,1);renderCalendar();};
  const mp=$('#calMonthPick');
  if(mp){ mp.onchange=()=>{ if(mp.value){calMonth=mp.value;renderCalendar();} };
    $('#calLabel').onclick=()=>{ try{mp.showPicker();}catch(e){mp.focus();} }; }
  $('#logoutBtn').onclick=logout;
}
function shiftMonth(ym,delta){let[y,m]=ym.split('-').map(Number);m+=delta;if(m<1){m=12;y--}if(m>12){m=1;y++}return `${y}-${String(m).padStart(2,'0')}`;}

// ---------- THEME (light/dark) ----------
function applyTheme(t,save=true){
  document.documentElement.dataset.theme=t;
  if(save) localStorage.setItem('dc_theme',t);
  const next=t==='light'?'escuro':'claro';
  $$('.theme-btn').forEach(b=>{
    b.title=`Ativar modo ${next}`;
    b.setAttribute('aria-label',`Ativar modo ${next}`);
  });
  // re-renderiza gráficos pra pegar as cores do novo tema
  try{ if($('#app')&&!$('#app').hidden){ renderGeral(); if(!isFieldRole(curUser()?.role)) renderFunil(); } }catch(e){}
}
function initTheme(){
  applyTheme(document.documentElement.dataset.theme||'dark',false);
  $$('.theme-btn').forEach(b=>b.onclick=()=>applyTheme(document.documentElement.dataset.theme==='light'?'dark':'light'));
}

// ---------- SIDEBAR (recolher/expandir) ----------
function initSidebar(){
  const app=$('#app'), btn=$('.sb-collapse'); if(!app||!btn) return;
  const set=v=>{
    app.classList.toggle('sb-min',v);
    localStorage.setItem('dc_sbmin',v?'1':'0');
    btn.title=v?'Expandir menu':'Recolher menu';
    btn.setAttribute('aria-label',btn.title);
  };
  btn.onclick=()=>set(!app.classList.contains('sb-min'));
  set(localStorage.getItem('dc_sbmin')==='1');
}

// ---------- BOOT ----------
(async function boot(){
  initLogin();initNav();initTheme();initSidebar();
  try{
    const {data:{session}}=await sb.auth.getSession();
    if(session){ await loadAll(); showApp(); }
  }catch(e){ console.error(e); try{await sb.auth.signOut();}catch(_){} }
})();

// campanhas/funis em tempo real: re-busca a cada 60s quando a tela está visível
setInterval(()=>{ try{
  if($('#app') && !$('#app').hidden && $('#funnelPicker') && typeof renderFunil==='function') renderFunil();
}catch(e){} }, 60_000);
})();

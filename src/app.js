import { DEFAULT_DAY_RATE, DAY_RATES, decodePayload, dedupeShifts, dominantMonth, onlyMonth, parseText, reconcileMonth, splitShift, totals, normalizeShift, shiftKey } from './core.mjs';

const STORAGE_KEY='knok-remuneracao-v2';
const STATE_VERSION=4;
const PAYMENT_STATUSES=['estimated','confirmed','paid'];
const STATUS_LABELS={estimated:'Estimado',confirmed:'Confirmado',paid:'Pago'};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'});
const monthFmt=new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric',timeZone:'UTC'});
const dateFmt=new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
const localMonth=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
const clone=value=>JSON.parse(JSON.stringify(value));
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const numberOrNull=value=>value===''||value==null||!Number.isFinite(Number(value))?null:Math.max(0,Number(value));
const emptyState=()=>({version:STATE_VERSION,currentMonth:localMonth(),months:{},undo:null});

function baseMonth(){return {dayRate:DEFAULT_DAY_RATE,shifts:[],updatedAt:null,source:null,paymentStatus:'estimated',confirmedAmount:null,paidAmount:null,paymentDate:null,paymentNotes:''}}
function sanitizeMonthData(raw){
  const dayRate=Number(raw?.dayRate);
  return {
    ...baseMonth(),
    dayRate:DAY_RATES.includes(dayRate)?dayRate:DEFAULT_DAY_RATE,
    shifts:dedupeShifts(raw?.shifts||[]),
    updatedAt:typeof raw?.updatedAt==='string'?raw.updatedAt:null,
    source:typeof raw?.source==='string'?raw.source.slice(0,120):null,
    paymentStatus:PAYMENT_STATUSES.includes(raw?.paymentStatus)?raw.paymentStatus:'estimated',
    confirmedAmount:numberOrNull(raw?.confirmedAmount),
    paidAmount:numberOrNull(raw?.paidAmount),
    paymentDate:/^\d{4}-\d{2}-\d{2}$/.test(raw?.paymentDate||'')?raw.paymentDate:null,
    paymentNotes:typeof raw?.paymentNotes==='string'?raw.paymentNotes.slice(0,160):''
  };
}
function sanitizeState(raw){
  if(!raw||typeof raw!=='object')return emptyState();
  const months={};
  for(const [month,data] of Object.entries(raw.months||{}))if(/^\d{4}-\d{2}$/.test(month))months[month]=sanitizeMonthData(data);
  const currentMonth=/^\d{4}-\d{2}$/.test(raw.currentMonth||'')?raw.currentMonth:localMonth();
  return {version:STATE_VERSION,currentMonth,months,undo:null};
}
function load(){
  try{
    const current=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(current?.months)return {...sanitizeState(current),undo:current.undo||null};
    for(const key of ['knok-remuneracao-final-v1','knok-remuneracao-definitivo-v1','knok-remuneracao-clean-v1']){
      const old=JSON.parse(localStorage.getItem(key));
      if(old?.months)return sanitizeState(old);
    }
  }catch{}
  return emptyState();
}

let state=load(),editingRef=null,pendingReview=null,importSource=null;
const save=()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));return true}catch{return false}};
function monthData(month=state.currentMonth,create=false){if(!state.months[month]&&create)state.months[month]=baseMonth();return state.months[month]||baseMonth()}
function labelMonth(m){const[y,mo]=m.split('-').map(Number);const s=monthFmt.format(new Date(Date.UTC(y,mo-1,1)));return s[0].toUpperCase()+s.slice(1)}
function fmtH(v){const n=Math.round(v*100)/100;return `${Number.isInteger(n)?n:n.toFixed(2).replace('.',',')} h`}
function setNotice(text,{undo=false}={}){$('#noticeText').textContent=text;$('#undoSync').hidden=!undo}
function snapshot(month){return {month,data:clone(monthData(month,true)),createdAt:new Date().toISOString()}}

function renderCalendar(shifts,dayRate){
  const [year,month]=state.currentMonth.split('-').map(Number),days=new Date(Date.UTC(year,month,0)).getUTCDate();
  const offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;
  const totalCells=Math.ceil((offset+days)/7)*7;
  const byDate=new Map();
  shifts.forEach((s,index)=>{const list=byDate.get(s.date)||[];list.push({s,index,row:splitShift(s,dayRate)});byDate.set(s.date,list)});
  $('#calendarGrid').innerHTML=Array.from({length:totalCells},(_,cell)=>{
    const day=cell-offset+1;
    if(day<1||day>days)return '<div class="calendar-day outside"></div>';
    const date=`${state.currentMonth}-${String(day).padStart(2,'0')}`,items=byDate.get(date)||[];
    return `<div class="calendar-day${items.length?' has-shift':''}"><span class="day-number">${day}</span>${items.map(({s,index,row})=>{const kind=row.day&&row.night?'mixed':row.night?'night':'day';return `<button class="shift-pill ${kind}" data-calendar-edit="${index}"><span>${esc(s.start)}–${esc(s.end)}</span><strong>${money.format(row.pay)}</strong></button>`}).join('')}</div>`;
  }).join('');
}

function render(){
  const d=monthData(),shifts=dedupeShifts(d.shifts),t=totals(shifts,d.dayRate),status=d.paymentStatus;
  $('#monthInput').value=state.currentMonth;$('#monthTitle').textContent=labelMonth(state.currentMonth);$('#totalPay').textContent=money.format(t.pay);$('#totalHours').textContent=`${fmtH(t.total)} trabalhadas`;$('#dayHours').textContent=fmtH(t.day);$('#nightHours').textContent=fmtH(t.night);$('#dayPay').textContent=money.format(t.dayPay);$('#nightPay').textContent=money.format(t.nightPay);$('#countLabel').textContent=`${shifts.length} ${shifts.length===1?'turno':'turnos'}`;
  $('#heroStatus').textContent=STATUS_LABELS[status];$('#heroStatus').dataset.status=status;
  $$('[data-rate]').forEach(b=>b.classList.toggle('active',Number(b.dataset.rate)===d.dayRate));
  $$('[data-status]').forEach(b=>b.classList.toggle('active',b.dataset.status===status));
  $('#confirmedAmount').value=d.confirmedAmount??'';$('#paidAmount').value=d.paidAmount??'';$('#paymentDate').value=d.paymentDate??'';$('#paymentNotes').value=d.paymentNotes??'';
  const comparison=status==='paid'?d.paidAmount:status==='confirmed'?d.confirmedAmount:null;
  const difference=comparison==null?null:comparison-t.pay;
  $('#paymentDifference').textContent=difference==null?'—':`${difference>0?'+':''}${money.format(difference)}`;$('#paymentDifference').className=difference==null?'':difference<0?'negative':difference>0?'positive':'';
  $('#rows').innerHTML=shifts.map((s,i)=>{const r=splitShift(s,d.dayRate),rate=s.dayRate?`€${s.dayRate}/h`:`€${d.dayRate}/h (padrão)`;return `<tr><td><strong>${dateFmt.format(new Date(s.date+'T00:00:00Z'))}</strong></td><td><strong>${s.start}–${s.end}</strong></td><td><span class="rate-chip${s.dayRate?' custom':''}">${rate}</span></td><td>${r.day?fmtH(r.day):'—'}</td><td>${r.night?fmtH(r.night):'—'}</td><td><strong>${money.format(r.pay)}</strong></td><td><div class="row-actions"><button class="mini" data-edit="${i}">Editar</button><button class="mini delete" data-delete="${i}" aria-label="Remover turno">×</button></div></td></tr>`}).join('');
  $('#emptyState').hidden=!!shifts.length;$('#exportCsv').disabled=!shifts.length;
  const months=Object.entries(state.months).filter(([,v])=>v.shifts?.length).sort(([a],[b])=>b.localeCompare(a));$('#monthEmpty').hidden=!!months.length;
  $('#monthList').innerHTML=months.map(([m,v])=>`<button class="month-item${m===state.currentMonth?' active':''}" data-month="${m}"><span><strong>${labelMonth(m)}</strong><small>${v.shifts.length} turnos</small></span><em data-status="${v.paymentStatus||'estimated'}">${STATUS_LABELS[v.paymentStatus||'estimated']}</em></button>`).join('');
  $('#undoSync').hidden=!state.undo;renderCalendar(shifts,d.dayRate);
}

function applyMonth(month,shifts,source,message){
  state.undo=snapshot(month);
  const previous=monthData(month,true);
  state.months[month]={...previous,shifts:dedupeShifts(shifts),updatedAt:new Date().toISOString(),source:source||null};
  state.currentMonth=month;save();render();setNotice(message,{undo:true});
}
function diagnosticsText(d){if(!d)return 'Origem manual · sem diagnóstico automático.';return `Mês detetado: ${d.month||'—'} · células: ${d.cellCount||0} · eventos: ${d.eventNodeCount||0} · interpretados: ${d.parsedEventNodeCount||0} · não interpretados: ${d.unparsedEventNodeCount||0} · ${d.healthy?'leitura completa':'leitura parcial'}`}
function inheritExistingRates(month,incoming){
  const existing=new Map(monthData(month).shifts.map(s=>[shiftKey(s),s]));
  return dedupeShifts(incoming.map(s=>s.dayRate? s : existing.get(shiftKey(s))?.dayRate ? {...s,dayRate:existing.get(shiftKey(s)).dayRate} : s));
}
function prepareReview(incoming,source='importação',diagnostics=null){
  const all=dedupeShifts(incoming),month=dominantMonth(all);if(!month)throw new Error('Não existem turnos válidos.');
  const clean=inheritExistingRates(month,onlyMonth(all,month)),d=monthData(month,true),diff=reconcileMonth(d.shifts,clean,month);
  openReview(month,diff,source,diagnostics);return diff;
}
function openReview(month,diff,source,diagnostics){
  pendingReview={month,diff,source,diagnostics};
  const d=monthData(month),newKeys=new Set(diff.added.map(shiftKey)),changedKeys=new Set((diff.changed||[]).map(shiftKey));
  $('#reviewSummary').textContent=`${labelMonth(month)} · confirma ${diff.shifts.length} turnos antes de guardar.`;
  $('#reviewIncomingCount').textContent=diff.shifts.length;$('#reviewAddedCount').textContent=diff.added.length;$('#reviewUnchangedCount').textContent=diff.unchanged.length;$('#reviewRemovedCount').textContent=diff.removed.length;$('#reviewRemovalDetailCount').textContent=diff.removed.length;
  $('#reviewRows').innerHTML=diff.shifts.map(s=>{const key=shiftKey(s),kind=newKeys.has(key)?'new':changedKeys.has(key)?'changed':'same',label=kind==='new'?'Novo':kind==='changed'?'Tarifa alterada':'Igual',r=splitShift(s,d.dayRate);return `<tr><td><span class="review-tag ${kind}">${label}</span></td><td>${esc(s.date)}</td><td>${esc(s.start)}–${esc(s.end)}</td><td>€${s.dayRate||d.dayRate}/h${s.dayRate?'':' · padrão'}</td><td><strong>${money.format(r.pay)}</strong></td></tr>`}).join('');
  $('#reviewRemoved').innerHTML=diff.removed.map(s=>`<div>${esc(s.date)} · ${esc(s.start)}–${esc(s.end)}</div>`).join('');
  $('#reviewDiagnostics').textContent=diagnosticsText(diagnostics);
  const partial=diagnostics&&!diagnostics.healthy&&diff.removed.length;
  $('#reviewWarning').textContent=partial?'A leitura parece incompleta. Recomendamos “Juntar sem remover” para preservar os turnos atuais.':diff.removed.length?'“Substituir mês” eliminará os turnos assinalados. Usa “Juntar sem remover” se não tiveres a certeza.':'Nenhum turno existente será removido.';
  $('#reviewWarning').classList.toggle('danger',Boolean(partial||diff.removed.length));
  if($('#importDialog').open)$('#importDialog').close();$('#reviewDialog').showModal();
}
function consumeHash(){
  const raw=location.hash.slice(1);if(!raw.startsWith('knok='))return;
  try{const p=decodePayload(raw.slice(5));history.replaceState(null,'',location.pathname+location.search);prepareReview(p.shifts,p.source||'Extensão Knok',p.diagnostics||null);setNotice('Turnos recebidos da extensão. Revê antes de sincronizar.')}catch(e){setNotice(`Importação recusada: ${e.message}`)}
}

$('#monthInput').onchange=e=>{if(e.target.value){state.currentMonth=e.target.value;save();render()}};
$('#rates').onclick=e=>{const b=e.target.closest('[data-rate]');if(!b)return;monthData(state.currentMonth,true).dayRate=Number(b.dataset.rate);save();render();setNotice(`Tarifa padrão de ${labelMonth(state.currentMonth)} alterada para €${b.dataset.rate}/h. As tarifas individuais foram mantidas.`)};
$('#monthList').onclick=e=>{const b=e.target.closest('[data-month]');if(!b)return;state.currentMonth=b.dataset.month;save();render()};
$('#rows').onclick=e=>handleShiftAction(e);
$('#calendarGrid').onclick=e=>{const b=e.target.closest('[data-calendar-edit]');if(!b)return;const sh=dedupeShifts(monthData().shifts);openShift(sh[Number(b.dataset.calendarEdit)],Number(b.dataset.calendarEdit))};
function handleShiftAction(e){const d=monthData(state.currentMonth,true),sh=dedupeShifts(d.shifts),del=e.target.closest('[data-delete]');if(del){state.undo=snapshot(state.currentMonth);sh.splice(Number(del.dataset.delete),1);d.shifts=sh;d.updatedAt=new Date().toISOString();save();render();setNotice('Turno removido manualmente.',{undo:true});return}const edit=e.target.closest('[data-edit]');if(edit)openShift(sh[Number(edit.dataset.edit)],Number(edit.dataset.edit))}
$('#exportCsv').onclick=()=>{const d=monthData(),sh=dedupeShifts(d.shifts);if(!sh.length)return;const txt='data;inicio;fim;tarifa_diurna\n'+sh.map(s=>`${s.date};${s.start};${s.end};${s.dayRate||''}`).join('\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+txt],{type:'text/csv'}));a.download=`turnos-${state.currentMonth}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
$('#undoSync').onclick=()=>{if(!state.undo)return;const u=clone(state.undo);state.months[u.month]=sanitizeMonthData(u.data);state.currentMonth=u.month;state.undo=null;save();render();setNotice(`Última alteração de ${labelMonth(u.month)} desfeita.`)};

$('#paymentStatus').onclick=e=>{const b=e.target.closest('[data-status]');if(!b)return;const d=monthData(state.currentMonth,true);d.paymentStatus=b.dataset.status;d.updatedAt=new Date().toISOString();save();render();setNotice(`${labelMonth(state.currentMonth)} marcado como ${STATUS_LABELS[d.paymentStatus].toLowerCase()}.`)};
for(const [id,key] of [['confirmedAmount','confirmedAmount'],['paidAmount','paidAmount'],['paymentDate','paymentDate'],['paymentNotes','paymentNotes']])$("#"+id).onchange=e=>{const d=monthData(state.currentMonth,true);d[key]=key.includes('Amount')?numberOrNull(e.target.value):(e.target.value||null);if(key==='paymentNotes')d[key]=(e.target.value||'').slice(0,160);d.updatedAt=new Date().toISOString();save();render();setNotice('Acompanhamento do pagamento atualizado.')};

const importDlg=$('#importDialog');
function showImportStep(step,source=null){importSource=source??importSource;$$('[data-step-indicator]').forEach(x=>x.classList.toggle('active',Number(x.dataset.stepIndicator)<=step));$$('[data-wizard-step]').forEach(x=>x.classList.toggle('active',Number(x.dataset.wizardStep)===step&&(!x.dataset.sourcePanel||x.dataset.sourcePanel===importSource)));$('#importBack').hidden=step===1;$('#importSubtitle').textContent=step===1?'Escolhe como queres obter os turnos.':importSource==='extension'?'Segue estes passos no calendário Knok.':'Confirma o mês e cola os turnos.'}
$('#openImport').onclick=()=>{$('#importMonth').value=state.currentMonth;showImportStep(1,null);importDlg.showModal()};
$$('[data-close]').forEach(b=>b.onclick=()=>importDlg.close());
$$('[data-source]').forEach(b=>b.onclick=()=>showImportStep(2,b.dataset.source));
$('#importBack').onclick=()=>showImportStep(1,null);
function updateFound(){const parsed=parseText($('#importText').value,$('#importMonth').value||state.currentMonth);$('#foundCount').textContent=`${parsed.length} ${parsed.length===1?'linha válida':'linhas válidas'}`;$('#parseError').textContent=''}
$('#importText').oninput=updateFound;$('#importMonth').onchange=updateFound;
$('#prepareText').onclick=()=>{try{const p=parseText($('#importText').value,$('#importMonth').value||state.currentMonth);if(!p.length)throw new Error('Não encontrei linhas válidas.');prepareReview(p,'CSV/texto',null)}catch(e){$('#parseError').textContent=e.message}};

const shiftDlg=$('#shiftDialog');
function openShift(s=null,index=null){editingRef=index===null?null:{month:state.currentMonth,index};$('#shiftTitle').textContent=s?'Editar turno':'Adicionar turno';$('#shiftDate').value=s?.date||`${state.currentMonth}-01`;$('#shiftStart').value=s?.start||'';$('#shiftEnd').value=s?.end||'';$('#shiftRate').value=s?.dayRate?String(s.dayRate):'';$('#shiftError').textContent='';shiftDlg.showModal()}
$('#addShift').onclick=()=>openShift();$$('[data-close-shift]').forEach(b=>b.onclick=()=>shiftDlg.close());
$('#shiftForm').onsubmit=e=>{e.preventDefault();const s=normalizeShift({date:$('#shiftDate').value,start:$('#shiftStart').value,end:$('#shiftEnd').value,dayRate:$('#shiftRate').value});if(!s){$('#shiftError').textContent='Data ou horário inválido. Início e fim não podem ser iguais.';return}const month=s.date.slice(0,7);state.undo=snapshot(editingRef?.month||month);if(editingRef){const old=monthData(editingRef.month,true),oldArr=dedupeShifts(old.shifts);oldArr.splice(editingRef.index,1);old.shifts=oldArr;old.updatedAt=new Date().toISOString()}const d=monthData(month,true),arr=dedupeShifts(d.shifts);arr.push(s);d.shifts=dedupeShifts(arr);d.updatedAt=new Date().toISOString();d.source='edição manual';state.currentMonth=month;editingRef=null;save();render();setNotice('Turno guardado com a respetiva tarifa.',{undo:true});shiftDlg.close()};

const reviewDlg=$('#reviewDialog');$$('[data-close-review]').forEach(b=>b.onclick=()=>{pendingReview=null;reviewDlg.close()});
$('#applyReview').onclick=()=>{if(!pendingReview)return;const p=pendingReview;applyMonth(p.month,p.diff.shifts,p.source,`${labelMonth(p.month)} sincronizado após revisão: ${p.diff.added.length} novos, ${(p.diff.changed||[]).length} alterados e ${p.diff.removed.length} removidos.`);pendingReview=null;reviewDlg.close()};
$('#keepExisting').onclick=()=>{if(!pendingReview)return;const p=pendingReview,current=monthData(p.month,true).shifts,merged=dedupeShifts([...current,...p.diff.shifts]);applyMonth(p.month,merged,p.source,`${labelMonth(p.month)} sincronizado sem remoções: ${p.diff.added.length} novos e ${(p.diff.changed||[]).length} alterados.`);pendingReview=null;reviewDlg.close()};

function downloadBlob(name,type,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('#exportBackup').onclick=()=>{const backup={schema:'knok-remuneracao-backup',version:STATE_VERSION,exportedAt:new Date().toISOString(),state:{...state,undo:null}};downloadBlob(`knok-remuneracao-backup-${new Date().toISOString().slice(0,10)}.json`,'application/json',JSON.stringify(backup,null,2))};
$('#importBackup').onclick=()=>$('#backupFile').click();
$('#backupFile').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>2_000_000){setNotice('Backup recusado: ficheiro demasiado grande.');return}try{const obj=JSON.parse(await file.text());if(obj?.schema!=='knok-remuneracao-backup'||!obj?.state?.months)throw new Error('Formato de backup inválido');state=sanitizeState(obj.state);save();render();setNotice('Backup restaurado com sucesso.')}catch(err){setNotice(`Não foi possível restaurar o backup: ${err.message}`)}};
$('#clearData').onclick=()=>{if(!confirm('Eliminar todos os meses, turnos, tarifas e pagamentos guardados neste dispositivo?'))return;try{for(const key of [STORAGE_KEY,'knok-remuneracao-final-v1','knok-remuneracao-definitivo-v1','knok-remuneracao-clean-v1'])localStorage.removeItem(key)}catch{}state=emptyState();editingRef=null;pendingReview=null;render();setNotice('Dados eliminados. A ferramenta está pronta para outra pessoa.')};

render();consumeHash();
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});

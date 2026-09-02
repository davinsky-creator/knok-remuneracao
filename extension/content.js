const DASHBOARD='https://knok-remuneracao-dashboard.vercel.app/';
const VERSION='2.1.0';

const {norm,normalizeTime,timePair,allTimePairs,key,dominantMonth,encode}=globalThis.KnokShared;
function eventNodesFor(cell){
  return [...new Set([...cell.querySelectorAll('.fc-event,.fc-daygrid-event,a.fc-event,[data-event-id],[class*="calendar-event"],[class*="event-item"]')])];
}
function extractCalendar(){
  const out=[],seen=new Set();
  const allCells=[...document.querySelectorAll('.fc-daygrid-day[data-date],[data-date].fc-day,[data-date]')]
    .filter(c=>/^\d{4}-\d{2}-\d{2}$/.test(c.getAttribute('data-date')||''));
  const cells=allCells.filter(c=>!c.classList.contains('fc-day-other'));
  let eventNodeCount=0,parsedEventNodeCount=0,unparsedEventNodeCount=0;
  for(const cell of cells){
    const date=cell.getAttribute('data-date');
    const nodes=eventNodesFor(cell);
    eventNodeCount+=nodes.length;
    for(const node of nodes){
      const sources=[
        node.querySelector('.fc-event-time')?.textContent,
        node.querySelector('time')?.textContent,
        node.getAttribute('aria-label'),
        node.getAttribute('title'),
        node.dataset?.time,
        node.textContent
      ].filter(Boolean);
      let p=null;
      for(const t of sources){p=timePair(t);if(p)break}
      if(!p){unparsedEventNodeCount++;continue}
      parsedEventNodeCount++;
      const s={date,start:p[0],end:p[1]},k=key(s);
      if(!seen.has(k)){seen.add(k);out.push(s)}
    }
    // Independent fallback: parse visible time ranges in the day cell even if event selectors changed.
    for(const p of allTimePairs(cell.textContent)){
      const s={date,start:p[0],end:p[1]},k=key(s);
      if(!seen.has(k)){seen.add(k);out.push(s)}
    }
  }
  const month=dominantMonth(out);
  const shifts=month?out.filter(x=>x.date.startsWith(`${month}-`)).sort((a,b)=>(a.date+a.start+a.end).localeCompare(b.date+b.start+b.end)):[];
  const title=norm(document.querySelector('.fc-toolbar-title,[data-testid*="calendar-title"],h1,h2')?.textContent||document.title).slice(0,120);
  const monthCells=month?cells.filter(c=>(c.getAttribute('data-date')||'').startsWith(`${month}-`)).length:0;
  const healthy=Boolean(month&&shifts.length&&cells.length>=28&&monthCells>=28&&unparsedEventNodeCount===0);
  return {shifts,diagnostics:{version:VERSION,month,title,cellCount:cells.length,monthCellCount:monthCells,eventNodeCount,parsedEventNodeCount,unparsedEventNodeCount,healthy}};
}
function makeUrl(result){return DASHBOARD+'#knok='+encode({v:3,source:`extensão Knok ${VERSION}`,exportedAt:new Date().toISOString(),diagnostics:result.diagnostics,shifts:result.shifts})}
function sync(){
  const result=extractCalendar();
  if(!result.shifts.length){alert('Knok Remuneração: não encontrei turnos. Confirma que estás na vista mensal e que os eventos estão visíveis.');return}
  const url=makeUrl(result);
  if(globalThis.chrome?.runtime?.sendMessage){chrome.runtime.sendMessage({type:'KNOK_OPEN_DASHBOARD',url});return}
  window.open(url,'_blank','noopener');
}
function mount(){
  if(document.getElementById('knok-remuneracao-sync'))return updateBadge();
  const b=document.createElement('button');b.id='knok-remuneracao-sync';b.type='button';b.textContent='€ Sincronizar';
  Object.assign(b.style,{position:'fixed',right:'18px',bottom:'76px',zIndex:'2147483647',border:'0',borderRadius:'999px',padding:'12px 16px',background:'#0ea5c6',color:'#fff',font:'700 14px system-ui',boxShadow:'0 8px 24px rgba(0,0,0,.18)',cursor:'pointer'});
  b.title='Sincronizar turnos visíveis com Knok Remuneração';b.onclick=sync;document.body.appendChild(b);updateBadge();
}
function updateBadge(){const b=document.getElementById('knok-remuneracao-sync');if(!b)return;const r=extractCalendar();b.textContent=r.shifts.length?`€ Sincronizar · ${r.shifts.length}`:'€ Sincronizar';b.style.background=r.diagnostics.healthy?'#0ea5c6':'#b7791f';b.title=r.diagnostics.healthy?'Leitura completa do calendário':`Leitura parcial · ${r.diagnostics.unparsedEventNodeCount} eventos por interpretar`}
let timer;const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{mount();updateBadge()},450)});observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});mount();
if(globalThis.chrome?.runtime?.onMessage){chrome.runtime.onMessage.addListener((msg,_sender,send)=>{if(msg?.type==='KNOK_EXTRACT'){send({ok:true,...extractCalendar()});return}if(msg?.type==='KNOK_SYNC'){sync();send({ok:true});return}return false})}

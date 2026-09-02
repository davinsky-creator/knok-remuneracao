const status=document.getElementById('status'),details=document.getElementById('details'),sync=document.getElementById('sync');
let activeTab=null,last=null;
async function inspect(){
  try{
    [activeTab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!activeTab?.id||!/^https:\/\/doctors\.knokcare\.com\//.test(activeTab.url||''))throw new Error('Abre o calendário Knok neste separador.');
    last=await chrome.tabs.sendMessage(activeTab.id,{type:'KNOK_EXTRACT'});
    if(!last?.shifts?.length)throw new Error('Não encontrei turnos na vista atual.');
    const d=last.diagnostics||{};
    status.textContent=`${last.shifts.length} turnos encontrados${d.month?' · '+d.month:''}.`;
    details.innerHTML=`Células: <strong>${d.cellCount||0}</strong><br>Eventos: <strong>${d.eventNodeCount||0}</strong><br>Interpretados: <strong>${d.parsedEventNodeCount||0}</strong>${d.unparsedEventNodeCount?`<br><span class="warn">Não interpretados: <strong>${d.unparsedEventNodeCount}</strong></span>`:''}<br>Estado: <strong>${d.healthy?'leitura completa':'revisão recomendada'}</strong>`;
    sync.disabled=false;
  }catch(e){status.textContent=e.message||'Não foi possível ler o calendário.';details.textContent='';sync.disabled=true}
}
sync.onclick=async()=>{if(!activeTab?.id)return;sync.disabled=true;sync.textContent='A sincronizar…';try{await chrome.tabs.sendMessage(activeTab.id,{type:'KNOK_SYNC'});window.close()}catch{status.textContent='Falha ao comunicar com a página. Atualiza a Knok e tenta novamente.';sync.disabled=false;sync.textContent='Sincronizar com dashboard'}};
inspect();

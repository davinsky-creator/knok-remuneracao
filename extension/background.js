chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
  if(msg?.type==='KNOK_OPEN_DASHBOARD'&&typeof msg.url==='string'&&msg.url.startsWith('https://knok-remuneracao-dashboard.vercel.app/#knok=')){
    chrome.tabs.create({url:msg.url});sendResponse({ok:true});return true;
  }
  return false;
});

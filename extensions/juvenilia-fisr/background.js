chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'JUVENILIA_OPEN_PREVIEW') return;
  (async () => {
    const payload = message.payload;
    if (!payload || !Array.isArray(payload.gare) || payload.gare.length > 1000) throw new Error('Dati trofeo non validi');
    await chrome.storage.local.set({juveniliaPreviewPayload: payload});
    await chrome.tabs.create({url: chrome.runtime.getURL('preview.html')});
    sendResponse({ok:true});
  })().catch(error => sendResponse({ok:false,error:error.message}));
  return true;
});

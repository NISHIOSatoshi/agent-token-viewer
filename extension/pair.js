function pair() {
  const token = document.querySelector('meta[name="agent-viewer-key"]')?.content;
  if (!token) return;
  chrome.runtime.sendMessage({ type: 'pair', token }).then(reply => {
    if (reply?.ok) window.dispatchEvent(new Event('agent-viewer-connected'));
  }).catch(() => {});
}
window.addEventListener('agent-viewer-ready', pair);
window.addEventListener('agent-viewer-refresh', () => { chrome.runtime.sendMessage({ type: 'refresh' }).catch(() => {}); });
pair();

chrome.storage.local.get('launchError').then(({ launchError }) => { document.querySelector('#error').textContent = launchError ?? '起動プログラムの登録が必要です。'; });
document.querySelector('#command').textContent = `install-edge.cmd --id ${chrome.runtime.id}`;

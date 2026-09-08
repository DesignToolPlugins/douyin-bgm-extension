// popup 弹窗逻辑
const startBtn = document.getElementById('start');
const cancelBtn = document.getElementById('cancel');
const openFolderBtn = document.getElementById('openFolder');
const statusEl = document.getElementById('status');
const timeFilterEl = document.getElementById('timeFilter');
const topNEl = document.getElementById('topN');

let lastDownloadId = null;

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = type;
}

function setRunning(running) {
  startBtn.disabled = running;
  startBtn.textContent = running ? '下载中...' : '开始下载';
  cancelBtn.disabled = false;
  if (!running) {
    cancelBtn.style.display = 'none';
  }
}

// 打开弹窗时恢复上一次的选择 + 显示当前状态
async function restore() {
  const s = await chrome.storage.local.get([
    'timeFilter', 'topN', 'running', 'lastStatus', 'lastDownloadId'
  ]);
  if (s.timeFilter) timeFilterEl.value = s.timeFilter;
  if (s.topN) topNEl.value = s.topN;
  setRunning(!!s.running);
  if (s.lastStatus) setStatus(s.lastStatus.text, s.lastStatus.type || '');
  if (s.lastDownloadId) {
    lastDownloadId = s.lastDownloadId;
    openFolderBtn.style.display = 'block';
  }
}
restore();

startBtn.addEventListener('click', async () => {
  const timeFilter = timeFilterEl.value;
  const topN = topNEl.value;
  await chrome.storage.local.set({ timeFilter, topN });
  setRunning(true);
  setStatus('准备中...');
  openFolderBtn.style.display = 'none';
  cancelBtn.style.display = 'block'; // 显示取消按钮
  chrome.runtime.sendMessage({
    action: 'start',
    timeFilter: parseInt(timeFilter),
    topN: parseInt(topN),
  });
});

cancelBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'cancel' });
  cancelBtn.disabled = true;
  setStatus('取消中...');
});

openFolderBtn.addEventListener('click', async () => {
  if (lastDownloadId) {
    try {
      // 验证下载项是否仍然存在
      const items = await chrome.downloads.search({ id: lastDownloadId });
      if (items && items.length > 0 && items[0].filename) {
        chrome.downloads.show(lastDownloadId);
      } else {
        setStatus('文件已被删除或移动', 'error');
        openFolderBtn.style.display = 'none';
      }
    } catch (e) {
      setStatus('无法打开文件夹', 'error');
      openFolderBtn.style.display = 'none';
    }
  }
});

// 监听 service worker 推来的进度
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'progress') {
    setStatus(msg.text);
  } else if (msg.type === 'done') {
    setStatus(msg.text, 'success');
    setRunning(false);
    if (msg.downloadId) {
      lastDownloadId = msg.downloadId;
      openFolderBtn.style.display = 'block';
    }
  } else if (msg.type === 'error') {
    setStatus(msg.text, 'error');
    setRunning(false);
  } else if (msg.type === 'need_login') {
    setStatus('未登录或登录已过期，正在打开抖音登录页...', 'error');
    setRunning(false);
  }
});

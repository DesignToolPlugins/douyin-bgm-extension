// service worker — 干活的地方

// 从抖音创作平台抓 XHR 时用的 user_id；ranking 是全站数据，任何合法登录用户都能拿
// 如果发现 API 报错，见 README「换 user_id」段
const USER_ID = '3087042592644936';

const BILLBOARD_API =
  'https://creator.douyin.com/web/api/creator/material/center/billboard/' +
  '?aid=2906&app_name=aweme_creator_platform&device_platform=web' +
  '&user_id=' + USER_ID +
  '&billboard_type=5&billboard_tag=0&order_key=1&limit=50';

const MUSIC_DETAIL_API = 'https://www.douyin.com/aweme/v1/web/music/detail/?music_id=';
const LOGIN_URL = 'https://creator.douyin.com/creator-micro/creative-guidance?discover_menu=5';

// ========== 消息入口 ==========
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'start') {
    run(msg.timeFilter, msg.topN).catch(err => {
      console.error('[BGM] 未捕获错误', err);
      report({ type: 'error', text: '出错: ' + (err.message || String(err)) });
      finish();
    });
  }
});

// ========== 主流程 ==========
async function run(timeFilter, topN) {
  await chrome.storage.local.set({ running: true, lastStatus: null, lastDownloadId: null });
  setBadge('...', '#4A90E2');

  // 1. 抓榜单
  report({ type: 'progress', text: '正在拉榜单...' });
  const url = BILLBOARD_API + '&time_filter=' + timeFilter;
  let data;
  try {
    const r = await fetch(url, { credentials: 'include' });
    data = await r.json();
  } catch (e) {
    report({ type: 'error', text: '接口请求失败: ' + e.message });
    setBadge('', '');
    finish();
    return;
  }

  // 未登录 or 接口报错
  if (data.status_code !== 0 || !data.item_list) {
    const errMsg = data.status_msg || '未拿到榜单';
    const likelyLogin =
      !data.item_list ||
      /登录|login|授权|session|cookie/i.test(errMsg);
    if (likelyLogin) {
      report({ type: 'need_login', text: errMsg });
      chrome.tabs.create({ url: LOGIN_URL, active: true });
    } else {
      report({ type: 'error', text: '接口报错: ' + errMsg });
    }
    setBadge('', '');
    finish();
    return;
  }

  const items = data.item_list.slice(0, topN);
  if (!items.length) {
    report({ type: 'error', text: '榜单为空（可能被反爬拦截）' });
    setBadge('', '');
    finish();
    return;
  }

  // 2. 目录：Downloads / douyin-bgm / YYYY-MM-DD_HHMM
  const stamp = timeStamp();
  const folder = 'douyin-bgm/' + stamp;

  // 3. 每首 → 拉 mp3 URL → 下载
  let ok = 0, fail = 0;
  let firstDownloadId = null;
  const failedItems = []; // 记录失败项
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rank = i + 1;
    const title = (item.title || '').slice(0, 40);
    report({ type: 'progress', text: `[${rank}/${items.length}] ${title}` });
    setBadge(rank + '/' + items.length, '#4A90E2');

    try {
      const mp3Url = await getMp3Url(item.item_id);
      if (!mp3Url) {
        console.error('[BGM] 获取 MP3 URL 失败', { rank, title, item_id: item.item_id });
        failedItems.push({ rank, title, reason: 'MP3 URL 为空' });
        fail++;
        continue;
      }
      const filename = folder + '/' +
        String(rank).padStart(2, '0') + '_' +
        sanitize(item.title || item.item_id) + '.mp3';
      const downloadId = await triggerDownload(mp3Url, filename);
      if (firstDownloadId === null) firstDownloadId = downloadId;
      ok++;
    } catch (e) {
      console.error('[BGM] 下载失败', { rank, title, item_id: item.item_id, error: e.message });
      failedItems.push({ rank, title, reason: e.message });
      fail++;
    }
  }
  
  // 输出失败详情
  if (failedItems.length > 0) {
    console.error('[BGM] 失败详情:', failedItems);
  }

  // 4. 完事
  const doneText = `完成 ✅ 成功 ${ok} / 失败 ${fail}\n目录: Downloads/${folder}`;
  await chrome.storage.local.set({ lastDownloadId: firstDownloadId });
  report({ type: 'done', text: doneText, downloadId: firstDownloadId });
  setBadge('✓', '#67c23a');

  // 系统通知（在 Chrome 关闭 popup 也能看到）
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0OCIgZmlsbD0iIzRBOTBFMiIvPjwvc3ZnPg==',
      title: '抖音 BGM 采集',
      message: `${ok} 首下载完成，${fail} 首失败`
    });
  } catch (e) { /* 通知不是必需，失败忽略 */ }

  // 30 秒后清 badge
  setTimeout(() => setBadge('', ''), 30000);
  finish();
}

// ========== 辅助 ==========
async function getMp3Url(itemId) {
  const r = await fetch(MUSIC_DETAIL_API + itemId, { credentials: 'include' });
  const d = await r.json();
  
  // 调试日志：记录完整响应
  console.log('[BGM] music detail API 响应:', { itemId, response: d });
  
  const mp3Url = d?.music_info?.play_url?.url_list?.[0] || '';
  if (!mp3Url) {
    console.error('[BGM] 无法提取 MP3 URL，API 响应结构:', JSON.stringify(d, null, 2));
  }
  
  return mp3Url;
}

function triggerDownload(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url, filename, conflictAction: 'uniquify', saveAs: false },
      (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(id);
        }
      }
    );
  });
}

function sanitize(s) {
  return String(s)
    .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function timeStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
         '_' + p(d.getHours()) + p(d.getMinutes());
}

async function report(msg) {
  await chrome.storage.local.set({ lastStatus: msg });
  try {
    chrome.runtime.sendMessage(msg);
  } catch (e) { /* popup 关了会 throw，忽略 */ }
}

async function finish() {
  await chrome.storage.local.set({ running: false });
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text: text || '' });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

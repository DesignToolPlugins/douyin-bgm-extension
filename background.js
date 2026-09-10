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
let isRunning = false; // 全局状态标志，防止重复启动
let badgeClearTimer = null; // Badge 清除定时器
let shouldCancel = false; // 取消标志

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'start') {
    // 防止快速双击启动多次
    if (isRunning) {
      console.warn('[BGM] 任务已在运行中，忽略重复请求');
      return;
    }
    
    isRunning = true;
    shouldCancel = false; // 重置取消标志
    run(msg.timeFilter, msg.topN).catch(err => {
      console.error('[BGM] 未捕获错误', err);
      report({ type: 'error', text: '出错: ' + (err.message || String(err)) });
      finish();
    });
  } else if (msg.action === 'cancel') {
    // 取消下载
    if (isRunning) {
      shouldCancel = true;
      console.log('[BGM] 用户取消下载');
    }
  }
});

// ========== 主流程 ==========
async function run(timeFilter, topN) {
  await chrome.storage.local.set({ running: true, lastStatus: null, lastDownloadId: null });
  setBadge('...', '#4A90E2');
  
  // 清除旧的 badge 定时器
  if (badgeClearTimer) {
    clearTimeout(badgeClearTimer);
    badgeClearTimer = null;
  }

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

  // 3. 每首 → 拉 mp3 URL → 下载（并发，限制 5 个）
  let ok = 0, fail = 0, skipped = 0;
  let firstDownloadId = null;
  const failedItems = []; // 记录失败项
  const concurrency = 5; // 并发数限制
  
  for (let i = 0; i < items.length; i += concurrency) {
    // 检查是否被取消
    if (shouldCancel) {
      console.log('[BGM] 下载已取消');
      report({ type: 'done', text: `已取消 ℹ️ 成功 ${ok} / 总共 ${items.length}\n目录: Downloads/${folder}`, downloadId: firstDownloadId });
      setBadge('×', '#909399');
      badgeClearTimer = setTimeout(() => setBadge('', ''), 30000);
      finish();
      return;
    }
    
    // 并发处理一批（最多 concurrency 首）
    const batch = items.slice(i, i + concurrency);
    const batchPromises = batch.map(async (item, idx) => {
      const rank = i + idx + 1;
      const title = (item.title || '').slice(0, 40);
      
      try {
        report({ type: 'progress', text: `[${rank}/${items.length}] ${title}` });
        setBadge(rank + '/' + items.length, '#4A90E2');
        
        const result = await getMp3Url(item.item_id);
        if (!result || !result.url) {
          console.error('[BGM] 获取 MP3 URL 失败', { rank, title, item_id: item.item_id });
          return { success: false, rank, title, reason: 'MP3 URL 为空' };
        }
        
        // 过滤规则1: 时长小于15秒
        if (result.duration && result.duration < 15) {
          console.log(`[BGM] 跳过短音频 (${result.duration}秒):`, title);
          return { success: false, skipped: true, rank, title, reason: `时长仅${result.duration}秒` };
        }
        
        // 过滤规则2: 标题包含台词关键词
        const voiceKeywords = ['原声', '配音', '旁白', '解说', '朗诵', '有声'];
        const hasVoice = voiceKeywords.some(kw => (result.title || title).includes(kw));
        if (hasVoice) {
          console.log('[BGM] 跳过含台词音频:', title);
          return { success: false, skipped: true, rank, title, reason: '可能包含台词' };
        }
        
        const mp3Url = result.url;
        
        const filename = folder + '/' +
          String(rank).padStart(2, '0') + '_' +
          sanitize(item.title || item.item_id) + '_' + item.item_id.slice(-6) + '.mp3';
        const downloadId = await triggerDownload(mp3Url, filename);
        
        return { success: true, downloadId };
      } catch (e) {
        console.error('[BGM] 下载失败', { rank, title, item_id: item.item_id, error: e.message });
        return { success: false, rank, title, reason: e.message };
      }
    });
    
    // 等待当前批次完成
    const results = await Promise.all(batchPromises);
    
    // 统计结果
    for (const result of results) {
      if (result.success) {
        if (firstDownloadId === null) firstDownloadId = result.downloadId;
        ok++;
      } else if (result.skipped) {
        skipped++;
      } else {
        failedItems.push({ rank: result.rank, title: result.title, reason: result.reason });
        fail++;
      }
    }
  }
  
  // 输出失败详情
  if (failedItems.length > 0) {
    console.error('[BGM] 失败详情:', failedItems);
  }

  // 4. 完事
  let doneText = `完成 ✅ 成功 ${ok} / 失败 ${fail}`;
  if (skipped > 0) {
    doneText += ` / 已跳过 ${skipped} 首（短音频/含台词）`;
  }
  doneText += `\n目录: Downloads/${folder}`;
  await chrome.storage.local.set({ lastDownloadId: firstDownloadId });
  report({ type: 'done', text: doneText, downloadId: firstDownloadId });
  setBadge('✓', '#67c23a');

  // 系统通知（在 Chrome 关闭 popup 也能看到）
  try {
    let notificationMsg = `${ok} 首下载完成，${fail} 首失败`;
    if (skipped > 0) notificationMsg += `，${skipped} 首已跳过`;
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0OCIgZmlsbD0iIzRBOTBFMiIvPjwvc3ZnPg==',
      title: '抖音 BGM 采集',
      message: notificationMsg
    });
  } catch (e) { /* 通知不是必需，失败忽略 */ }

  // 30 秒后清 badge
  badgeClearTimer = setTimeout(() => setBadge('', ''), 30000);
  finish();
}

// ========== 辅助 ==========
async function getMp3Url(itemId) {
  console.log('[BGM] 开始获取 MP3 URL，itemId:', itemId);
  
  // 通过 content script 在页面上下文中调用 API，绕过安全限制
  return new Promise((resolve, reject) => {
    // 获取当前活动的标签页
    chrome.tabs.query({ active: true, currentWindow: false }, (tabs) => {
      console.log('[BGM] 查询到的标签页数量:', tabs.length);
      
      // 找到 douyin.com 或 creator.douyin.com 的标签页
      const douyinTab = tabs.find(tab => 
        tab.url && (tab.url.includes('douyin.com'))
      );
      
      if (!douyinTab) {
        console.error('[BGM] ⚠️ 未找到抖音页面！请确保浏览器中至少有一个 douyin.com 或 creator.douyin.com 的标签页打开');
        console.log('[BGM] 尝试直接调用 API（可能失败）');
        
        // 如果没有打开的抖音页面，尝试直接调用（可能失败）
        fetch(MUSIC_DETAIL_API + itemId, { credentials: 'include' })
          .then(r => r.json())
          .then(d => {
            const musicInfo = d?.music_info || d?.music || {};
            const mp3Url = musicInfo?.play_url?.url_list?.[0] || '';
            console.log('[BGM] 直接调用结果:', mp3Url ? '成功' : '失败', d);
            resolve(mp3Url ? {
              url: mp3Url,
              duration: musicInfo.duration || 0,
              title: musicInfo.title || ''
            } : null);
          })
          .catch(err => {
            console.error('[BGM] API 调用失败:', err);
            resolve(null); // 返回 null
          });
        return;
      }
      
      console.log('[BGM] 找到抖音页面，tabId:', douyinTab.id, 'url:', douyinTab.url);
      
      // 向 content script 发送消息
      chrome.tabs.sendMessage(
        douyinTab.id,
        { action: 'getMp3Url', itemId },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[BGM] ❌ Content script 通信失败:', chrome.runtime.lastError.message);
            console.log('[BGM] 可能原因：1) content script 未注入 2) 页面刚加载需要刷新');
            resolve(null); // 返回 null
            return;
          }
          
          if (response && response.success) {
            console.log('[BGM] ✅ 通过 content script 获取 MP3 URL 成功:', itemId.slice(0, 10));
            resolve({ url: response.url, duration: response.duration, title: response.title });
          } else {
            console.error('[BGM] ❌ Content script 返回错误:', response?.error);
            resolve(null); // 返回 null
          }
        }
      );
    });
  });
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
  isRunning = false; // 重置全局状态
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text: text || '' });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

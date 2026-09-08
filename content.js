// content.js - 在页面上下文中执行，可以访问页面的安全参数

// 监听来自 service worker 的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getMp3Url') {
    // 在页面上下文中调用 API
    getMp3UrlInPage(msg.itemId)
      .then(url => sendResponse({ success: true, url }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // 异步响应
  }
});

async function getMp3UrlInPage(itemId) {
  const url = `https://www.douyin.com/aweme/v1/web/music/detail/?music_id=${itemId}`;
  
  try {
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    // 尝试多种可能的数据路径
    const mp3Url = 
      data?.music_info?.play_url?.url_list?.[0] ||
      data?.music_info?.play_url?.uri ||
      data?.music?.play_url?.url_list?.[0] ||
      '';
    
    if (!mp3Url) {
      console.error('[BGM Content] 无法提取 MP3 URL，响应数据:', data);
    }
    
    return mp3Url;
  } catch (error) {
    console.error('[BGM Content] 获取 MP3 URL 失败:', error);
    throw error;
  }
}

# 🚨 重要：插件安装和调试完整指南

## 问题诊断结果

测试发现：**Content Script 完全没有注入到页面中**

这是导致"成功 0 / 失败 20"的根本原因。

---

## ✅ 正确的安装步骤（一步都不能少）

### 第 1 步：确保代码是最新的
```bash
cd C:\Users\Administrator\Downloads\douyin-bgm-extension
git pull origin master
```

应该显示：`Already up to date` 或下载了最新代码。

### 第 2 步：检查文件完整性

确认以下文件存在：
- ✅ `manifest.json`
- ✅ `background.js`
- ✅ `content.js` ← **关键文件**
- ✅ `popup.html`
- ✅ `popup.js`

### 第 3 步：在 Chrome 中安装/更新插件

#### 如果已经安装过：
1. 打开 `chrome://extensions/`
2. 找到"抖音 BGM 采集器"
3. 点击右下角的 **刷新图标 ↻**（重要！）
4. 确认"已启用"开关是蓝色的

#### 如果第一次安装：
1. 打开 `chrome://extensions/`
2. 右上角打开"**开发者模式**"
3. 点击左上角"**加载已解压的扩展程序**"
4. 选择文件夹：`C:\Users\Administrator\Downloads\douyin-bgm-extension`
5. 确认插件出现在列表中，并且已启用

### 第 4 步：验证 Content Script 是否注入成功

1. **关闭所有 douyin.com 相关标签页**（重要！）
2. 打开一个**新标签页**
3. 访问：`https://creator.douyin.com`
4. 按 **F12** 打开 DevTools
5. 切换到 **Console** 标签
6. **应该看到**：
   ```
   [BGM Content] Content script loaded on: https://creator.douyin.com/...
   ```

#### 如果看到这条日志 ✅
- Content Script 注入成功！继续下一步。

#### 如果没看到这条日志 ❌
- 回到 `chrome://extensions/`
- 再次点击刷新图标
- 确认没有任何错误提示（红色感叹号）
- 如果有错误，复制错误信息发给我

### 第 5 步：登录抖音

1. 在刚才打开的 `creator.douyin.com` 页面
2. 如果需要登录，用手机抖音 APP 扫码登录
3. 登录成功后，**保持这个标签页打开**（可以最小化）

### 第 6 步：测试下载

1. 点击 Chrome 工具栏的插件图标（拼图）
2. 找到"抖音 BGM 采集器"，点击它
3. 选择：
   - 时间窗：**最近 7 天**
   - 数量：**前 10 首**
4. 点击"**开始下载**"
5. 观察状态变化

### 第 7 步：查看日志（如果失败）

#### A. 查看 Service Worker 日志
1. 打开 `chrome://extensions/`
2. 找到"抖音 BGM 采集器"
3. 点击蓝色的"**service worker**"链接
4. 会打开一个新的 DevTools 窗口
5. 切换到 **Console** 标签
6. 点击插件开始下载
7. 复制所有 `[BGM]` 开头的日志

#### B. 查看页面 Console 日志
1. 在 `creator.douyin.com` 标签页按 F12
2. 切换到 **Console** 标签
3. 查看是否有 `[BGM Content]` 开头的日志
4. 复制所有相关日志

---

## 🎯 预期结果

### 成功的标志
- ✅ Console 显示：`[BGM Content] Content script loaded`
- ✅ 下载过程中显示：`[1/10] 歌名`
- ✅ 最终显示：`完成 ✅ 成功 10 / 失败 0`
- ✅ 文件保存在：`Downloads/douyin-bgm/日期时间/`

### 失败的情况
如果还是显示"成功 0 / 失败 X"，请提供：
1. Service Worker Console 的完整日志
2. 页面 Console 的日志
3. 是否看到 `[BGM Content] Content script loaded`

---

## 🔍 常见问题

### Q1: 为什么必须刷新插件？
**A**: 你安装插件后，我修改了代码（添加了 `content.js`）。Chrome 不会自动更新已加载的扩展，必须手动刷新。

### Q2: 为什么必须关闭旧标签页？
**A**: Content Script 只在页面加载时注入。已经打开的标签页不会自动注入，必须刷新或打开新标签页。

### Q3: 看不到 "service worker" 链接怎么办？
**A**: 说明 Service Worker 还没激活。点击插件图标触发一次操作后就会出现。

### Q4: 插件刷新后显示错误怎么办？
**A**: 截图错误信息发给我。可能是 manifest.json 或代码语法错误。

---

## 📞 如果还有问题

提供以下信息：
1. 在 `creator.douyin.com` 页面的 Console 中，是否看到 `[BGM Content]` 日志？
2. Service Worker Console 中有什么错误？
3. 插件卡片上是否有红色感叹号或错误提示？

把这些信息发给我，我能立即定位问题。

---

**重要：请一步一步按照这个指南操作，不要跳过任何步骤！**

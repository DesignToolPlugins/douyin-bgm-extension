@echo off
chcp 65001 > nul
echo ========================================
echo 抖音 BGM 采集器 - 自动诊断脚本
echo ========================================
echo.

cd /d "%~dp0"

echo [1/5] 检查文件完整性...
if not exist "manifest.json" (
    echo ❌ manifest.json 不存在
    goto :error
)
if not exist "background.js" (
    echo ❌ background.js 不存在
    goto :error
)
if not exist "content.js" (
    echo ❌ content.js 不存在
    goto :error
)
if not exist "popup.html" (
    echo ❌ popup.html 不存在
    goto :error
)
if not exist "popup.js" (
    echo ❌ popup.js 不存在
    goto :error
)
echo ✅ 所有核心文件存在

echo.
echo [2/5] 检查 content.js 是否包含注入标志...
findstr /C:"window.contentScriptInjected" content.js > nul
if %ERRORLEVEL% EQU 0 (
    echo ✅ content.js 包含注入标志
) else (
    echo ❌ content.js 缺少注入标志
    echo 请运行: git pull origin master
    goto :error
)

echo.
echo [3/5] 检查 manifest.json 中的 content_scripts 配置...
findstr /C:"content_scripts" manifest.json > nul
if %ERRORLEVEL% EQU 0 (
    echo ✅ manifest.json 包含 content_scripts 配置
) else (
    echo ❌ manifest.json 缺少 content_scripts
    goto :error
)

echo.
echo [4/5] 显示当前 Git 版本...
git log -1 --oneline
echo.

echo [5/5] 下一步操作提示
echo ========================================
echo.
echo 文件检查通过！请按照以下步骤操作：
echo.
echo 第 1 步：打开 Chrome
echo   在地址栏输入: chrome://extensions/
echo.
echo 第 2 步：找到"抖音 BGM 采集器"
echo   点击右下角的【刷新图标 ↻】
echo.
echo 第 3 步：验证 Content Script
echo   1) 关闭所有 douyin.com 标签页
echo   2) 打开新标签页，访问: https://creator.douyin.com
echo   3) 按 F12 打开 DevTools
echo   4) 切换到 Console 标签
echo   5) 查找日志: [BGM Content] Content script loaded
echo.
echo 如果看到这条日志 → 插件正常，可以使用
echo 如果没看到 → 请截图发给开发人员
echo.
echo ========================================
pause
exit /b 0

:error
echo.
echo ========================================
echo ❌ 诊断失败
echo ========================================
echo.
echo 请运行以下命令修复：
echo   cd C:\Users\Administrator\Downloads\douyin-bgm-extension
echo   git pull origin master
echo.
echo 或者联系开发人员获取帮助。
echo.
pause
exit /b 1

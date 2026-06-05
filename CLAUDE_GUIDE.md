# CLAUDE_GUIDE.md

## 一、项目背景

- 项目名称：video-daihuo
- V1 目标：本地网页工作台，实现视频号图书带货自动成片流程。
- 核心流程：视频上传 → 逐字稿 → 文案处理 → 书名/作者确认 → TTS 配音 → 图片上传 → 字幕 → 视频合成 → 成片预览与导出。
- 当前 V1：先做单条视频自动成片，不开启矩阵、多账号、自动发布。
- 后续扩展口子：GPT / Whisper / index-tts2 / GPT-Image-2 / Hyperframes / 矩阵账号 / 多任务复盘。

## 二、分工规则

- Claude Code（云端）：开发网页工作台核心逻辑、模块交互、UI 布局、占位功能。
- Codex（本地）：本地项目初始化、本地运行验证、启动脚本、FFmpeg / Whisper / 本地路径相关能力。
- 用户：只做决策，不做手动建目录、搬文件、解压、初始化、写代码等执行动作。
- 所有需要动手执行的事情，优先交给 Codex / Claude Code 完成。

## 三、安全约束

- 不上传 API Key、Token、Cookie、真实素材、视频号账号信息。
- 不提交本地测试视频、音频、图片、字幕、成片、佣金截图。
- 不破坏已有目录结构。
- 不推翻 V1 蓝图重做。
- 不随意更换技术栈。
- 所有真实配置只能放在本地 local config，不能提交到 GitHub。

## 四、项目目录结构

video-daihuo/
  web/
    index.html
    app.js
    styles.css
  tasks/
  assets/
  scripts/
  config/
    example.config.json
  docs/
    PROJECT_RULES.md
    V1_BLUEPRINT.md
    TASK_LOG.md
  CLAUDE_GUIDE.md

## 五、当前 V1 模块

V1 页面包含 10 个模块：

1. 视频导入
2. 逐字稿
3. 文案处理
4. 书名作者
5. TTS 配音
6. 画面与图片
7. 字幕
8. 视频合成
9. 成片预览与导出
10. 扩展接口占位 / 日志 / 人工确认

## 六、当前占位功能

以下能力当前是占位，不要误认为已接入真实服务：

- Whisper
- GPT / DeepSeek 自动调用
- index-tts2
- GPT-Image-2
- Hyperframes
- 剪映草稿
- FFmpeg 真实合成
- 抖音自动采集
- 多任务列表
- ASS 导出
- 矩阵账号
- 数据复盘

## 七、localStorage 和任务规则

- localStorage key：video-daihuo:v1:task
- task ID 规则：book_YYYYMMDD_001
- 所有任务数据结构必须方便后续映射到 tasks/{taskId}/ 目录。
- 后续本地后端接入后，任务产物应保存到：

tasks/{taskId}/source/
tasks/{taskId}/transcript/
tasks/{taskId}/audio/
tasks/{taskId}/images/
tasks/{taskId}/subtitles/
tasks/{taskId}/output/
tasks/{taskId}/logs/

## 八、UI 风格要求

- 浅色背景。
- 奶茶色 / 米白色 / 浅豆沙色。
- 卡片式布局。
- 左侧步骤导航。
- 顶部步骤进度条。
- 中间模块内容区。
- 右侧任务状态摘要。
- 状态标签要清楚：未开始、当前、已完成、待确认、需替换。
- 不要做成黑色程序员后台。
- 不要只做表单堆叠，要有流程感。

## 九、快速验证步骤

每次修改后至少验证：

1. 打开 web/index.html。
2. 点击创建任务，能生成任务 ID。
3. 测试视频上传预览。
4. 测试逐字稿填写 / 模拟 / 保存。
5. 测试清洗 / 改写 / 去重提示词复制。
6. 测试书名作者保存。
7. 测试 TTS 配置 JSON 和音频上传试听。
8. 测试按句切分和生图提示词。
9. 测试字幕生成、编辑、手动换行、SRT 导出。
10. 测试合成方案 JSON。
11. 测试 task_export.json 导出。
12. 刷新页面，确认 localStorage 能恢复。
13. 浏览器控制台不能有明显 JS 报错。
14. git status 应保持干净，或说明原因。

## 十、当前开发原则

- 先跑通 V1，不要过早 SaaS 化。
- 先本地网页工作台，再接本地后端。
- 先手动 GPT 模式，再接 API。
- 先本地上传视频，再补抖音自动采集。
- 先 FFmpeg 本地合成兜底，再补 Hyperframes。
- 先单条任务，再补多任务和矩阵。
- 每一步必须能单独重跑，避免一步失败全流程重做。
- 所有后续接口都要预留，但当前不要强行接真实 API。

## 十一、后续规划提醒

后续要补：

1. 本地 Whisper / ASR。
2. GPT / DeepSeek API 自动清洗、改写、书名识别、合规检查。
3. index-tts2 配音。
4. GPT-Image-2 九宫格生图与自动切图。
5. FFmpeg 本地真实合成。
6. Hyperframes 接口。
7. 抖音自动采集。
8. 多任务列表。
9. 矩阵账号。
10. 数据回填和爆款复发。
11. SaaS 化或局域网共享。

## 十二、给 Claude Code / Codex 的固定提醒

每次开始任务前，请先阅读本文件，再阅读：

- docs/PROJECT_RULES.md
- docs/V1_BLUEPRINT.md
- docs/TASK_LOG.md

不要每次重新设计项目。
不要推翻已有结构。
不要让用户手动做执行动作。
如果需要本地验证，交给 Codex。
如果需要核心逻辑开发，交给 Claude Code。

完成后：
1. 提交 commit。
2. 说明修改文件。
3. 说明自检结果。
4. 说明哪些功能是占位。
5. 说明下一步建议。

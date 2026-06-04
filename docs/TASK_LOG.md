# TASK_LOG

## 当前阶段

V1 本地网页工作台核心交互

## 当前目标

完成 V1 本地网页工作台核心结构与交互，覆盖任务创建、视频导入、逐字稿、文案处理、书籍信息、TTS 配音入口、画面与图片、字幕、视频合成方案和导出。
本阶段不接真实 API，不写本地磁盘，所有数据保存在浏览器 localStorage。

## 已完成事项

### Codex（前期）

- 初始化 Git 工程、远程仓库、`main` 分支。
- 创建 `web/`、`tasks/`、`assets/`、`scripts/`、`config/`、`docs/` 目录。
- 生成网页工作台骨架、规则、V1 蓝图、配置示例和忽略规则。
- 补充目录占位说明文件。

### Claude Code（本次：分支 `claude/v1-workbench-core`）

#### 工作台结构

- 重做 `web/index.html`、`web/styles.css`、`web/app.js`。
- 浅色奶茶 / 米白配色，卡片式布局。
- 左侧 01-10 步骤导航 + 顶部 10 步横向进度条 + 中间模块主区 + 右侧任务摘要面板。
- 步骤切换：点击左侧步骤或顶部进度条即可。

#### 任务信息区（Step 01）

- 默认空任务；点击「创建任务」生成形如 `book_20260604_001` 的任务 ID。
- 任务名称、原视频标题 / 来源 / 关键词字段，保存到 localStorage。
- 右侧矩阵字段折叠区，预留账号 ID、发布平台 / 时间、播放、订单、佣金、是否爆款 / 复发。

#### 视频导入区（Step 01）

- 本地视频文件选择 + 文件名 / 大小 / 类型显示 + 浏览器内预览。
- 替换 / 移除视频；状态标签自动更新。
- UI 中提示后续后端会写入 `tasks/{taskId}/source/original_video.mp4`。
- 抖音链接采集占位（禁用）。

#### 逐字稿区（Step 02）

- 原始逐字稿文本框 + 保存按钮 + 模拟提取按钮（填示例文本）。
- Whisper 本地 ASR 按钮占位（禁用）。
- UI 提示输出路径 `transcript/raw_transcript.txt|json`。

#### 文案处理区（Step 03）

- 三个子模块：清洗 / 改写 / 轻量去重。
- 每个子模块均带：复制提示词、查看 / 隐藏提示词、保存按钮。
- 改写支持版本名（默认 `rewritten_script_v1`）。
- 内置完整提示词模板（清洗、改写、去重）符合 V1 蓝图要求。

#### 书名 / 作者识别（Step 04）

- 书名 / 作者 / 国籍身份 / 置信度 / 人工确认勾选。
- 「复制书名识别提示词」按钮；AI 识别按钮占位（禁用）。
- 输出路径提示 `book_info.json`。

#### TTS 配音区（Step 05）

- 最终口播稿文本框，可从改写稿 / 去重稿一键载入。
- 字数实时统计 + 按 4 字/秒粗估口播时长。
- 音色、语速、数字转中文、发音替换词典、四类停顿规则（逗号 / 句号 / 问号感叹号 / 省略号）。
- 上传音频试听；「生成 TTS 配置 JSON」按钮可生成预览 JSON。
- index-tts2 调用按钮占位（禁用）。

#### 画面与图片区（Step 06）

- 「按句切分文案」根据最终口播稿（或改写 / 清洗稿）切句。
- 每句卡片：句号、口播文案、生图提示词、复制提示词、上传图片、标记可用 / 需替换、备注。
- 「生成全部生图提示词」批量填充竖版 9:16 写实风提示词。
- 「复制九宫格提示词」生成九宫格批量提示词。
- 批量上传图片（按顺序匹配 1..N 句）。
- GPT-Image-2 九宫格按钮占位（禁用）。
- UI 提示输出 `images/00x.png` 与 `image_map.json` 由后续后端落盘。

#### 字幕区（Step 07）

- 根据切句结果生成字幕，按句长粗估时长。
- 可编辑表格：开始 / 结束（SRT 时间格式）、字幕文本、是否手动换行。
- 字幕样式：字号、字体、颜色、描边、阴影、位置、每屏字数、单 / 双行。
- 「导出 SRT」生成预览；「下载 .srt 文件」直接下载。
- ASS 导出按钮占位（禁用）。
- 字幕换行依赖人工 checkbox，不会被系统乱拆。

#### 视频合成区（Step 08）

- 比例（默认 9:16）、是否烧录字幕、FPS、分辨率。
- 背景音乐 / 封面图选择；健康声明 / 视频声明文本框。
- 「生成合成方案 JSON」输出符合后续 FFmpeg 拉取的 `task_export.json` 预览。
- FFmpeg / Hyperframes / 剪映草稿按钮占位（禁用）。

#### 成片预览与导出区（Step 09）

- 可上传已合成 MP4 在浏览器中预览（本地，不会上传）。
- 三个导出按钮：`task_export.json`、`subtitles.srt`、完整任务 JSON。
- 路径提示 `tasks/{taskId}/output/final_video.mp4`。

#### 日志 / 扩展接口（Step 10）

- 扩展接口占位卡片：GPT API、DeepSeek API、index-tts2、GPT-Image-2、Hyperframes、抖音自动采集、矩阵账号、数据复盘。
- 人工确认事项 checklist；运行日志区域（本地）。

## 仅 UI 占位、未实现的功能

- 多任务列表（V1 范围外，矩阵版本提供）。
- Whisper 本地 ASR / GPT / DeepSeek API 调用。
- index-tts2 真实合成。
- GPT-Image-2 九宫格生图与自动切图。
- FFmpeg / Hyperframes / 剪映草稿合成与导出 MP4。
- 抖音自动采集。
- 真实写入 `tasks/{taskId}/...` 本地磁盘（V1 只在 UI 显示路径）。
- ASS 字幕导出（仅 SRT 已实现）。

## 后续需要 Codex 本地实现的事

- 本地 Node / Python 后端，把当前 `task_export.json` 拉到本地磁盘并落 `tasks/{taskId}/...` 文件树。
- 本地 FFmpeg 合成竖版 MP4（按 `task_export.json` 中的 render / scenes / subtitles / paths 字段执行）。
- Whisper 本地 ASR 接入。
- 抖音分享链接自动采集脚本。
- 剪映草稿导出脚本。

## 后续需要 API Key 才能启用

- GPT API：清洗、改写、轻量去重、书名识别、合规检查、生图提示词自动化。
- DeepSeek API：备用 LLM。
- index-tts2：高质量 TTS。
- GPT-Image-2：九宫格生图。
- Hyperframes：合成接口。

API Key、Cookie、Token 不进仓库，全部走本地 `config/local.config.json`（已被 `.gitignore` 忽略）。

## 安全自检

- 仓库内未提交任何 API Key、Cookie、Token、视频号账号信息、真实视频 / 音频 / 图片 / 成片。
- 所有用户上传的素材仅在浏览器本地通过 `URL.createObjectURL` 预览，不会发送任何网络请求。
- 所有任务数据保存在浏览器 `localStorage` 的 `video-daihuo:v1:task` 键，不进入仓库。

## 下一步

1. 由 Codex（或同等本地侧）实现本地后端，把 `task_export.json` 落到磁盘并执行 FFmpeg 合成。
2. 配置 `config/local.config.json` 接入 GPT / index-tts2 / GPT-Image-2 时再开放对应模块的「自动」按钮。
3. 进入矩阵版本时，再扩展任务列表 / 多账号 / 数据复盘字段。

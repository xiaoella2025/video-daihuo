# scripts 目录说明

- `scripts/` 目录用于后续存放音频提取、字幕生成、视频合成、任务自检脚本。
- V1 后续会增加 FFmpeg 合成脚本。
- 当前阶段只保留说明。

## FFmpeg 合成

```bash
node scripts/render-ffmpeg.mjs <taskId>
```

脚本读取 `tasks/<taskId>/task_export.json`，检查 `images/`、`audio/`、`subtitles/` 中的素材，生成：

- `tasks/<taskId>/output/final_video.mp4`
- `tasks/<taskId>/output/cover.png`
- `tasks/<taskId>/logs/run_log.txt`
- `tasks/<taskId>/logs/cost_log.json`

重跑时会先把已有的 `final_video.mp4` / `cover.png` 改名为 `previous-时间戳` 备份，再生成新文件。

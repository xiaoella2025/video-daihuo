import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { renderTask } from "../scripts/render-ffmpeg.mjs";

const execFileAsync = promisify(execFile);

test("renderTask completes an end-to-end render from a frontend task_export.json", async (t) => {
  const hasFfmpeg = await commandExists("ffmpeg");
  if (!hasFfmpeg) {
    t.skip("ffmpeg is not installed");
    return;
  }

  const root = await mkdtemp(join(tmpdir(), "video-daihuo-e2e-"));
  const taskId = "book_20260605_001";
  const taskDir = join(root, "tasks", taskId);
  await mkdir(join(taskDir, "images"), { recursive: true });
  await mkdir(join(taskDir, "audio"), { recursive: true });
  await mkdir(join(taskDir, "subtitles"), { recursive: true });

  await execFileAsync("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "color=c=0x2563eb:s=720x1280:d=1",
    "-frames:v", "1", "-update", "1", join(taskDir, "images", "001.png")
  ]);
  await execFileAsync("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "color=c=0xf97316:s=720x1280:d=1",
    "-frames:v", "1", "-update", "1", join(taskDir, "images", "002.png")
  ]);
  await execFileAsync("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "sine=frequency=660:duration=4",
    "-c:a", "pcm_s16le", join(taskDir, "audio", "final_voice.wav")
  ]);

  await writeFile(join(taskDir, "subtitles", "subtitles.srt"), [
    "1",
    "00:00:00,000 --> 00:00:02,000",
    "第一句端到端字幕",
    "",
    "2",
    "00:00:02,000 --> 00:00:04,000",
    "第二句端到端字幕",
    ""
  ].join("\n"), "utf8");

  await writeFile(join(taskDir, "task_export.json"), JSON.stringify({
    taskId,
    paths: {
      audio: `tasks/${taskId}/audio/final_voice.wav`,
      subtitlesSrt: `tasks/${taskId}/subtitles/subtitles.srt`,
      output: `tasks/${taskId}/output/final_video.mp4`,
      cover: `tasks/${taskId}/output/cover.png`
    },
    render: {
      fps: 30,
      resolution: "720x1280",
      ratio: "9:16",
      burn: true
    },
    scenes: [
      { idx: 1, imageRelPath: "images/001.png" },
      { idx: 2, imageRelPath: "images/002.png" }
    ],
    subtitles: {
      lines: [
        { start: "00:00:00,000", end: "00:00:02,000", text: "第一句端到端字幕" },
        { start: "00:00:02,000", end: "00:00:04,000", text: "第二句端到端字幕" }
      ]
    }
  }, null, 2), "utf8");

  const first = await renderTask({ root, taskId });
  const second = await renderTask({ root, taskId });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.ok((await stat(join(taskDir, "output", "final_video.mp4"))).size > 0);
  assert.ok((await stat(join(taskDir, "output", "cover.png"))).size > 0);
  assert.ok((await stat(join(taskDir, "logs", "run_log.txt"))).size > 0);
  assert.ok((await stat(join(taskDir, "logs", "cost_log.json"))).size > 0);
});

async function commandExists(command) {
  try {
    await execFileAsync(command, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

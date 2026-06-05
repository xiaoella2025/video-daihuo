import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildFfmpegArgs,
  loadRenderPlan,
  validateRenderPlan
} from "../scripts/render-ffmpeg.mjs";

async function writeFixture(root) {
  const taskId = "book_20260605_999";
  const taskDir = join(root, "tasks", taskId);
  await mkdir(join(taskDir, "images"), { recursive: true });
  await mkdir(join(taskDir, "audio"), { recursive: true });
  await mkdir(join(taskDir, "subtitles"), { recursive: true });
  await writeFile(join(taskDir, "images", "001.png"), "fake image");
  await writeFile(join(taskDir, "images", "002.png"), "fake image");
  await writeFile(join(taskDir, "audio", "voice_part_001.wav"), "fake audio");
  await writeFile(join(taskDir, "subtitles", "subtitles.srt"), "1\n00:00:00,000 --> 00:00:02,000\n测试\n");
  await writeFile(join(taskDir, "task_export.json"), JSON.stringify({
    taskId,
    paths: {
      audio: `tasks/${taskId}/audio/voice_part_001.wav`,
      subtitlesSrt: `tasks/${taskId}/subtitles/subtitles.srt`,
      output: `tasks/${taskId}/output/final_video.mp4`,
      cover: `tasks/${taskId}/output/cover.png`
    },
    render: {
      fps: 30,
      resolution: "1080x1920",
      ratio: "9:16",
      burn: true
    },
    scenes: [
      { idx: 1, imageRelPath: "images/001.png" },
      { idx: 2, imageRelPath: "images/002.png" }
    ],
    subtitles: {
      lines: [
        { start: "00:00:00,000", end: "00:00:02,000", text: "第一句" },
        { start: "00:00:02,000", end: "00:00:04,000", text: "第二句" }
      ]
    }
  }, null, 2));
  return taskId;
}

async function writeBomFixture(root) {
  const taskId = await writeFixture(root);
  const taskExportPath = join(root, "tasks", taskId, "task_export.json");
  const original = await import("node:fs/promises").then((fs) => fs.readFile(taskExportPath, "utf8"));
  await writeFile(taskExportPath, `\uFEFF${original}`, "utf8");
  return taskId;
}

test("loadRenderPlan resolves images, audio, subtitle, output, and settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "video-daihuo-test-"));
  const taskId = await writeFixture(root);

  const plan = await loadRenderPlan({ root, taskId });

  assert.equal(plan.taskId, taskId);
  assert.equal(plan.images.length, 2);
  assert.equal(plan.audio.length, 1);
  assert.match(plan.subtitle, /subtitles\.srt$/);
  assert.match(plan.outputVideo, /final_video\.mp4$/);
  assert.equal(plan.settings.fps, 30);
  assert.equal(plan.settings.width, 1080);
  assert.equal(plan.settings.height, 1920);
});

test("loadRenderPlan accepts task_export.json with UTF-8 BOM", async () => {
  const root = await mkdtemp(join(tmpdir(), "video-daihuo-test-"));
  const taskId = await writeBomFixture(root);

  const plan = await loadRenderPlan({ root, taskId });

  assert.equal(plan.taskId, taskId);
  assert.equal(plan.images.length, 2);
});

test("validateRenderPlan reports missing required media files", async () => {
  const root = await mkdtemp(join(tmpdir(), "video-daihuo-test-"));
  const taskId = await writeFixture(root);
  const plan = await loadRenderPlan({ root, taskId });
  plan.images.push(join(root, "tasks", taskId, "images", "missing.png"));

  const report = await validateRenderPlan(plan);

  assert.equal(report.ok, false);
  assert.equal(report.missing.length, 1);
  assert.match(report.missing[0].path, /missing\.png$/);
});

test("buildFfmpegArgs includes image concat input, audio, subtitles, and final output", async () => {
  const root = await mkdtemp(join(tmpdir(), "video-daihuo-test-"));
  const taskId = await writeFixture(root);
  const plan = await loadRenderPlan({ root, taskId });

  const args = buildFfmpegArgs(plan, {
    imageConcatFile: join(plan.logsDir, "images.concat.txt"),
    audioInput: plan.audio[0]
  });

  assert.deepEqual(args.slice(0, 5), ["-y", "-f", "concat", "-safe", "0"]);
  assert.ok(args.includes(plan.audio[0]));
  assert.ok(args.some((arg) => arg.includes("subtitles=")));
  assert.equal(args.at(-1), plan.outputVideo);
});

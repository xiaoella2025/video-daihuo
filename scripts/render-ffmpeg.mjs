#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const AUDIO_EXTS = new Set([".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"]);

export async function loadRenderPlan({ root = process.cwd(), taskId }) {
  if (!taskId) throw new Error("taskId is required");
  const repoRoot = resolve(root);
  const taskDir = join(repoRoot, "tasks", taskId);
  const taskExportPath = join(taskDir, "task_export.json");
  const taskExport = JSON.parse(stripBom(await readFile(taskExportPath, "utf8")));
  const actualTaskId = taskExport.taskId || taskId;
  const actualTaskDir = join(repoRoot, "tasks", actualTaskId);
  const render = taskExport.video_settings || taskExport.render || {};
  const resolution = render.resolution || render.res || "1080x1920";
  const [width, height] = parseResolution(resolution);
  const outputVideo = resolveTaskPath({
    repoRoot,
    taskDir: actualTaskDir,
    value: taskExport.output || taskExport.paths?.output || "output/final_video.mp4"
  });
  const outputCover = resolveTaskPath({
    repoRoot,
    taskDir: actualTaskDir,
    value: taskExport.cover || taskExport.paths?.cover || "output/cover.png"
  });
  const logsDir = join(actualTaskDir, "logs");
  const outputDir = dirname(outputVideo);

  return {
    taskId: actualTaskId,
    repoRoot,
    taskDir: actualTaskDir,
    taskExportPath: join(actualTaskDir, "task_export.json"),
    outputDir,
    logsDir,
    outputVideo,
    outputCover,
    images: await resolveImages({ repoRoot, taskDir: actualTaskDir, taskExport }),
    audio: await resolveAudio({ repoRoot, taskDir: actualTaskDir, taskExport }),
    subtitle: resolveSubtitle({ repoRoot, taskDir: actualTaskDir, taskExport }),
    settings: {
      fps: Number(render.fps || 30),
      ratio: render.ratio || "9:16",
      width,
      height,
      burnSubtitles: render.burn !== false
    },
    subtitleLines: taskExport.subtitles?.lines || []
  };
}

export async function validateRenderPlan(plan) {
  const required = [
    ...plan.images.map((path) => ({ type: "image", path })),
    ...plan.audio.map((path) => ({ type: "audio", path }))
  ];
  if (plan.settings.burnSubtitles) {
    required.push({ type: "subtitle", path: plan.subtitle });
  }

  const missing = [];
  for (const item of required) {
    if (!item.path || !(await exists(item.path))) {
      missing.push(item);
    }
  }

  return {
    ok: missing.length === 0 && plan.images.length > 0 && plan.audio.length > 0,
    missing
  };
}

export function buildFfmpegArgs(plan, { imageConcatFile, audioInput }) {
  const vf = [
    `scale=${plan.settings.width}:${plan.settings.height}:force_original_aspect_ratio=decrease`,
    `pad=${plan.settings.width}:${plan.settings.height}:(ow-iw)/2:(oh-ih)/2`,
    "setsar=1"
  ];

  if (plan.settings.burnSubtitles && plan.subtitle) {
    vf.push(`subtitles='${escapeFilterPath(plan.subtitle)}'`);
  }

  return [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", imageConcatFile,
    "-i", audioInput,
    "-vf", vf.join(","),
    "-r", String(plan.settings.fps),
    "-shortest",
    "-pix_fmt", "yuv420p",
    "-c:v", "libx264",
    "-c:a", "aac",
    "-movflags", "+faststart",
    plan.outputVideo
  ];
}

export async function renderTask({ root = process.cwd(), taskId, ffmpeg = "ffmpeg", ffprobe = "ffprobe", dryRun = false } = {}) {
  const startedAt = new Date();
  const plan = await loadRenderPlan({ root, taskId });
  await mkdir(plan.outputDir, { recursive: true });
  await mkdir(plan.logsDir, { recursive: true });

  const validation = await validateRenderPlan(plan);
  const runLog = [];
  runLog.push(`taskId=${plan.taskId}`);
  runLog.push(`startedAt=${startedAt.toISOString()}`);
  runLog.push(`taskExport=${plan.taskExportPath}`);

  if (!validation.ok) {
    runLog.push("status=skipped");
    runLog.push("reason=missing required media");
    for (const item of validation.missing) {
      runLog.push(`missing ${item.type}: ${item.path || "(empty)"}`);
    }
    if (plan.images.length === 0) runLog.push("missing image: no image entries resolved");
    if (plan.audio.length === 0) runLog.push("missing audio: no audio entries resolved");
    await writeLogs(plan, runLog, { skipped: true, missing: validation.missing });
    return { ok: false, skipped: true, plan, missing: validation.missing };
  }

  const imageConcatFile = join(plan.logsDir, "images.concat.txt");
  const audioConcatFile = join(plan.logsDir, "audio.concat.txt");
  const concatAudio = join(plan.logsDir, "audio_concat.wav");
  const duration = await getRenderDuration({ plan, ffprobe });
  await writeImageConcatFile(imageConcatFile, plan.images, duration);

  const audioInput = plan.audio.length === 1
    ? plan.audio[0]
    : concatAudio;

  if (plan.audio.length > 1 && !dryRun) {
    await writeConcatFile(audioConcatFile, plan.audio);
    const audioArgs = ["-y", "-f", "concat", "-safe", "0", "-i", audioConcatFile, "-ac", "2", "-ar", "44100", concatAudio];
    runLog.push(`audioCommand=${ffmpeg} ${quoteArgs(audioArgs)}`);
    await run(ffmpeg, audioArgs);
  }

  await backupIfExists(plan.outputVideo);
  await backupIfExists(plan.outputCover);

  const ffmpegArgs = buildFfmpegArgs(plan, { imageConcatFile, audioInput });
  runLog.push(`ffmpegCommand=${ffmpeg} ${quoteArgs(ffmpegArgs)}`);

  if (!dryRun) {
    await run(ffmpeg, ffmpegArgs);
    const coverArgs = [
      "-y",
      "-i", plan.images[0],
      "-vf",
      `scale=${plan.settings.width}:${plan.settings.height}:force_original_aspect_ratio=decrease,pad=${plan.settings.width}:${plan.settings.height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
      "-frames:v", "1",
      "-update", "1",
      plan.outputCover
    ];
    runLog.push(`coverCommand=${ffmpeg} ${quoteArgs(coverArgs)}`);
    await run(ffmpeg, coverArgs);
  }

  const finalExists = dryRun ? false : await exists(plan.outputVideo);
  const coverExists = dryRun ? false : await exists(plan.outputCover);
  runLog.push(`status=${finalExists ? "success" : "failed"}`);
  runLog.push(`finalVideo=${plan.outputVideo}`);
  runLog.push(`cover=${plan.outputCover}`);
  await writeLogs(plan, runLog, {
    skipped: false,
    missing: [],
    finalVideo: plan.outputVideo,
    finalVideoExists: finalExists,
    cover: plan.outputCover,
    coverExists
  });

  return { ok: finalExists, skipped: false, plan, missing: [], finalVideoExists: finalExists, coverExists };
}

async function resolveImages({ repoRoot, taskDir, taskExport }) {
  const entries = [];
  const imageArray = taskExport.images || taskExport.image || [];
  if (Array.isArray(imageArray)) entries.push(...imageArray);
  if (Array.isArray(taskExport.scenes)) entries.push(...taskExport.scenes);

  const paths = entries
    .map((entry) => typeof entry === "string" ? entry : (entry.path || entry.imagePath || entry.imageRelPath || entry.file || ""))
    .filter(Boolean)
    .map((value) => resolveTaskPath({ repoRoot, taskDir, value }));

  if (paths.length) return paths;

  const imageDir = resolveTaskPath({ repoRoot, taskDir, value: taskExport.paths?.images || "images" });
  if (!(await exists(imageDir))) return [];
  const files = await readdir(imageDir);
  return files
    .filter((file) => IMAGE_EXTS.has(extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((file) => join(imageDir, file));
}

async function resolveAudio({ repoRoot, taskDir, taskExport }) {
  const entries = [];
  const audioArray = taskExport.audio || taskExport.audios || [];
  if (Array.isArray(audioArray)) entries.push(...audioArray);
  if (typeof audioArray === "string") entries.push(audioArray);
  if (taskExport.paths?.audio) entries.push(taskExport.paths.audio);

  const paths = entries
    .map((entry) => typeof entry === "string" ? entry : (entry.path || entry.audioPath || entry.file || ""))
    .filter(Boolean)
    .map((value) => resolveTaskPath({ repoRoot, taskDir, value }));

  if (paths.length) return paths;

  const audioDir = resolveTaskPath({ repoRoot, taskDir, value: "audio" });
  if (!(await exists(audioDir))) return [];
  const files = await readdir(audioDir);
  return files
    .filter((file) => AUDIO_EXTS.has(extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((file) => join(audioDir, file));
}

function resolveSubtitle({ repoRoot, taskDir, taskExport }) {
  return resolveTaskPath({
    repoRoot,
    taskDir,
    value: taskExport.subtitles?.srt || taskExport.paths?.subtitlesSrt || "subtitles/subtitles.srt"
  });
}

function resolveTaskPath({ repoRoot, taskDir, value }) {
  if (!value) return "";
  if (isAbsolute(value)) return resolve(value);
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("tasks/")) return resolve(repoRoot, normalized);
  return resolve(taskDir, normalized);
}

function parseResolution(value) {
  const match = String(value).match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) return [1080, 1920];
  return [Number(match[1]), Number(match[2])];
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

async function getRenderDuration({ plan, ffprobe }) {
  const subtitleDuration = getSubtitleDuration(plan.subtitleLines);
  if (subtitleDuration > 0) return subtitleDuration;
  const audioDuration = await probeDuration(ffprobe, plan.audio[0]);
  return audioDuration > 0 ? audioDuration : Math.max(plan.images.length * 2.5, 2.5);
}

function getSubtitleDuration(lines) {
  const last = [...lines].reverse().find((line) => line.end);
  return last ? parseTimestamp(last.end) : 0;
}

function parseTimestamp(value) {
  const match = String(value).match(/(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return 0;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4]);
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

async function probeDuration(ffprobe, input) {
  try {
    const output = await run(ffprobe, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      input
    ], { capture: true });
    return Number.parseFloat(output.stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

async function writeImageConcatFile(filePath, images, totalDuration) {
  const duration = Math.max(totalDuration / images.length, 0.1);
  const lines = [];
  for (const image of images) {
    lines.push(`file '${escapeConcatPath(image)}'`);
    lines.push(`duration ${duration.toFixed(3)}`);
  }
  lines.push(`file '${escapeConcatPath(images.at(-1))}'`);
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function writeConcatFile(filePath, files) {
  const lines = files.map((file) => `file '${escapeConcatPath(file)}'`);
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function writeLogs(plan, runLog, costData) {
  await mkdir(plan.logsDir, { recursive: true });
  await writeFile(join(plan.logsDir, "run_log.txt"), `${runLog.join("\n")}\n`, "utf8");
  await writeFile(join(plan.logsDir, "cost_log.json"), JSON.stringify({
    taskId: plan.taskId,
    generatedAt: new Date().toISOString(),
    currency: "CNY",
    estimatedCost: 0,
    note: "Reserved for future cost estimation.",
    ...costData
  }, null, 2), "utf8");
}

async function backupIfExists(filePath) {
  if (!(await exists(filePath))) return;
  const stamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "");
  const ext = extname(filePath);
  const base = filePath.slice(0, -ext.length);
  await rename(filePath, `${base}.previous-${stamp}${ext}`);
}

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function run(command, args, { capture = false } = {}) {
  return await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; if (!capture) process.stdout.write(chunk); });
    child.stderr?.on("data", (chunk) => { stderr += chunk; if (!capture) process.stderr.write(chunk); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else reject(new Error(`${command} exited with ${code}\n${stderr}`));
    });
  });
}

function escapeConcatPath(path) {
  return path.replaceAll("\\", "/").replaceAll("'", "'\\''");
}

function escapeFilterPath(path) {
  return path.replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
}

function quoteArgs(args) {
  return args.map((arg) => /\s/.test(arg) ? `"${arg}"` : arg).join(" ");
}

function parseCli(argv) {
  const args = [...argv];
  const taskId = args.shift();
  const options = { taskId };
  while (args.length) {
    const arg = args.shift();
    if (arg === "--root") options.root = args.shift();
    else if (arg === "--ffmpeg") options.ffmpeg = args.shift();
    else if (arg === "--ffprobe") options.ffprobe = args.shift();
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseCli(process.argv.slice(2));
    if (!options.taskId) {
      console.error("Usage: node scripts/render-ffmpeg.mjs <taskId> [--root <repoRoot>] [--dry-run]");
      process.exit(1);
    }
    const result = await renderTask(options);
    console.log(JSON.stringify({
      ok: result.ok,
      skipped: result.skipped,
      taskId: result.plan.taskId,
      output: result.plan.outputVideo,
      missing: result.missing
    }, null, 2));
    process.exit(result.ok ? 0 : 2);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

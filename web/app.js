const sampleTask = {
  id: "book_20260604_001",
  name: "图书带货成片任务示例",
  sourceVideo: {
    title: "",
    source: "local-upload",
    originalPath: "",
    previewReady: false
  },
  book: {
    title: "",
    author: "",
    confidence: 0,
    confirmed: false
  },
  workflow: {
    status: "initialized",
    currentStep: "workspace-ready",
    totalCost: 0,
    elapsedSeconds: 0
  },
  outputs: {
    transcript: "",
    cleanedScript: "",
    voice: "",
    images: [],
    subtitles: "",
    finalVideo: ""
  }
};

window.videoDaihuoTask = sampleTask;

const statusNode = document.querySelector("#app-status");

if (statusNode) {
  statusNode.textContent = `本地工作台已就绪：${sampleTask.id}`;
}

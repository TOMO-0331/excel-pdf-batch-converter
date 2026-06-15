const state = {
  files: [],
  commonRules: [],
  fileRules: {},
  activeFileName: "",
  activeTab: "common",
  pollingTimer: null,
};

const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
if (window.location.protocol === "http:" && !isLocalhost) {
  window.location.replace(`https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`);
}

const els = {
  fileInput: document.querySelector("#fileInput"),
  dropZone: document.querySelector("#dropZone"),
  fileList: document.querySelector("#fileList"),
  fileCount: document.querySelector("#fileCount"),
  commonRules: document.querySelector("#commonRules"),
  fileRules: document.querySelector("#fileRules"),
  perFileSelector: document.querySelector("#perFileSelector"),
  activeFileTitle: document.querySelector("#activeFileTitle"),
  addCommonRule: document.querySelector("#addCommonRule"),
  addFileRule: document.querySelector("#addFileRule"),
  runButton: document.querySelector("#runButton"),
  progressFill: document.querySelector("#progressFill"),
  progressText: document.querySelector("#progressText"),
  logList: document.querySelector("#logList"),
  clearLogs: document.querySelector("#clearLogs"),
  downloadLink: document.querySelector("#downloadLink"),
  ownerInput: document.querySelector("#ownerInput"),
  repoInput: document.querySelector("#repoInput"),
  tokenInput: document.querySelector("#tokenInput"),
  template: document.querySelector("#ruleRowTemplate"),
};

const modeLabels = {
  clear_values: "値のみクリア",
  delete_rows: "行ごと物理削除",
  delete_columns: "列ごと物理削除",
};

function createRule() {
  return {
    id: crypto.randomUUID(),
    sheet: "",
    range: "",
    mode: "clear_values",
    error: "",
  };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function addLog(message, type = "info") {
  const li = document.createElement("li");
  const timestamp = new Date().toLocaleTimeString("ja-JP", { hour12: false });
  li.textContent = `[${timestamp}] ${message}`;
  li.dataset.type = type;
  els.logList.append(li);
  els.logList.scrollTop = els.logList.scrollHeight;
}

function setProgress(percent, label) {
  els.progressFill.style.width = `${percent}%`;
  els.progressText.textContent = label;
}

function updateStepBadges() {
  document.querySelector('[data-step-status="files"]').textContent = state.files.length ? "✓" : "1";
  document.querySelector('[data-step-status="files"]').classList.toggle("complete", state.files.length > 0);

  const hasValidRules = collectRules({ markInvalid: false }).valid;
  document.querySelector('[data-step-status="rules"]').textContent = hasValidRules ? "✓" : "2";
  document.querySelector('[data-step-status="rules"]').classList.toggle("complete", hasValidRules);

  const canRun = state.files.length > 0 && hasValidRules;
  document.querySelector('[data-step-status="run"]').textContent = canRun ? "✓" : "3";
  document.querySelector('[data-step-status="run"]').classList.toggle("complete", canRun);
}

function renderFiles() {
  els.fileList.innerHTML = "";
  els.fileCount.textContent = `${state.files.length}件`;

  if (!state.files.length) {
    const li = document.createElement("li");
    li.textContent = "まだファイルが選択されていません。";
    els.fileList.append(li);
  }

  state.files.forEach((file) => {
    const li = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = file.name;
    const meta = document.createElement("span");
    meta.className = "file-meta";
    meta.textContent = formatBytes(file.size);
    const remove = document.createElement("button");
    remove.className = "text-button";
    remove.type = "button";
    remove.textContent = "削除";
    remove.addEventListener("click", () => removeFile(file.name));
    li.append(name, meta, remove);
    els.fileList.append(li);
  });

  renderPerFileSelector();
  updateStepBadges();
}

function addFiles(fileList) {
  const next = [...state.files];
  for (const file of fileList) {
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      addLog(`${file.name}: .xlsx ではないため追加しませんでした。`, "error");
      continue;
    }
    const existingIndex = next.findIndex((item) => item.name === file.name);
    if (existingIndex >= 0) {
      next.splice(existingIndex, 1, file);
      addLog(`${file.name}: 同名ファイルを置き換えました。`);
    } else {
      next.push(file);
    }
    state.fileRules[file.name] ||= [];
  }
  state.files = next;
  if (!state.activeFileName && state.files.length) state.activeFileName = state.files[0].name;
  renderFiles();
}

function removeFile(fileName) {
  state.files = state.files.filter((file) => file.name !== fileName);
  delete state.fileRules[fileName];
  if (state.activeFileName === fileName) {
    state.activeFileName = state.files[0]?.name || "";
  }
  renderFiles();
}

function renderPerFileSelector() {
  els.perFileSelector.innerHTML = "";
  state.files.forEach((file) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "file-select-button";
    button.classList.toggle("active", file.name === state.activeFileName);
    button.textContent = file.name;
    button.addEventListener("click", () => {
      state.activeFileName = file.name;
      renderPerFileSelector();
      renderRules();
    });
    els.perFileSelector.append(button);
  });
  renderRules();
}

function renderRules() {
  renderRuleTable(els.commonRules, state.commonRules, "common");
  const activeRules = state.activeFileName ? state.fileRules[state.activeFileName] || [] : [];
  els.activeFileTitle.textContent = state.activeFileName
    ? `${state.activeFileName} の削除ルール`
    : "ファイルを選択してください";
  renderRuleTable(els.fileRules, activeRules, "file");
  els.addFileRule.disabled = !state.activeFileName;
  updateStepBadges();
}

function renderRuleTable(container, rules, scope) {
  container.innerHTML = "";
  if (!rules.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "削除ルールはありません。必要な場合のみ追加してください。";
    container.append(empty);
    return;
  }

  rules.forEach((rule) => {
    const row = els.template.content.firstElementChild.cloneNode(true);
    row.dataset.ruleId = rule.id;
    row.classList.toggle("invalid", Boolean(rule.error));

    const sheet = row.querySelector(".rule-sheet");
    const range = row.querySelector(".rule-range");
    const mode = row.querySelector(".rule-mode");
    const message = row.querySelector(".validation-message");

    sheet.value = rule.sheet;
    range.value = rule.range;
    mode.value = rule.mode;
    message.textContent = rule.error;

    sheet.addEventListener("input", () => updateRule(scope, rule.id, { sheet: sheet.value }));
    range.addEventListener("input", () => updateRule(scope, rule.id, { range: range.value }));
    mode.addEventListener("change", () => updateRule(scope, rule.id, { mode: mode.value }));
    row.querySelector(".delete-rule").addEventListener("click", () => deleteRule(scope, rule.id));
    container.append(row);
  });
}

function getRuleBucket(scope) {
  if (scope === "common") return state.commonRules;
  if (!state.activeFileName) return [];
  state.fileRules[state.activeFileName] ||= [];
  return state.fileRules[state.activeFileName];
}

function updateRule(scope, ruleId, patch) {
  const bucket = getRuleBucket(scope);
  const rule = bucket.find((item) => item.id === ruleId);
  if (!rule) return;
  Object.assign(rule, patch);
  validateRule(rule);
  renderRules();
}

function addRule(scope) {
  const bucket = getRuleBucket(scope);
  bucket.push(createRule());
  renderRules();
}

function deleteRule(scope, ruleId) {
  if (scope === "common") {
    state.commonRules = state.commonRules.filter((rule) => rule.id !== ruleId);
  } else if (state.activeFileName) {
    state.fileRules[state.activeFileName] = state.fileRules[state.activeFileName].filter((rule) => rule.id !== ruleId);
  }
  renderRules();
}

function parseRuleInput(rule) {
  let sheet = rule.sheet.trim();
  let range = rule.range.trim().toUpperCase();
  const bangIndex = range.indexOf("!");
  if (bangIndex > -1) {
    sheet = range.slice(0, bangIndex).replace(/^'|'$/g, "");
    range = range.slice(bangIndex + 1);
  }
  return { sheet, range };
}

function validateRangeForMode(range, mode) {
  const cellRange = /^[A-Z]{1,3}[1-9][0-9]*:[A-Z]{1,3}[1-9][0-9]*$/;
  const rowRange = /^[1-9][0-9]*:[1-9][0-9]*$/;
  const colRange = /^[A-Z]{1,3}:[A-Z]{1,3}$/;

  if (mode === "clear_values") return cellRange.test(range);
  if (mode === "delete_rows") return rowRange.test(range) || cellRange.test(range);
  if (mode === "delete_columns") return colRange.test(range) || cellRange.test(range);
  return false;
}

function validateRule(rule) {
  const parsed = parseRuleInput(rule);
  if (!parsed.sheet && !parsed.range) {
    rule.error = "";
  } else if (!parsed.sheet) {
    rule.error = "シート名を入力してください。";
  } else if (!parsed.range) {
    rule.error = "範囲を入力してください。";
  } else if (!validateRangeForMode(parsed.range, rule.mode)) {
    rule.error = `${modeLabels[rule.mode]} に対応する範囲形式ではありません。`;
  } else {
    rule.error = "";
  }
  return !rule.error;
}

function normalizeRule(rule) {
  const parsed = parseRuleInput(rule);
  return {
    sheet: parsed.sheet,
    range: parsed.range,
    mode: rule.mode,
  };
}

function collectRules({ markInvalid }) {
  let valid = true;
  const commonRules = [];
  const fileRules = {};

  for (const rule of state.commonRules) {
    const parsed = parseRuleInput(rule);
    if (!parsed.sheet && !parsed.range) continue;
    if (!validateRule(rule)) valid = false;
    if (!rule.error) commonRules.push(normalizeRule(rule));
  }

  for (const file of state.files) {
    const rules = state.fileRules[file.name] || [];
    for (const rule of rules) {
      const parsed = parseRuleInput(rule);
      if (!parsed.sheet && !parsed.range) continue;
      if (!validateRule(rule)) valid = false;
      if (!rule.error) {
        fileRules[file.name] ||= [];
        fileRules[file.name].push(normalizeRule(rule));
      }
    }
  }

  if (markInvalid) renderRules();
  return { valid, commonRules, fileRules };
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function githubRequest(path, { token, method = "GET", body, accept = "application/vnd.github+json" }) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${method} ${path} failed: ${response.status} ${text}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function getGitHubInputs() {
  return {
    owner: els.ownerInput.value.trim(),
    repo: els.repoInput.value.trim(),
    token: els.tokenInput.value.trim(),
  };
}

function isSecureRuntime() {
  return window.isSecureContext || isLocalhost;
}

async function createUploadBranch({ owner, repo, token, branchName }) {
  const repoInfo = await githubRequest(`/repos/${owner}/${repo}`, { token });
  const baseBranch = repoInfo.default_branch;
  const baseRef = await githubRequest(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`, { token });
  await githubRequest(`/repos/${owner}/${repo}/git/refs`, {
    token,
    method: "POST",
    body: {
      ref: `refs/heads/${branchName}`,
      sha: baseRef.object.sha,
    },
  });
  return baseBranch;
}

async function uploadContent({ owner, repo, token, branchName, path, message, contentBase64 }) {
  await githubRequest(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replaceAll("%2F", "/")}`, {
    token,
    method: "PUT",
    body: {
      message,
      content: contentBase64,
      branch: branchName,
    },
  });
}

async function triggerWorkflow({ owner, repo, token, branchName, jobId }) {
  await githubRequest(`/repos/${owner}/${repo}/actions/workflows/convert-excel-to-pdf.yml/dispatches`, {
    token,
    method: "POST",
    body: {
      ref: branchName,
      inputs: {
        job_id: jobId,
        upload_branch: branchName,
      },
    },
  });
}

async function findWorkflowRun({ owner, repo, token, branchName }) {
  const data = await githubRequest(
    `/repos/${owner}/${repo}/actions/workflows/convert-excel-to-pdf.yml/runs?branch=${encodeURIComponent(branchName)}&event=workflow_dispatch&per_page=10`,
    { token },
  );
  return data.workflow_runs?.[0] || null;
}

async function getArtifact({ owner, repo, token, runId }) {
  const data = await githubRequest(`/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`, { token });
  return data.artifacts?.find((artifact) => artifact.name === "converted-pdf-zip") || null;
}

async function downloadArtifact({ owner, repo, token, artifactId }) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`Artifact download failed: ${response.status}`);
  return response.blob();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollRun(context) {
  let run = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    run = await findWorkflowRun(context);
    if (run) break;
    setProgress(65, "Workflow runの作成を待機中");
    await wait(5000);
  }

  if (!run) throw new Error("Workflow runを見つけられませんでした。Actionsの権限とworkflow_dispatch設定を確認してください。");
  addLog(`Workflow runを検出しました: #${run.run_number}`);

  while (run.status !== "completed") {
    const statusLabel = run.status === "queued" ? "キュー待機中" : "変換処理中";
    setProgress(run.status === "queued" ? 70 : 82, statusLabel);
    addLog(`Actions状態: ${statusLabel}`);
    await wait(10000);
    run = await githubRequest(`/repos/${context.owner}/${context.repo}/actions/runs/${run.id}`, { token: context.token });
  }

  if (run.conclusion !== "success") {
    throw new Error(`Actionsが失敗しました。結論: ${run.conclusion || "unknown"}。GitHub Actionsのログを確認してください。`);
  }

  setProgress(92, "成果物を取得中");
  const artifact = await getArtifact({ ...context, runId: run.id });
  if (!artifact) throw new Error("converted-pdf-zip artifactが見つかりませんでした。");
  const blob = await downloadArtifact({ ...context, artifactId: artifact.id });
  const url = URL.createObjectURL(blob);
  els.downloadLink.href = url;
  els.downloadLink.download = `converted-pdf-${context.jobId}.zip`;
  els.downloadLink.classList.remove("hidden");
  setProgress(100, "完了");
  addLog("変換が完了しました。ZIPをダウンロードできます。", "success");
}

async function runConversion() {
  els.downloadLink.classList.add("hidden");
  const { owner, repo, token } = getGitHubInputs();
  const rules = collectRules({ markInvalid: true });

  if (!state.files.length) {
    addLog("ファイルを1件以上選択してください。", "error");
    return;
  }
  if (!rules.valid) {
    addLog("削除ルールに不正な入力があります。", "error");
    return;
  }
  if (!owner || !repo || !token) {
    addLog("GitHub owner、Repository、PATを入力してください。", "error");
    return;
  }
  if (!isSecureRuntime()) {
    addLog("HTTPSではないページではトークンを送信できません。GitHub PagesのHTTPS URLから開いてください。", "error");
    return;
  }

  const jobId = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const branchName = `excel-pdf-jobs/${jobId}`;
  const context = { owner, repo, token, branchName, jobId };

  try {
    els.runButton.disabled = true;
    setProgress(5, "準備中");
    addLog(`ジョブを開始します: ${jobId}`);

    await createUploadBranch(context);
    setProgress(20, "一時ブランチを作成しました");
    addLog(`一時ブランチを作成しました: ${branchName}`);

    const config = {
      jobId,
      commonRules: rules.commonRules,
      fileRules: rules.fileRules,
      files: state.files.map((file) => file.name),
      createdAt: new Date().toISOString(),
    };

    const configBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(config, null, 2))));
    await uploadContent({
      ...context,
      path: `jobs/${jobId}/job-config.json`,
      message: `Add Excel PDF job config ${jobId}`,
      contentBase64: configBase64,
    });

    for (let index = 0; index < state.files.length; index += 1) {
      const file = state.files[index];
      setProgress(25 + Math.round((index / state.files.length) * 30), `${file.name} をアップロード中`);
      addLog(`${file.name}: アップロード中`);
      await uploadContent({
        ...context,
        path: `jobs/${jobId}/input/${file.name}`,
        message: `Upload ${file.name} for Excel PDF job ${jobId}`,
        contentBase64: await fileToBase64(file),
      });
      addLog(`${file.name}: アップロード完了`);
    }

    setProgress(58, "Actionsを起動中");
    await triggerWorkflow(context);
    addLog("GitHub Actionsを起動しました。");
    await pollRun(context);
  } catch (error) {
    console.error(error);
    setProgress(0, "エラー");
    addLog(error.message, "error");
  } finally {
    els.tokenInput.value = "";
    els.runButton.disabled = false;
  }
}

function initTabs() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      document.querySelectorAll(".tab-button").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelector("#commonPanel").classList.toggle("active", state.activeTab === "common");
      document.querySelector("#perFilePanel").classList.toggle("active", state.activeTab === "per-file");
    });
  });
}

function initFileDrop() {
  els.fileInput.addEventListener("change", () => addFiles(els.fileInput.files));
  ["dragenter", "dragover"].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.add("drag-over");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("drag-over");
    });
  });
  els.dropZone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));
}

function init() {
  if (!isSecureRuntime()) {
    els.runButton.disabled = true;
    addLog("HTTPSではないため実行を無効化しました。GitHub PagesのHTTPS URLで開いてください。", "error");
  }
  initTabs();
  initFileDrop();
  els.addCommonRule.addEventListener("click", () => addRule("common"));
  els.addFileRule.addEventListener("click", () => addRule("file"));
  els.runButton.addEventListener("click", runConversion);
  els.clearLogs.addEventListener("click", () => {
    els.logList.innerHTML = "";
  });
  addRule("common");
  renderFiles();
  setProgress(0, "未実行");
}

init();

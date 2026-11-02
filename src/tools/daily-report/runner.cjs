const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

let pythonCommand = null;

function toolRoot(app) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'tools', 'daily-report');
  }
  return __dirname;
}

function workerRoot(app) {
  return path.join(toolRoot(app), 'python');
}

function bundledWorker(app) {
  const executable = path.join(toolRoot(app), 'bin', 'xiaomaxun-daily-report-worker.exe');
  return fs.existsSync(executable) ? executable : null;
}

function runProcess(command, args, options = {}, onEvent = () => {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      shell: false,
      ...options,
    });
    const decoder = new TextDecoder('utf-8');
    let pending = '';
    let stdout = '';
    let stderr = '';
    const consume = (text, final = false) => {
      pending += text;
      const parts = pending.split(/\r?\n/);
      const trailing = parts.pop() || '';
      pending = final ? '' : trailing;
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          onEvent(JSON.parse(trimmed));
        } catch {
          onEvent({ type: 'progress', phase: 'working', message: trimmed });
        }
      }
      if (final && trailing.trim()) {
        try { onEvent(JSON.parse(trailing.trim())); } catch {}
      }
    };
    child.stdout.on('data', (chunk) => {
      const text = decoder.decode(chunk, { stream: true });
      stdout += text;
      consume(text);
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('close', (code) => {
      const tail = decoder.decode();
      stdout += tail;
      consume(tail, true);
      resolve({ code, stdout, stderr });
    });
  });
}

async function findPython() {
  if (pythonCommand) return pythonCommand;
  const candidates = [
    process.env.XIAOMAXUN_PYTHON ? { command: process.env.XIAOMAXUN_PYTHON, prefix: [] } : null,
    { command: 'python', prefix: [] },
    { command: 'python3', prefix: [] },
    { command: 'py', prefix: ['-3'] },
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const result = await runProcess(candidate.command, [
        ...candidate.prefix,
        '-c',
        'import openpyxl, pythoncom, win32com.client; print("ok")',
      ]);
      if (result.code === 0 && result.stdout.trim() === 'ok') {
        pythonCommand = candidate;
        return candidate;
      }
    } catch {
      // Try the next executable name.
    }
  }
  throw new Error('每日填报环境缺失：需要 Python 3、openpyxl 和 WPS COM 组件。');
}

async function runDailyWorker(app, command, args = [], onProgress = () => {}) {
  const root = workerRoot(app);
  const executable = bundledWorker(app);
  const workerArgs = [command, ...args];
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };
  let payload = null;
  const onEvent = (event) => {
    if (event?.type === 'result') payload = event;
    else if (event?.type === 'progress') onProgress(event);
  };
  const processResult = executable
    ? await runProcess(executable, workerArgs, { cwd: root, env }, onEvent)
    : await (async () => {
      const python = await findPython();
      return runProcess(python.command, [...python.prefix, path.join(root, 'worker.py'), ...workerArgs],
        { cwd: root, env }, onEvent);
    })();
  if (!payload) {
    const detail = processResult.stderr.trim() || processResult.stdout.trim() || `工作进程退出码 ${processResult.code}`;
    throw new Error(`每日填报工作进程返回异常：${detail.slice(0, 500)}`);
  }
  if (!payload.ok) throw new Error(payload.message || processResult.stderr.trim() || '每日数据填报失败');
  return payload;
}

async function checkDailyReport(app) {
  if (!bundledWorker(app)) await findPython();
  const status = await runDailyWorker(app, 'check');
  return {
    ready: true,
    runtime: bundledWorker(app) ? 'bundled' : 'system-python',
    capabilities: status.capabilities,
  };
}

async function inspectDailyWps(app) {
  return runDailyWorker(app, 'inspect');
}

async function runDailyFill(app, input, onProgress) {
  const dataDir = path.join(app.getPath('userData'), 'tools', 'daily-report');
  await fsp.mkdir(dataDir, { recursive: true });
  const payloadPath = path.join(dataDir, `fill-${crypto.randomUUID()}.json`);
  await fsp.writeFile(payloadPath, JSON.stringify(input), 'utf8');
  try {
    return await runDailyWorker(app, 'fill', ['--payload', payloadPath], onProgress);
  } finally {
    await fsp.rm(payloadPath, { force: true }).catch(() => {});
  }
}

async function writeDailyTraffic(app, input, onProgress) {
  return runDailyWorker(app, 'traffic', [
    '--asin', input.asin,
    '--total', String(input.total),
    '--organic', String(input.organic),
    '--ad', String(input.ad),
  ], onProgress);
}

module.exports = {
  bundledWorker,
  checkDailyReport,
  inspectDailyWps,
  runDailyFill,
  runDailyWorker,
  toolRoot,
  workerRoot,
  writeDailyTraffic,
};

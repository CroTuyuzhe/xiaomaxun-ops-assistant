const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

let pythonCommand = null;

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { outputEncoding = 'utf-8', ...spawnOptions } = options;
    const child = spawn(command, args, {
      windowsHide: true,
      shell: false,
      ...spawnOptions,
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on('data', (chunk) => { stdoutChunks.push(chunk); });
    child.stderr.on('data', (chunk) => { stderrChunks.push(chunk); });
    child.once('error', reject);
    child.once('close', (code) => {
      const decoder = new TextDecoder(outputEncoding);
      resolve({
        code,
        stdout: decoder.decode(Buffer.concat(stdoutChunks)),
        stderr: decoder.decode(Buffer.concat(stderrChunks)),
      });
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
        'import pdfplumber, fitz, openpyxl; print("ok")',
      ]);
      if (result.code === 0 && result.stdout.trim() === 'ok') {
        pythonCommand = candidate;
        return candidate;
      }
    } catch {
      // Try the next executable name.
    }
  }
  throw new Error('货件工具运行环境缺失：需要 Python 3 及 pdfplumber、PyMuPDF、openpyxl。');
}

function toolRoot(app) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'tools', 'shipping-planner');
  }
  return __dirname;
}

function workerRoot(app) {
  return path.join(toolRoot(app), 'python');
}

function bundledWorker(app) {
  const executable = path.join(toolRoot(app), 'bin', 'xiaomaxun-shipping-worker.exe');
  return fs.existsSync(executable) ? executable : null;
}

async function checkShippingPlanner(app) {
  if (bundledWorker(app)) return { ready: true, runtime: 'bundled' };
  if (app.isPackaged) {
    throw new Error('内置货件处理组件缺失，请重新安装小马逊运营助手。');
  }
  await findPython();
  return { ready: true, runtime: 'system-python' };
}

async function invokeShippingWorker(app, args) {
  const root = workerRoot(app);
  const executable = bundledWorker(app);
  const env = {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    XIAOMAXUN_SHIPPING_DATA_DIR: path.join(app.getPath('userData'), 'tools', 'shipping-planner', 'data'),
    XIAOMAXUN_SHIPPING_TEMPLATE: path.join(root, '工厂发货计划.xlsx'),
  };
  let result;
  if (executable) {
    // PyInstaller 的 Windows 控制台工作进程使用系统代码页输出中文。
    result = await runProcess(executable, args, { cwd: root, env, outputEncoding: 'gbk' });
  } else {
    if (app.isPackaged) {
      throw new Error('内置货件处理组件缺失，请重新安装小马逊运营助手。');
    }
    const python = await findPython();
    result = await runProcess(python.command, [...python.prefix, path.join(root, 'worker.py'), ...args], { cwd: root, env });
  }
  const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let payload = null;
  try {
    payload = JSON.parse(lines.at(-1) || '');
  } catch {
    const detail = result.stderr.trim() || result.stdout.trim() || `Python 退出码 ${result.code}`;
    throw new Error(`货件处理进程返回异常：${detail.slice(0, 500)}`);
  }
  if (!payload.ok) throw new Error(payload.message || result.stderr.trim() || '货件处理失败');
  return payload;
}

async function inspectShippingPdfs(app, pdfPaths) {
  const paths = Array.isArray(pdfPaths) ? pdfPaths : [];
  return invokeShippingWorker(app, [
    ...paths.flatMap((pdfPath) => ['--pdf', pdfPath]),
    '--inspect-only',
  ]);
}

async function runShippingPlanner(app, input) {
  const pdfPaths = Array.isArray(input.pdfPaths) ? input.pdfPaths : [input.pdfPath].filter(Boolean);
  const tempDir = path.join(app.getPath('userData'), 'tools', 'shipping-planner', 'temp');
  fs.mkdirSync(tempDir, { recursive: true });
  const productsPath = path.join(tempDir, `products-${crypto.randomUUID()}.json`);
  fs.writeFileSync(productsPath, JSON.stringify({ products: input.products || [] }), 'utf8');
  const args = [
    ...pdfPaths.flatMap((pdfPath) => ['--pdf', pdfPath]),
    '--store', input.store,
    '--date', input.date,
    '--transport', input.transport,
    '--delivery-days', String(input.deliveryDays ?? 45),
    '--person', input.person || '',
    '--locked', input.locked === false ? '0' : '1',
    '--btw', input.btwDir || '',
    '--output', input.outputDir || '',
    '--products-json', productsPath,
  ];
  try {
    return await invokeShippingWorker(app, args);
  } finally {
    try { fs.unlinkSync(productsPath); } catch { /* Temporary payload is safe to leave if Windows still holds it. */ }
  }
}

module.exports = {
  bundledWorker,
  checkShippingPlanner,
  findPython,
  inspectShippingPdfs,
  runShippingPlanner,
  toolRoot,
  workerRoot,
};

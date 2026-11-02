const path = require('node:path');

function loadDependency(name) {
  try {
    return require(name);
  } catch (error) {
    const bundledRoot = process.env.CODEX_BUNDLED_NODE_MODULES;
    if (!bundledRoot) throw error;
    return require(path.join(bundledRoot, name));
  }
}

module.exports = { loadDependency };

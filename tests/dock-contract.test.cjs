const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'dock-controller.cjs'), 'utf8');

test('docking fully hides the window and reveals it from a practical top-edge hot zone', () => {
  assert.match(source, /this\.window\.hide\(\)/);
  assert.match(source, /this\.window\.showInactive\(\)/);
  assert.match(source, /screenTop \+ 8/);
  assert.match(source, /workAreaTop \+ 8/);
  assert.match(source, /#hasContinuouslyLeftWindow\(cursor\)/);
  assert.match(source, /const tolerance = 10/);
  assert.match(source, /Date\.now\(\) - this\.outsideSince >= 100/);
  assert.match(source, /this\.#hideDocked\(300\)/);
  assert.match(source, /this\.#animateTo\(target, duration, \(progress\) => progress \*\* 3, 'hide'/);
  assert.match(source, /this\.#animateTo\(visibleBounds, 260/);
  assert.match(source, /this\.#inHotZone\(cursor\)\) this\.#reveal\(\)/);
  assert.match(source, /this\.window\.setPosition\(next\.x, next\.y, false\)/);
  assert.match(source, /setInterval\(step, 16\)/);
  assert.match(source, /if \(this\.autoHidePaused\) return/);
  assert.match(source, /togglePinned\(\)/);
  assert.match(source, /this\.docked \|\| this\.pinned/);
  assert.match(source, /this\.revealed \|\| this\.window\.isVisible\(\)/);
});

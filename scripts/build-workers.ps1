$ErrorActionPreference = 'Stop'
if (!(Test-Path 'src/tools/shipping-planner/python/工厂发货计划.xlsx')) { throw '请先准备自己的发货计划模板，详见 README' }
python -m PyInstaller --noconfirm --clean --onefile --name xiaomaxun-shipping-worker --paths src/tools/shipping-planner/python --distpath src/tools/shipping-planner/bin --workpath work/pyinstaller-shipping --specpath work src/tools/shipping-planner/python/worker.py
if ($LASTEXITCODE -ne 0) { throw '发货工作进程构建失败' }
python -m PyInstaller --noconfirm --clean --onefile --hidden-import win32timezone --name xiaomaxun-daily-report-worker --distpath src/tools/daily-report/bin --workpath work/pyinstaller-daily --specpath work src/tools/daily-report/python/worker.py
if ($LASTEXITCODE -ne 0) { throw '填报工作进程构建失败' }

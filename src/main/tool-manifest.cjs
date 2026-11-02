const TOOLS = Object.freeze([
  {
    id: 'shipping-planner',
    name: '工厂发货计划工具',
    category: '货件与物流',
    description: '批量解析箱唛 PDF，按仓库与 SKU 合并并生成发货计划。',
    migration: '支持多 PDF、逐份脱敏输出与合并 Excel，处理完成即退出',
    status: 'ready',
    baseline: 'Python 业务层 v1.3.1 / Electron 界面',
  },
  {
    id: 'daily-report',
    name: '每日数据填报工具',
    category: '数据处理',
    description: '将产品表现、评分和关键词数据填入 WPS 日表。',
    migration: '已迁入多文件组、Amazon 星级分布、xydc 流量词与 WPS 自动保存',
    status: 'ready',
    baseline: 'Python 业务层 / Electron 界面',
  },
  {
    id: 'competitor-images',
    name: '竞品图片采集器',
    category: '竞品分析',
    description: '采集竞品商品图、A+ 图片并生成横向对比 Excel。',
    migration: '已按 Python v2.2 基准迁入统一 Electron 模块',
    status: 'ready',
    baseline: 'Python v2.2 / Electron v2.0',
  },
  {
    id: 'keyword-rank',
    name: '关键词排名查询',
    category: '关键词工具',
    description: '批量配置 ASIN、邮编和关键词，通过插件查询并下载 Excel。',
    migration: '使用系统 Chrome 独立配置，支持插件登录、结果重试与文件校验',
    status: 'ready',
    baseline: 'AMZDataStudio 插件 / Electron 自动化',
  },
  {
    id: 'unit-converter',
    name: '尺寸和重量换算器',
    category: '常用工具',
    description: '手动换算常用尺寸与重量，也能从整段文本中智能提取数值。',
    migration: '本地即时计算，无需联网',
    status: 'ready',
    baseline: 'Electron 本地工具',
  },
]);

module.exports = { TOOLS };

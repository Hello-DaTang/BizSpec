# BizSpec

BizSpec 是一套面向内部 IT、Excel 业务和陌生业务领域的**业务发现与开发就绪工作流**。

它解决的不是“已经明确的需求如何编码”，而是：业务只能描述现有工作、无法描述系统形态时，如何从会议纪要、真实样表、业务演示和最终成果中，逐步还原出可确认、可追踪、可进入开发的业务规格。

## 核心原则

- 先还原业务事实，再设计系统页面。
- 以真实案例贯穿输入、处理、异常、确认和输出。
- 每个流程节点必须具有 `id`、`title`、`status` 和完成条件。
- 节点状态与节点内部业务条目状态分开管理。
- 会议表述、已确认结论、AI 推导和待确认事项必须明确区分。
- IT 可以整理和提出方案，但不得替业务定义 BOM、核算口径、责任归属等业务规则。
- 未满足完成条件的节点不得标记为 `done`。

## 12 个标准节点

| ID | Title |
|---|---|
| BS-01 | 项目范围与业务目标 |
| BS-02 | 业务资料与真实案例 |
| BS-03 | 角色与业务责任 |
| BS-04 | 当前业务流程还原 |
| BS-05 | 数据源与字段映射 |
| BS-06 | 业务术语与数据字典 |
| BS-07 | 业务规则与计算规则 |
| BS-08 | 异常场景与处理方式 |
| BS-09 | 目标业务流程 |
| BS-10 | 业务对象状态模型 |
| BS-11 | 第一阶段范围与验收场景 |
| BS-12 | 开发就绪检查 |

## 快速开始

```bash
pip install -r requirements.txt
python scripts/bizspec.py init ./my-project \
  --id my-project \
  --title "某业务系统"

python scripts/bizspec.py status ./my-project
python scripts/bizspec.py next ./my-project
python scripts/bizspec.py validate ./my-project
```

初始化后会生成：

```text
my-project/
├─ manifest.yaml
├─ sources/
├─ nodes/
├─ registers/
│  ├─ rules.yaml
│  ├─ questions.yaml
│  └─ decisions.yaml
└─ generated/
```

## Skill 使用方式

让 Agent 阅读根目录的 [`SKILL.md`](./SKILL.md)，然后使用类似指令：

```text
初始化一个 BizSpec 项目。
把这份会议纪要导入为证据，但不要把推测标记为确认。
处理 BS-05 数据源与字段映射节点。
检查当前哪个节点可以继续推进。
验证 BS-07 是否满足完成条件。
根据已确认内容生成开发就绪摘要。
```

## 边界

BizSpec 是开发前的业务发现和规格形成工具，不替代：

- 项目管理系统；
- 完整 BPM 平台；
- WMS、ERP、MES 等业务系统；
- 业务负责人对口径和规则的确认；
- 开发阶段的技术设计与代码变更规格。

BizSpec 完成后，可以将已确认内容继续输入 OpenSpec、设计文档或编码 Agent。
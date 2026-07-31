# BizSpec 数据契约

本文定义工作区文件的最小结构。字段可以扩展，但不得删除强制字段或改变状态语义。

## 工作区目录

```text
<project>/
├─ manifest.yaml
├─ sources/
├─ nodes/
│  ├─ BS-01-scope.md
│  ├─ BS-02-evidence.md
│  ├─ BS-03-roles.md
│  ├─ BS-04-as-is-process.md
│  ├─ BS-05-data-mapping.md
│  ├─ BS-06-glossary.md
│  ├─ BS-07-rules.md
│  ├─ BS-08-exceptions.md
│  ├─ BS-09-to-be-process.md
│  ├─ BS-10-state-model.md
│  ├─ BS-11-acceptance.md
│  └─ BS-12-readiness.md
├─ registers/
│  ├─ rules.yaml
│  ├─ questions.yaml
│  └─ decisions.yaml
└─ generated/
```

## manifest.yaml

```yaml
schema_version: bizspec/v1

project:
  id: example-project
  title: 示例业务系统
  status: discovery
  created_at: 2026-07-31T14:00:00+08:00
  updated_at: 2026-07-31T14:00:00+08:00

sources: []

workflow:
  - id: BS-01
    title: 项目范围与业务目标
    status: not_started
    depends_on: []
    blockers: []
    owner: null
    reviewers: []
    updated_at: null
    history: []
```

### project.status

建议使用：

- `discovery`
- `definition`
- `ready_with_risks`
- `ready`
- `paused`
- `closed`

项目状态不能代替节点状态。

### workflow 节点强制字段

| 字段 | 类型 | 要求 |
|---|---|---|
| `id` | string | 必须，使用 `BS-01` 格式 |
| `title` | string | 必须，不能为空 |
| `status` | enum | 必须，使用节点状态枚举 |
| `depends_on` | array | 必须，可以为空 |
| `blockers` | array | 必须，可以为空 |
| `owner` | string/null | 关键节点完成前必须有值 |
| `reviewers` | array | 必须，可以为空 |
| `updated_at` | datetime/null | 状态变化时更新 |
| `history` | array | 必须，记录状态变化 |

### history 条目

```yaml
- at: 2026-07-31T14:00:00+08:00
  from: in_progress
  to: review_required
  by: IT
  reason: 已根据真实案例完成初稿，等待业务确认
```

`reason` 不得为空。

## 节点 Markdown Front Matter

```yaml
---
id: BS-05
title: 数据源与字段映射
status: in_progress
owner: IT
reviewers:
  - 业务负责人
depends_on:
  - BS-02
inputs:
  - 实际源文件
outputs:
  - 数据源清单
  - 字段映射表
blockers: []
updated_at: 2026-07-31T14:00:00+08:00
---
```

正文固定章节：

```markdown
# 数据源与字段映射

## 节点目标
## 当前结论
## 已确认内容
## 待确认内容
## 推导与候选方案
## 阻塞项
## 产物
## 完成条件检查
## 状态变更记录
```

不得删除章节。没有内容时写“暂无”，不要隐藏缺口。

## 来源记录

每个来源至少包含：

```yaml
id: SRC-001
title: 某次业务讨论会议纪要
type: meeting_minutes
status: available
captured_at: 2026-07-31T14:00:00+08:00
business_period: null
owner: null
location: sources/SRC-001-meeting.md
notes: null
```

推荐来源类型：

- `meeting_minutes`
- `transcript`
- `excel_input`
- `excel_intermediate`
- `excel_output`
- `external_report`
- `system_export`
- `system_interface`
- `screen_recording`
- `business_confirmation`

## 通用业务条目

规则、问题、决策、术语、异常和状态定义应尽量遵循统一字段：

```yaml
id: RULE-001
title: 示例规则
status: pending_confirmation
evidence_type: source_statement
statement: 规则正文
owner: 业务负责人
source_refs:
  - source_id: SRC-001
    location: 第三章第2节
created_at: 2026-07-31T14:00:00+08:00
updated_at: 2026-07-31T14:00:00+08:00
```

### 强制字段

- `id`
- `title`
- `status`
- `evidence_type`
- 主体内容字段，例如 `statement`、`question` 或 `decision`
- `owner`，关键条目确认前必须明确
- `source_refs`

### evidence_type

- `source_statement`：来源中明确出现；
- `confirmed_decision`：有正式确认记录；
- `inference`：根据多项证据推导；
- `proposal`：IT 或 Agent 提出的候选方案；
- `open_question`：尚未回答的问题。

`confirmed` 状态通常必须配合 `confirmed_decision`。仅有 `source_statement` 时，不应轻易标记为 `confirmed`。

## rules.yaml

```yaml
schema_version: bizspec/v1
rules:
  - id: RULE-001
    title: 示例规则
    status: pending_confirmation
    evidence_type: source_statement
    statement: 示例规则正文
    scope: null
    inputs: []
    outputs: []
    examples: []
    edge_cases: []
    owner: null
    source_refs: []
    effective_from: null
    version: 1
```

## questions.yaml

```yaml
schema_version: bizspec/v1
questions:
  - id: Q-001
    title: 示例待确认事项
    status: pending_confirmation
    evidence_type: open_question
    question: 需要业务回答的具体问题
    why_it_matters: 该问题影响什么设计或规则
    blocking_nodes:
      - BS-05
    owner: null
    due_at: null
    answer: null
    source_refs: []
```

问题标题必须能在状态列表中独立表达含义，不得只写“待确认问题1”。

## decisions.yaml

```yaml
schema_version: bizspec/v1
decisions:
  - id: DEC-001
    title: 示例业务决定
    status: confirmed
    evidence_type: confirmed_decision
    decision: 已选择的方案
    rationale: 选择原因
    alternatives: []
    owner: 业务负责人
    decided_at: 2026-07-31T14:00:00+08:00
    source_refs: []
    affected_nodes:
      - BS-01
```

## 完成条件表示

节点文件使用检查项：

```yaml
completion_check:
  required_sections_present: true
  required_outputs_present: false
  critical_items_have_owner: false
  critical_blockers_resolved: false
  reviewer_confirmed: false
```

任何必填项为 `false` 时，不得将节点设置为 `done`。

`waived` 节点必须额外记录：

```yaml
waiver:
  reason: 本项目不涉及外部数据源
  approved_by: 业务负责人
  approved_at: 2026-07-31T14:00:00+08:00
```
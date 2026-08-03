# BizSpec

BizSpec 是一套面向内部 IT、Excel 业务和陌生业务领域的**业务发现与开发就绪工作流**。

它解决的不是“明确需求如何编码”，而是：业务只能描述现有工作、无法描述系统形态时，如何从会议纪要、真实样表、业务演示和最终成果中，逐步形成可确认、可追踪、可进入开发的业务规格。

## 无需克隆源码

当前仓库可以直接作为 npm Git 包执行。在需要接入 BizSpec 的项目根目录运行：

```bash
npx -y github:Hello-DaTang/BizSpec init
```

若仓库保持私有，当前电脑需要具备该 GitHub 仓库的访问凭证；仓库公开后可以匿名执行。

指定安装目标并跳过交互：

```bash
npx -y github:Hello-DaTang/BizSpec init --yes --tools codex,claude
```

只安装 Skill，不创建业务工作区：

```bash
npx -y github:Hello-DaTang/BizSpec install --tools copilot,cursor
```

更新项目中由 BizSpec 管理的 Skill：

```bash
npx -y github:Hello-DaTang/BizSpec update
```

`update` 只刷新生成的 Skill 和参考资料，不覆盖 `bizspec/` 中已经填写的会议纪要、节点、规则、问题和决策。

## 安装目录

| 工具 | 项目内目录 |
|---|---|
| Codex / ChatGPT | `.agents/skills/bizspec` |
| Claude Code | `.claude/skills/bizspec` |
| GitHub Copilot | `.github/skills/bizspec` |
| Cursor | `.cursor/skills/bizspec` |
| 通用目录 | `.skills/bizspec` |

安装选择会记录到 `.bizspec/config.json`，后续 `bizspec update` 会按原目标刷新。

## CLI 命令

```text
bizspec init [path]          安装 Skill 并初始化业务工作区
bizspec install [path]       仅安装 Skill
bizspec update [path]        更新已安装的 Skill
bizspec uninstall [path]     删除由 BizSpec 管理的 Skill，保留业务数据
bizspec uninstall --purge    同时删除业务工作区
bizspec status [path]        查看 12 个节点状态
bizspec next [path]          找出当前可推进的节点
bizspec validate [path]      校验标题、状态、节点文件和完成门禁
bizspec set-status ...       记录原因后变更节点状态
bizspec version              查看 CLI 版本
```

示例：

```bash
npx -y github:Hello-DaTang/BizSpec status
npx -y github:Hello-DaTang/BizSpec next
npx -y github:Hello-DaTang/BizSpec validate
npx -y github:Hello-DaTang/BizSpec set-status BS-01 in_progress --reason "开始业务调研"
```

## 初始化结果

```text
当前项目/
├─ .bizspec/
│  └─ config.json
├─ .agents/skills/bizspec/       # 按选择生成
├─ .claude/skills/bizspec/       # 按选择生成
├─ .github/skills/bizspec/       # 按选择生成
├─ .cursor/skills/bizspec/       # 按选择生成
└─ bizspec/
   ├─ manifest.yaml
   ├─ sources/
   ├─ nodes/
   ├─ registers/
   │  ├─ rules.yaml
   │  ├─ questions.yaml
   │  └─ decisions.yaml
   └─ generated/
```

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

## npm 正式发布

仓库已经包含 `release.yml`。推送版本标签后会：

1. 运行 Node.js 测试；
2. 校验标签与 `package.json` 版本一致；
3. 生成 npm tarball；
4. 创建 GitHub Release；
5. 当仓库配置了 `NPM_TOKEN` 时发布 `@hello-datang/bizspec`。

完成 npm scope 和 Token 配置后，用户可以改用：

```bash
npx -y @hello-datang/bizspec init
```

## 核心原则

- 先还原业务事实，再设计系统页面。
- 以真实案例贯穿输入、处理、异常、确认和输出。
- 每个流程节点必须具有 `id`、`title`、`status` 和完成条件。
- 节点状态与节点内部业务条目状态分开管理。
- 会议表述、已确认结论、AI 推导和待确认事项必须明确区分。
- IT 可以整理和提出方案，但不得替业务定义 BOM、核算口径、责任归属等业务规则。
- 未满足完成条件的节点不得标记为 `done`。

BizSpec 完成后，可以将已确认内容继续输入 OpenSpec、技术设计或编码 Agent。

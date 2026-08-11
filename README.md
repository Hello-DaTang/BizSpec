# BizSpec

BizSpec 是一套面向内部 IT、Excel 业务和陌生业务领域的**业务发现与开发就绪工作流**。

它解决的不是“明确需求如何编码”，而是：业务只能描述现有工作、无法描述系统形态时，如何从会议纪要、真实样表、业务演示和最终成果中，逐步形成可确认、可追踪、可进入开发的业务规格。

## 无需克隆源码

在需要接入 BizSpec 的项目根目录运行：

```bash
npx -y github:Hello-DaTang/BizSpec init
```

指定安装目标并跳过交互：

```bash
npx -y github:Hello-DaTang/BizSpec init --yes --tools codex,claude
```

只安装 Skill，不创建新的业务节点：

```bash
npx -y github:Hello-DaTang/BizSpec install --tools copilot,cursor
```

更新项目中由 BizSpec 管理的 Skill：

```bash
npx -y github:Hello-DaTang/BizSpec update
```

`update` 只刷新生成的 Skill 和参考资料，不覆盖 `bizspec/` 中已经填写的会议纪要、节点、规则、问题和决策。

## 安装目录

| 工具 | 项目内目录 | 说明 |
|---|---|---|
| Codex / ChatGPT | `.agents/skills/bizspec` | OpenAI 当前官方仓库级 Skill 目录 |
| Codex 兼容模式 | `.codex/skills/bizspec` | 兼容 OpenSpec 等仍使用 `.codex/skills` 的工具 |
| Claude Code | `.claude/skills/bizspec` | Claude 项目 Skill |
| GitHub Copilot | `.github/skills/bizspec` | Copilot 项目 Skill |
| Cursor | `.cursor/skills/bizspec` | Cursor 项目 Skill |
| 通用目录 | `.skills/bizspec` | 其他兼容 Agent Skills 的工具 |

使用 OpenAI 官方 Codex 目录：

```bash
npx -y github:Hello-DaTang/BizSpec init --yes --tools codex,copilot
```

需要与 OpenSpec 的 `.codex/skills` 布局保持一致时：

```bash
npx -y github:Hello-DaTang/BizSpec init --yes --tools codex-compat,copilot
```

别名 `codex-legacy` 和 `codex-openspec` 也会解析为 `codex-compat`。

## `bizspec/config.json` 的作用

`config.json` 是 CLI 的安装状态，不是业务需求内容。它记录：

- 当前 BizSpec CLI 版本；
- 业务工作区目录；
- 已选择的 AI 工具；
- 每个 Skill 的安装路径；
- 安装和更新时间。

这些信息用于安全执行 `update` 和 `uninstall`，避免扫描项目后误删用户自己的目录。

旧版本生成的 `.bizspec/config.json` 会在首次读取配置时自动迁移到 `bizspec/config.json`，随后删除根目录 `.bizspec`。

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

## 初始化结果

```text
当前项目/
├─ .agents/skills/bizspec/       # --tools codex
├─ .codex/skills/bizspec/        # --tools codex-compat，可选
├─ .claude/skills/bizspec/       # 按选择生成
├─ .github/skills/bizspec/       # 按选择生成
├─ .cursor/skills/bizspec/       # 按选择生成
└─ bizspec/
   ├─ config.json
   ├─ manifest.yaml
   ├─ sources/
   ├─ nodes/
   ├─ registers/
   │  ├─ rules.yaml
   │  ├─ questions.yaml
   │  └─ decisions.yaml
   └─ generated/
```

## TypeScript 源码

BizSpec CLI 现在只维护一套 TypeScript 实现：

```text
src/
├─ bin.ts          CLI 入口
├─ cli.ts          参数解析与命令调度
├─ project.ts      12 节点工作流、状态和完成门禁
├─ skills.ts       Skill 安装、更新、卸载与配置迁移
├─ files.ts        文件系统与 front matter 工具
├─ yaml-lite.ts    BizSpec 自用的轻量 YAML 解析/输出
├─ constants.ts    节点与工具目录常量
└─ types.ts        领域类型、状态 union、配置接口

test/
└─ cli.test.ts     TypeScript 端到端测试
```

不再维护 Python CLI 和手写 JavaScript 业务实现。TypeScript 是唯一源码真相；`dist/` 仅是 `tsc` 生成的运行产物。

开发时：

```bash
npm install
npm run typecheck
npm test
npm run build
```

通过 `github:Hello-DaTang/BizSpec` 安装时，npm 会执行 `prepare`，先把 TypeScript 编译到 `dist/`，再运行 CLI。因此最终用户仍然只需要 Node.js，不需要 Python，也不需要手动安装 TypeScript。

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

## 核心原则

- 先还原业务事实，再设计系统页面。
- 以真实案例贯穿输入、处理、异常、确认和输出。
- 每个流程节点必须具有 `id`、`title`、`status` 和完成条件。
- 节点状态与节点内部业务条目状态分开管理。
- 会议表述、已确认结论、AI 推导和待确认事项必须明确区分。
- IT 可以整理和提出方案，但不得替业务定义 BOM、核算口径、责任归属等业务规则。
- 未满足完成条件的节点不得标记为 `done`。

## npm 正式发布

仓库包含 `release.yml`。推送与 `package.json` 版本一致的标签后会：

1. 安装 TypeScript 开发依赖；
2. 类型检查并执行测试；
3. 编译 `src/` 到 `dist/`；
4. 生成 npm tarball；
5. 创建 GitHub Release；
6. 当仓库配置了 `NPM_TOKEN` 时发布 `@hello-datang/bizspec`。

发布后可直接使用：

```bash
npx -y @hello-datang/bizspec init
```

BizSpec 完成后，可以将已确认内容继续输入 OpenSpec、技术设计或编码 Agent。

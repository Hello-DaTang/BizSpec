#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError as exc:
    raise SystemExit(
        "PyYAML is required. Install it with: pip install -r requirements.txt"
    ) from exc


SCHEMA_VERSION = "bizspec/v1"
NODE_STATUSES = {
    "not_started",
    "in_progress",
    "blocked",
    "review_required",
    "done",
    "waived",
}
TERMINAL_NODE_STATUSES = {"done", "waived"}

NODE_CATALOG: list[dict[str, Any]] = [
    {
        "id": "BS-01",
        "title": "项目范围与业务目标",
        "filename": "BS-01-scope.md",
        "depends_on": [],
    },
    {
        "id": "BS-02",
        "title": "业务资料与真实案例",
        "filename": "BS-02-evidence.md",
        "depends_on": ["BS-01"],
    },
    {
        "id": "BS-03",
        "title": "角色与业务责任",
        "filename": "BS-03-roles.md",
        "depends_on": ["BS-01"],
    },
    {
        "id": "BS-04",
        "title": "当前业务流程还原",
        "filename": "BS-04-as-is-process.md",
        "depends_on": ["BS-02", "BS-03"],
    },
    {
        "id": "BS-05",
        "title": "数据源与字段映射",
        "filename": "BS-05-data-mapping.md",
        "depends_on": ["BS-02"],
    },
    {
        "id": "BS-06",
        "title": "业务术语与数据字典",
        "filename": "BS-06-glossary.md",
        "depends_on": ["BS-02", "BS-05"],
    },
    {
        "id": "BS-07",
        "title": "业务规则与计算规则",
        "filename": "BS-07-rules.md",
        "depends_on": ["BS-05", "BS-06"],
    },
    {
        "id": "BS-08",
        "title": "异常场景与处理方式",
        "filename": "BS-08-exceptions.md",
        "depends_on": ["BS-04", "BS-07"],
    },
    {
        "id": "BS-09",
        "title": "目标业务流程",
        "filename": "BS-09-to-be-process.md",
        "depends_on": ["BS-04", "BS-08"],
    },
    {
        "id": "BS-10",
        "title": "业务对象状态模型",
        "filename": "BS-10-state-model.md",
        "depends_on": ["BS-09"],
    },
    {
        "id": "BS-11",
        "title": "第一阶段范围与验收场景",
        "filename": "BS-11-acceptance.md",
        "depends_on": ["BS-09", "BS-10"],
    },
    {
        "id": "BS-12",
        "title": "开发就绪检查",
        "filename": "BS-12-readiness.md",
        "depends_on": ["BS-05", "BS-07", "BS-08", "BS-10", "BS-11"],
    },
]

NODE_BY_ID = {node["id"]: node for node in NODE_CATALOG}


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def yaml_dump(data: Any) -> str:
    return yaml.safe_dump(
        data,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )


def write_yaml(path: Path, data: Any) -> None:
    path.write_text(yaml_dump(data), encoding="utf-8")


def read_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Missing file: {path}")
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Expected a YAML mapping: {path}")
    return data


def node_front_matter(node: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": node["id"],
        "title": node["title"],
        "status": "not_started",
        "owner": None,
        "reviewers": [],
        "depends_on": list(node["depends_on"]),
        "inputs": [],
        "outputs": [],
        "blockers": [],
        "completion_check": {
            "required_sections_present": True,
            "required_outputs_present": False,
            "critical_items_have_owner": False,
            "critical_blockers_resolved": False,
            "reviewer_confirmed": False,
        },
        "updated_at": None,
    }


def render_node_file(node: dict[str, Any]) -> str:
    front_matter = yaml_dump(node_front_matter(node)).rstrip()
    title = node["title"]
    return f"""---
{front_matter}
---

# {title}

## 节点目标

待补充。

## 当前结论

暂无。

## 已确认内容

暂无。

## 待确认内容

暂无。

## 推导与候选方案

暂无。

## 阻塞项

暂无。

## 产物

暂无。

## 完成条件检查

- [ ] 必填章节完整；
- [ ] 必填产物存在；
- [ ] 关键条目具有业务 Owner；
- [ ] 关键阻塞项已解决；
- [ ] 需要复核的内容已有确认记录。

## 状态变更记录

暂无。
"""


def parse_markdown_front_matter(path: Path) -> tuple[dict[str, Any], str]:
    text = path.read_text(encoding="utf-8")
    match = re.match(r"\A---\s*\n(.*?)\n---\s*\n?", text, flags=re.DOTALL)
    if not match:
        raise ValueError(f"Missing YAML front matter: {path}")
    meta = yaml.safe_load(match.group(1))
    if not isinstance(meta, dict):
        raise ValueError(f"Invalid YAML front matter: {path}")
    body = text[match.end() :]
    return meta, body


def write_markdown_front_matter(
    path: Path, meta: dict[str, Any], body: str
) -> None:
    path.write_text(
        f"---\n{yaml_dump(meta).rstrip()}\n---\n\n{body.lstrip()}",
        encoding="utf-8",
    )


def project_paths(project_dir: Path) -> dict[str, Path]:
    return {
        "root": project_dir,
        "manifest": project_dir / "manifest.yaml",
        "nodes": project_dir / "nodes",
        "sources": project_dir / "sources",
        "registers": project_dir / "registers",
        "generated": project_dir / "generated",
    }


def init_project(args: argparse.Namespace) -> int:
    root = Path(args.project_dir).resolve()
    paths = project_paths(root)
    manifest_path = paths["manifest"]

    if manifest_path.exists() and not args.force:
        print(
            f"Refusing to overwrite existing project: {manifest_path}\n"
            "Use --force only when you intentionally want to regenerate scaffold files.",
            file=sys.stderr,
        )
        return 2

    for key in ("root", "nodes", "sources", "registers", "generated"):
        paths[key].mkdir(parents=True, exist_ok=True)

    created_at = now_iso()
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "project": {
            "id": args.id,
            "title": args.title,
            "status": "discovery",
            "created_at": created_at,
            "updated_at": created_at,
        },
        "sources": [],
        "workflow": [
            {
                "id": node["id"],
                "title": node["title"],
                "status": "not_started",
                "depends_on": list(node["depends_on"]),
                "blockers": [],
                "owner": None,
                "reviewers": [],
                "updated_at": None,
                "history": [],
            }
            for node in NODE_CATALOG
        ],
    }
    write_yaml(manifest_path, manifest)

    for node in NODE_CATALOG:
        node_path = paths["nodes"] / node["filename"]
        if not node_path.exists() or args.force:
            node_path.write_text(render_node_file(node), encoding="utf-8")

    write_yaml(
        paths["registers"] / "rules.yaml",
        {"schema_version": SCHEMA_VERSION, "rules": []},
    )
    write_yaml(
        paths["registers"] / "questions.yaml",
        {"schema_version": SCHEMA_VERSION, "questions": []},
    )
    write_yaml(
        paths["registers"] / "decisions.yaml",
        {"schema_version": SCHEMA_VERSION, "decisions": []},
    )

    print(f"Initialized BizSpec project: {root}")
    print(f"Project: {args.id} — {args.title}")
    return 0


def load_manifest(project_dir: str) -> tuple[Path, dict[str, Any]]:
    root = Path(project_dir).resolve()
    manifest_path = root / "manifest.yaml"
    return root, read_yaml(manifest_path)


def workflow_index(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    workflow = manifest.get("workflow")
    if not isinstance(workflow, list):
        raise ValueError("manifest.workflow must be a list")
    result: dict[str, dict[str, Any]] = {}
    for item in workflow:
        if not isinstance(item, dict):
            raise ValueError("Every workflow item must be a mapping")
        node_id = item.get("id")
        if not isinstance(node_id, str) or not node_id:
            raise ValueError("Every workflow item must have a non-empty id")
        result[node_id] = item
    return result


def print_status(args: argparse.Namespace) -> int:
    _, manifest = load_manifest(args.project_dir)
    project = manifest.get("project", {})
    print(f"{project.get('title', '(untitled)')} [{project.get('status', 'unknown')}]")
    print()
    print(f"{'ID':<6} {'STATUS':<16} TITLE")
    print("-" * 72)
    for item in manifest.get("workflow", []):
        blockers = item.get("blockers") or []
        suffix = f"  blockers={len(blockers)}" if blockers else ""
        print(
            f"{str(item.get('id', '')):<6} "
            f"{str(item.get('status', '')):<16} "
            f"{item.get('title', '')}{suffix}"
        )
    return 0


def dependencies_satisfied(
    node: dict[str, Any], index: dict[str, dict[str, Any]]
) -> bool:
    for dep in node.get("depends_on") or []:
        dep_node = index.get(dep)
        if not dep_node or dep_node.get("status") not in TERMINAL_NODE_STATUSES:
            return False
    return True


def next_node(args: argparse.Namespace) -> int:
    _, manifest = load_manifest(args.project_dir)
    index = workflow_index(manifest)

    priority = {
        "in_progress": 0,
        "review_required": 1,
        "not_started": 2,
        "blocked": 3,
    }
    candidates: list[dict[str, Any]] = []
    for node in manifest["workflow"]:
        status = node.get("status")
        if status in TERMINAL_NODE_STATUSES:
            continue
        if node.get("blockers"):
            continue
        if dependencies_satisfied(node, index):
            candidates.append(node)

    if candidates:
        candidates.sort(key=lambda item: (priority.get(item.get("status"), 9), item["id"]))
        node = candidates[0]
        print(f"{node['id']} {node['title']} [{node['status']}]")
        return 0

    blocked = [
        node
        for node in manifest["workflow"]
        if node.get("status") not in TERMINAL_NODE_STATUSES
    ]
    if not blocked:
        print("All BizSpec nodes are done or waived.")
        return 0

    print("No node is currently actionable.")
    for node in blocked:
        reasons: list[str] = []
        if node.get("blockers"):
            reasons.extend(str(item) for item in node["blockers"])
        unmet = [
            dep
            for dep in node.get("depends_on") or []
            if index.get(dep, {}).get("status") not in TERMINAL_NODE_STATUSES
        ]
        if unmet:
            reasons.append("unmet dependencies: " + ", ".join(unmet))
        print(f"- {node['id']} {node['title']}: {'; '.join(reasons) or 'unknown blocker'}")
    return 1


def validate_completion(meta: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    checks = meta.get("completion_check")
    if not isinstance(checks, dict):
        return ["completion_check must be a mapping"]
    for key in (
        "required_sections_present",
        "required_outputs_present",
        "critical_items_have_owner",
        "critical_blockers_resolved",
        "reviewer_confirmed",
    ):
        if checks.get(key) is not True:
            errors.append(f"completion_check.{key} must be true")
    if meta.get("blockers"):
        errors.append("blockers must be empty before status=done")
    return errors


def validate_project(args: argparse.Namespace) -> int:
    root, manifest = load_manifest(args.project_dir)
    errors: list[str] = []

    if manifest.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"manifest.schema_version must be {SCHEMA_VERSION!r}")

    project = manifest.get("project")
    if not isinstance(project, dict):
        errors.append("manifest.project must be a mapping")
    else:
        for field in ("id", "title", "status"):
            if not project.get(field):
                errors.append(f"manifest.project.{field} is required")

    try:
        index = workflow_index(manifest)
    except ValueError as exc:
        errors.append(str(exc))
        index = {}

    for expected in NODE_CATALOG:
        node_id = expected["id"]
        item = index.get(node_id)
        if not item:
            errors.append(f"missing workflow node: {node_id}")
            continue
        if not item.get("title"):
            errors.append(f"{node_id}.title is required")
        if item.get("title") != expected["title"]:
            errors.append(
                f"{node_id}.title must be {expected['title']!r}, "
                f"got {item.get('title')!r}"
            )
        if item.get("status") not in NODE_STATUSES:
            errors.append(f"{node_id}.status is invalid: {item.get('status')!r}")

        node_path = root / "nodes" / expected["filename"]
        if not node_path.exists():
            errors.append(f"missing node file: {node_path}")
            continue
        try:
            meta, _ = parse_markdown_front_matter(node_path)
        except (ValueError, yaml.YAMLError) as exc:
            errors.append(str(exc))
            continue

        for field in ("id", "title", "status"):
            if not meta.get(field):
                errors.append(f"{node_path.name}: front matter {field} is required")
        if meta.get("id") != node_id:
            errors.append(f"{node_path.name}: id does not match {node_id}")
        if meta.get("title") != item.get("title"):
            errors.append(f"{node_path.name}: title does not match manifest")
        if meta.get("status") != item.get("status"):
            errors.append(f"{node_path.name}: status does not match manifest")

        if item.get("status") == "done":
            for message in validate_completion(meta):
                errors.append(f"{node_id}: {message}")
            unmet = [
                dep
                for dep in item.get("depends_on") or []
                if index.get(dep, {}).get("status") not in TERMINAL_NODE_STATUSES
            ]
            if unmet:
                errors.append(f"{node_id}: done node has unmet dependencies: {', '.join(unmet)}")

        if item.get("status") == "waived":
            waiver = meta.get("waiver")
            if not isinstance(waiver, dict):
                errors.append(f"{node_id}: waived node requires waiver metadata")
            else:
                for field in ("reason", "approved_by", "approved_at"):
                    if not waiver.get(field):
                        errors.append(f"{node_id}: waiver.{field} is required")

    if args.node:
        prefix = f"{args.node}:"
        errors = [
            error
            for error in errors
            if error.startswith(prefix) or args.node in error or "manifest" in error
        ]

    if errors:
        print("Validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    scope = args.node or "project"
    print(f"Validation passed: {scope}")
    return 0


def set_status(args: argparse.Namespace) -> int:
    root, manifest = load_manifest(args.project_dir)
    index = workflow_index(manifest)

    if args.node_id not in NODE_BY_ID or args.node_id not in index:
        print(f"Unknown node: {args.node_id}", file=sys.stderr)
        return 2
    if args.status not in NODE_STATUSES:
        print(f"Invalid status: {args.status}", file=sys.stderr)
        return 2

    node = index[args.node_id]
    catalog_node = NODE_BY_ID[args.node_id]
    node_path = root / "nodes" / catalog_node["filename"]
    meta, body = parse_markdown_front_matter(node_path)

    if args.status == "done":
        completion_errors = validate_completion(meta)
        if completion_errors:
            print("Cannot mark node as done:", file=sys.stderr)
            for error in completion_errors:
                print(f"- {error}", file=sys.stderr)
            return 1
        unmet = [
            dep
            for dep in node.get("depends_on") or []
            if index.get(dep, {}).get("status") not in TERMINAL_NODE_STATUSES
        ]
        if unmet:
            print(
                "Cannot mark node as done; unmet dependencies: " + ", ".join(unmet),
                file=sys.stderr,
            )
            return 1

    previous = node.get("status")
    changed_at = now_iso()
    node["status"] = args.status
    node["updated_at"] = changed_at
    history = node.setdefault("history", [])
    history.append(
        {
            "at": changed_at,
            "from": previous,
            "to": args.status,
            "by": args.by,
            "reason": args.reason,
        }
    )

    manifest["project"]["updated_at"] = changed_at
    meta["status"] = args.status
    meta["updated_at"] = changed_at
    write_markdown_front_matter(node_path, meta, body)
    write_yaml(root / "manifest.yaml", manifest)

    print(f"Updated {args.node_id} {node['title']}: {previous} -> {args.status}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="bizspec",
        description="Initialize and validate stateful BizSpec workspaces.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_cmd = subparsers.add_parser("init", help="Initialize a BizSpec workspace")
    init_cmd.add_argument("project_dir")
    init_cmd.add_argument("--id", required=True, help="Stable project identifier")
    init_cmd.add_argument("--title", required=True, help="Required project title")
    init_cmd.add_argument("--force", action="store_true")
    init_cmd.set_defaults(func=init_project)

    status_cmd = subparsers.add_parser("status", help="Show workflow status")
    status_cmd.add_argument("project_dir")
    status_cmd.set_defaults(func=print_status)

    next_cmd = subparsers.add_parser("next", help="Show the next actionable node")
    next_cmd.add_argument("project_dir")
    next_cmd.set_defaults(func=next_node)

    validate_cmd = subparsers.add_parser(
        "validate", help="Validate manifest, node titles, statuses and completion gates"
    )
    validate_cmd.add_argument("project_dir")
    validate_cmd.add_argument("--node", choices=sorted(NODE_BY_ID))
    validate_cmd.set_defaults(func=validate_project)

    set_status_cmd = subparsers.add_parser(
        "set-status", help="Update a node status and append audit history"
    )
    set_status_cmd.add_argument("project_dir")
    set_status_cmd.add_argument("node_id", choices=sorted(NODE_BY_ID))
    set_status_cmd.add_argument("status", choices=sorted(NODE_STATUSES))
    set_status_cmd.add_argument("--by", required=True)
    set_status_cmd.add_argument("--reason", required=True)
    set_status_cmd.set_defaults(func=set_status)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return int(args.func(args))
    except (FileNotFoundError, ValueError, yaml.YAMLError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

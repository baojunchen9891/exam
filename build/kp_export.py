#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
kp_export.py — 导出待标注题目（阶段0 标注流程第1步）

从 index.json 选出 GESP C++ L4/L5 真题，抽出每题的题干/选项，生成
data/kp/annotate_input.json，供教研填写 kp_ids / primary_kp。

用法（在项目根目录 exam-site/ 下）:
    python build/kp_export.py            # 默认导出 gesp-cpp L4/L5
    python build/kp_export.py --level 4  # 仅 L4
    python build/kp_export.py --paper lele-838 lele-787  # 指定卷
    python build/kp_export.py --dry      # 仅打印将导出的卷与题数

输出: data/kp/annotate_input.json
"""
import json, os, sys, argparse, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "dist/data/index.json")
PAPERS = os.path.join(ROOT, "dist/data/papers")
OUT = os.path.join(ROOT, "data/kp", "annotate_input.json")


def flatten_text(node):
    """stem/options 是 [{t:...}] 结构，压成纯文本。"""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return "".join(flatten_text(x) for x in node)
    if isinstance(node, dict):
        return flatten_text(node.get("t", ""))
    return str(node)


def is_none_answer(a):
    """answer 为 'None' 字面量（编程大题/问答，无单选项）时忽略标注。"""
    return str(a).strip().lower() == "none"


def load_targets(levels, paper_ids):
    idx = json.load(open(INDEX, encoding="utf-8"))
    if paper_ids:
        return [it for it in idx if it["id"] in paper_ids]
    return [it for it in idx
            if it.get("subject") == "gesp-cpp" and int(it.get("level", 0)) in levels]


def load_existing(path):
    """读旧 annotate_input.json，建 (paperId, idx)->已有标注 映射，用于保留已确认标注。"""
    if not os.path.exists(path):
        return {}
    try:
        d = json.load(open(path, encoding="utf-8"))
    except Exception:
        return {}
    m = {}
    for it in d.get("items", []):
        m[(it.get("paperId"), it.get("idx"))] = it
    return m


def export(levels, paper_ids, dry=False, keep_existing=False):
    targets = load_targets(levels, paper_ids)
    existing = load_existing(OUT) if keep_existing else {}
    items = []
    skipped_none = 0
    kept = 0
    for it in targets:
        pid = it["id"]
        p = os.path.join(PAPERS, pid + ".json")
        if not os.path.exists(p):
            print("  [skip] 试卷文件缺失:", pid, file=sys.stderr)
            continue
        d = json.load(open(p, encoding="utf-8"))
        lvl = int(d.get("level", it.get("level", 0)))
        for i, q in enumerate(d.get("questions", [])):
            ans = q.get("answer", "")
            if is_none_answer(ans):
                skipped_none += 1
                continue
            opts = [flatten_text(o.get("content", "")) for o in q.get("options", [])]
            ex = existing.get((pid, i))
            if ex and (ex.get("kp_ids") or []):
                # 保留已标注（含已确认的 L4/L5）
                kp_ids = ex.get("kp_ids", [])
                primary = ex.get("primary_kp")
                备注 = ex.get("备注", "历史标注-保留")
                kept += 1
            else:
                kp_ids = q.get("kp_ids", []) or []
                primary = q.get("primary_kp", None)
                备注 = ""
            items.append({
                "paperId": pid,
                "level": lvl,
                "idx": i,
                "qNo": q.get("no"),
                "type": q.get("type", ""),
                "stem": flatten_text(q.get("stem", "")),
                "options": opts,
                "answer": ans,
                "kp_ids": kp_ids,
                "primary_kp": primary,
                "备注": 备注,
            })
    print("导出卷数: %d | 题目数: %d" % (len(targets), len(items)))
    print("  排除 answer=None 题: %d | 保留已有标注: %d" % (skipped_none, kept))
    if dry:
        return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "subject": "gesp-cpp",
        "note": "教研填写每题 kp_ids(考点id数组) 与 primary_kp(主考点)；填空表示未归类需复核。填完跑 kp_backfill.py。answer=None 的题(编程大题)已排除，不参与标注。",
        "items": items,
    }, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("已写出:", OUT)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--level", type=int, nargs="*", default=list(range(1, 9)),
                    help="目标级别（默认 1-8 全级）")
    ap.add_argument("--paper", nargs="*", default=[])
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--keep-existing", action="store_true",
                    help="保留旧 annotate_input.json 中已有的 kp_ids/primary_kp（默认关闭，全量重建）")
    a = ap.parse_args()
    export(a.level, a.paper, a.dry, a.keep_existing)

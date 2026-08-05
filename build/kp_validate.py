#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""教研标注自检：跑 kp_backfill.py 之前，先校验 annotate_input.json 的填写质量。

用法：
  python build/kp_validate.py                  # 默认读 data/kp/annotate_input.json
  python build/kp_validate.py --input X.json
  python build/kp_validate.py --strict        # 把"未归类"也当错误（要求 100% 标注）
  python build/kp_validate.py --min-coverage 0.95

退出码：0 = 无错误（警告可忽略）；1 = 存在错误（kp_id 非法 / primary 不在 kp_ids / 跨级 / 覆盖率不足）。
"""
import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KP_DIR = os.path.join(ROOT, "data", "kp")


def load_kp_pool():
    """返回 {kp_id: (level, name)}，动态加载所有 gesp-cpp-L*.json 标准池。"""
    pool = {}
    for fn in sorted(os.listdir(KP_DIR)):
        if fn.startswith("gesp-cpp-L") and fn.endswith(".json"):
            lvl = int(fn.split("L", 1)[1].split(".")[0])
            p = os.path.join(KP_DIR, fn)
            d = json.load(open(p, encoding="utf-8"))
            for k in d.get("kp", []):
                pool[k["id"]] = (lvl, k.get("name", ""))
    return pool


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default=os.path.join(KP_DIR, "annotate_input.json"))
    ap.add_argument("--strict", action="store_true", help="未归类(空 kp_ids)视为错误")
    ap.add_argument("--min-coverage", type=float, default=0.9,
                    help="每卷最低标注覆盖率阈值(默认0.9)")
    args = ap.parse_args()

    pool = load_kp_pool()
    if not pool:
        print("[错误] 未加载到考点标准池，请确认 data/kp/gesp-cpp-L*.json 存在")
        return 1
    if not os.path.exists(args.input):
        print(f"[错误] 标注文件不存在: {args.input}")
        return 1

    data = json.load(open(args.input, encoding="utf-8"))
    items = data.get("items", [])

    errors, warns = [], []
    per_paper = {}      # paperId -> [total, tagged]
    seen_idx = set()

    for it in items:
        pid, lvl, idx = it.get("paperId"), it.get("level"), it.get("idx")
        key = (pid, idx)
        if key in seen_idx:
            errors.append(f"[{pid}#{idx}] 重复 idx（导出顺序异常）")
        seen_idx.add(key)

        per_paper.setdefault(pid, [0, 0])
        per_paper[pid][0] += 1

        kp_ids = it.get("kp_ids") or []
        primary = it.get("primary_kp")
        if not isinstance(kp_ids, list):
            errors.append(f"[{pid}#{idx}] kp_ids 必须是数组")
            kp_ids = []
        for k in kp_ids:
            if k not in pool:
                errors.append(f"[{pid}#{idx}] 非法 kp_id: {k}（不在 L4/L5 标准内）")
        for k in kp_ids:
            if lvl and pool.get(k) and pool[k][0] != lvl:
                errors.append(f"[{pid}#{idx}] kp_id={k} 属 L{pool[k][0]}，与题目 L{lvl} 不匹配")
        if primary is not None:
            if primary not in kp_ids:
                errors.append(f"[{pid}#{idx}] primary_kp={primary} 不在 kp_ids 内")
            elif lvl and pool.get(primary) and pool[primary][0] != lvl:
                errors.append(f"[{pid}#{idx}] primary_kp={primary} 属 L{pool[primary][0]}，与题目 L{lvl} 不匹配")

        if kp_ids:
            per_paper[pid][1] += 1
        else:
            warns.append(f"[{pid}#{idx}] 未归类（kp_ids 为空，需复核）")

    for pid, (tot, tagged) in per_paper.items():
        cov = (tagged / tot) if tot else 0
        if cov < args.min_coverage:
            msg = f"[{pid}] 标注覆盖率 {cov*100:.0f}%（{tagged}/{tot}）低于阈值 {args.min_coverage*100:.0f}%"
            (errors if args.strict else warns).append(msg)

    print(f"标注文件: {args.input}")
    print(f"题目总数: {len(items)}  试卷数: {len(per_paper)}")
    tagged_total = sum(v[1] for v in per_paper.values())
    print(f"已标注: {tagged_total}  未归类: {len(items) - tagged_total}")
    print("-" * 40)
    if warns:
        print(f"[警告 {len(warns)} 条]（不影响回填，但建议复核）")
        for w in warns[:50]:
            print("  - " + w)
        if len(warns) > 50:
            print(f"  ... 其余 {len(warns) - 50} 条省略")
    if errors:
        print(f"[错误 {len(errors)} 条]")
        for e in errors[:50]:
            print("  x " + e)
        if len(errors) > 50:
            print(f"  ... 其余 {len(errors) - 50} 条省略")
        print("\n存在错误，请修正后再跑 kp_backfill.py")
        return 1
    print("校验通过，可运行 kp_backfill.py 回填。")
    return 0


if __name__ == "__main__":
    sys.exit(main())

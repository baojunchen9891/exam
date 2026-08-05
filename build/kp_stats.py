#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
kp_stats.py — 生成考点权重与索引（阶段0 标注流程第3步）

扫描 dist/data/papers/lele-*.json，汇总每考点出现频次，输出:
    dist/data/kp_weight.json  — 每考点 count / ratio(同前缀内归一) / papers / name
    dist/data/kp_index.json   — 每考点 -> 含该考点的 paperId 列表

kp_weight.json 的 ratio 按 id 前缀(cpp4-/cpp5-)分组归一，因为 L4/L5 是不同考试。

用法:
    python build/kp_stats.py
    python build/kp_stats.py --min-count 1   # 过滤低频考点
"""
import json, os, sys, argparse, glob
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAPERS = os.path.join(ROOT, "dist/data/papers")
KP_DIR = os.path.join(ROOT, "data/kp")
OUT_W = os.path.join(ROOT, "dist/data/kp_weight.json")
OUT_I = os.path.join(ROOT, "dist/data/kp_index.json")

def load_kp_meta():
    meta = {}
    for fn in os.listdir(KP_DIR):
        if fn.startswith("gesp-cpp-L") and fn.endswith(".json"):
            d = json.load(open(os.path.join(KP_DIR, fn), encoding="utf-8"))
            for k in d.get("kp", []):
                meta[k["id"]] = {"name": k.get("name", ""), "category": k.get("category", ""),
                                  "subject": d.get("subject", ""), "level": d.get("level", 0)}
    return meta

def main(min_count=1):
    meta = load_kp_meta()
    count = defaultdict(int)
    papers_of = defaultdict(set)
    total_by_prefix = defaultdict(int)
    scanned = 0
    for path in glob.glob(os.path.join(PAPERS, "lele-*.json")):
        try:
            d = json.load(open(path, encoding="utf-8"))
        except Exception as e:
            print("  [skip] 解析失败:", os.path.basename(path), e, file=sys.stderr)
            continue
        scanned += 1
        pid = d.get("id", os.path.splitext(os.path.basename(path))[0])
        for q in d.get("questions", []):
            for k in (q.get("kp_ids") or []):
                if not k:
                    continue
                prefix = k.rsplit("-", 1)[0]  # cpp4-kp01 -> cpp4
                count[k] += 1
                total_by_prefix[prefix] += 1
                papers_of[k].add(pid)
    weight = {}
    # 先填真实命中的考点
    for k, c in count.items():
        prefix = k.rsplit("-", 1)[0]
        denom = total_by_prefix[prefix] or 1
        m = meta.get(k, {})
        weight[k] = {
            "count": c,
            "ratio": round(c / denom, 4),
            "papers": sorted(papers_of[k]),
            "name": m.get("name", ""),
            "category": m.get("category", ""),
            "subject": m.get("subject", ""),
            "level": m.get("level", 0),
        }
    # 补齐标准考点池里未命中（当前卷未考到）的考点：count=0 / ratio=0，
    # 保证 kp_weight.json 覆盖全部标准考点，规则引擎不会因缺少权重而静默返回 0。
    for kid, m in meta.items():
        if kid not in weight:
            prefix = kid.rsplit("-", 1)[0]
            weight[kid] = {
                "count": 0,
                "ratio": 0,
                "papers": [],
                "name": m.get("name", ""),
                "category": m.get("category", ""),
                "subject": m.get("subject", ""),
                "level": m.get("level", 0),
            }
    # 过滤（注意：min_count>1 可能把未命中考点也过滤掉，按需使用）
    if min_count > 1:
        weight = {k: v for k, v in weight.items() if v["count"] >= min_count}
    kp_index = {k: sorted(papers_of[k]) for k in weight}
    os.makedirs(os.path.dirname(OUT_W), exist_ok=True)
    json.dump(weight, open(OUT_W, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(kp_index, open(OUT_I, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("扫描试卷: %d | 标准考点池: %d | 命中: %d | 未命中(补齐为0): %d"
          % (scanned, len(meta), len(count), len(meta) - len(count)))
    for prefix in sorted(total_by_prefix):
        n = sum(1 for k in weight if k.rsplit("-", 1)[0] == prefix)
        print("  %s: 出现次数合计 %d, 考点数 %d" % (prefix, total_by_prefix[prefix], n))
    print("写出:", OUT_W)
    print("写出:", OUT_I)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-count", type=int, default=1)
    a = ap.parse_args()
    main(a.min_count)

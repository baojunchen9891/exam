#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 AI 预标注分块 TSV（全 8 级通用）。

每个分块：
  - 文件头注入该级别的考点清单（id + name + category），约束 Agent 只能从本级别选
  - 每行一题，含复合主键 (paperId, idx)，避免多卷 idx 塌缩
  - 仅包含"待标注"的题（kp_ids 为空），已标的跳过
  - 块大小 CHUNK=70，控制 Agent 上下文
输出到 data/kp/ai_chunks/，并写 meta.json
"""
import json
import os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "kp", "annotate_input.json")
KP_DIR = os.path.join(ROOT, "data", "kp")
OUTDIR = os.path.join(ROOT, "data", "kp", "ai_chunks")
CHUNK = 70
os.makedirs(OUTDIR, exist_ok=True)


def cap(s, n):
    s = str(s).replace("\n", " ").replace("\r", " ").replace("\t", " ")
    s = " ".join(s.split())
    return s if len(s) <= n else s[:n] + "..."


def load_kp_index():
    idx = {}
    for lvl in range(1, 9):
        p = os.path.join(KP_DIR, f"gesp-cpp-L{lvl}.json")
        if os.path.exists(p):
            d = json.load(open(p, encoding="utf-8"))
            idx[lvl] = {k["id"]: k for k in d.get("kp", [])}
    return idx


def main():
    d = json.load(open(SRC, encoding="utf-8"))
    items = d["items"]
    kp_idx = load_kp_index()

    # 仅待标注
    pending = [it for it in items if not it.get("kp_ids")]
    print("total items:", len(items), "| pending(待标):", len(pending))

    bylv = defaultdict(list)
    for it in pending:
        bylv[it["level"]].append(it)

    meta = {}
    chunk_files = []
    for lv, arr in sorted(bylv.items()):
        kps = kp_idx.get(lv, {})
        header = "# GESP C++ L%d 考点清单（只能从下列 id 中选择，禁止编造）\n" % lv
        for kid, k in sorted(kps.items()):
            header += f"#   {kid} | {k.get('name','')} | {k.get('category','')}\n"
        header += "#\n# 列：paperId\tidx\tqNo\ttype\tstem\toptA\toptB\toptC\toptD\tanswer\n"
        lines = []
        for it in arr:
            opts = it.get("options") or []
            oa = opts[0] if len(opts) > 0 else ""
            ob = opts[1] if len(opts) > 1 else ""
            oc = opts[2] if len(opts) > 2 else ""
            od = opts[3] if len(opts) > 3 else ""
            stem = cap(it.get("stem", ""), 600)
            line = "\t".join([
                it["paperId"], str(it["idx"]), str(it["qNo"]), it["type"],
                stem, cap(oa, 100), cap(ob, 100), cap(oc, 100), cap(od, 100),
                str(it.get("answer", "")),
            ])
            lines.append(line)
            meta[f'{it["paperId"]}|{it["idx"]}'] = {
                "paperId": it["paperId"], "level": it["level"], "qNo": it["qNo"]}
        for pi in range(0, len(lines), CHUNK):
            part = lines[pi:pi + CHUNK]
            fn = f"L{lv}_part{pi // CHUNK + 1}.txt"
            with open(os.path.join(OUTDIR, fn), "w", encoding="utf-8") as f:
                f.write(header + "\n".join(part) + "\n")
            chunk_files.append(fn)
            print(f"  wrote {fn}: {len(part)} lines (L{lv})")

    json.dump(meta, open(os.path.join(OUTDIR, "meta.json"), "w", encoding="utf-8"),
              ensure_ascii=False)
    print("chunk files:", len(chunk_files), "| unique keys:", len(meta))


if __name__ == "__main__":
    main()

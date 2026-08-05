#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""合并各 AI 分块标注结果，回填到 annotate_input.json（全 8 级通用）。

- 以复合主键 (paperId, idx) 对齐（idx 卷内唯一、非全局唯一）
- 校验：kp_id 必须来自对应级别考点表；primary_kp 必须在 kp_ids 内；不跨级
- 回填策略：
  * 已有"已确认/历史"标注的题：保留，不被 AI 草稿覆盖
  * 其余空题：用 AI 初标覆盖，备注='AI初标-待审核'(有)/'AI初标-待复核(空)'(无)
  * 若 AI 也漏标（空），保留原空状态，备注标记待复核
"""
import json
import os
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANN_DIR = os.path.join(ROOT, "data", "kp")


def load_kp_pool():
    valid = {}
    for lvl in range(1, 9):
        p = os.path.join(ANN_DIR, f"gesp-cpp-L{lvl}.json")
        if os.path.exists(p):
            d = json.load(open(p, encoding="utf-8"))
            valid[lvl] = {k["id"] for k in d.get("kp", [])}
    return valid


def main():
    # 收集所有分块结果
    files = sorted(glob.glob(os.path.join(ANN_DIR, "ai_ann_*.json")))
    if not files:
        print("[warn] 未找到 ai_ann_*.json 分块结果，仅重建已确认标注。")
    valid = load_kp_pool()

    merged = {}
    warns = []
    for fn in files:
        d = json.load(open(fn, encoding="utf-8"))
        lvl = d.get("level")
        for it in d.get("items", []):
            key = (it["paperId"], it["idx"])
            if key in merged:
                warns.append(f"DUP {key}")
            kp_ids = it.get("kp_ids") or []
            for kp in kp_ids:
                if kp not in valid.get(lvl, set()):
                    warns.append(f"INVALID id {kp} @ {key}")
            pk = it.get("primary_kp") or None
            if pk and pk not in kp_ids:
                warns.append(f"PRIMARY not in kp_ids {pk} @ {key}")
            merged[key] = {"kp_ids": kp_ids, "primary_kp": pk, "note": it.get("note", "")}

    print(f"分块文件: {len(files)} | merged unique keys: {len(merged)}，warnings: {len(warns)}")
    for w in warns[:60]:
        print("  (warn)", w)

    # 回填
    ai_path = os.path.join(ANN_DIR, "annotate_input.json")
    ai = json.load(open(ai_path, encoding="utf-8"))
    items = ai["items"]
    filled = empty = kept = missing = 0
    for it in items:
        key = (it["paperId"], it["idx"])
        ann = merged.get(key)
        # 已确认/历史标注：保留
        if it.get("kp_ids") and "已确认" in str(it.get("备注", "")):
            kept += 1
            continue
        if not ann:
            # 没有 AI 结果
            if not it.get("kp_ids"):
                # 真缺：保持空，等人工补标
                empty += 1
            else:
                # 已有旧标注（保留 kp_ids 与原备注），不覆盖、不误标
                kept += 1
            continue
        kp = ann["kp_ids"] or []
        it["kp_ids"] = kp
        it["primary_kp"] = ann["primary_kp"]
        it["备注"] = "AI初标-待审核" if kp else "AI初标-待复核(空)"
        if kp:
            filled += 1
        else:
            empty += 1

    print(f"annotate_input → 已标{filled} 待复核{empty} 保留已确认{kept} (total {len(items)})")
    json.dump(ai, open(ai_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("written:", ai_path)


if __name__ == "__main__":
    main()

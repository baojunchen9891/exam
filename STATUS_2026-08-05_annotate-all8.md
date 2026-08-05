# 考级网站 · 全 8 级真题标注 + 诊断范围扩大（2026-08-05）

## 本轮完成（用户指令：① 117 行未归类按最新考点清单标注、NONE 忽略 ② L1/2/3/6/7/8 真题标注、扩大诊断范围）

### 1. 全 8 级考点标注（阶段0）
- **8 份考点表 `gesp-cpp-L1~L8.json` 已 confirmed**（167 个唯一 id，上一轮锁定）。
- **真题标注全量完成**：`annotate_input.json` 共 **2250 题**全有 `kp_ids`，**0 未归类、0 异常**。
  - 分布：L1–L8 每级各 250 题（已排除各卷 answer=NONE 的编程大题 116 道，按用户指令"忽略标注"）。
  - 来源：1978 题 AI 初标（33 分块并行 Agent + 1 个补标 fix 块）+ 272 题上一轮 L4/L5 旧标保留。
- **数据自洽校验**：试卷文件 `dist/data/papers/*.json` 中 2250 道非 NONE 题 100% 带 `kp_ids`，与 `annotate_input` 精确对应；116 道 NONE 题已清零 kp_ids（清掉上一轮误标的 16 道 idx25/26 编程大题）。
- **权重表 `kp_weight.json`** 重算：覆盖全 8 级 92 个有命中的考点（其余 75 个补齐为 0）。

### 2. 管线泛化与质量修复
- `kp_export / prep_ai_chunks / merge_ai_ann / kp_validate` 从 L4/L5 硬编码 → **level 驱动**（读全部 `gesp-cpp-L*.json`）。
- `merge_ai_ann.py`：修复"旧标注保留"被误改备注的问题；复合主键 `(paperId, idx)` 对齐。
- **规则引擎 `rule_prob.js` 修复（真 bug）**：原假设 ratio 全局和=1，但 kp_weight 按考试前缀各自归一（cpp4=1、cpp5=1…），混合多级诊断时权重和=2 → "对一半"被算成虚假 0.98。改为按"本次被测考点集合"重新归一。
  - 全 8 级自检：全对→0.98、全错→0.05、随机均值 0.77–0.83（≈0.5/0.6），断言全过。
- 补标 16 题漏洞：L1_part4 Agent 漏标 lele-378 idx0-4、lele-414 idx2,15-24，已单独补标归位。

### 3. 诊断范围扩大（阶段1 → 全 8 级）
- `diagnostic.js`：`CFG.levels=[4,5]` → **级别选择器 L1–L8**（默认 L4），诊断时只抽该级真题；考点名映射、教师拍区间同步扩到全 8 级。
- `diagnostic.html` / `diagnostic.css`：intro 加级别选择芯片（L1–L8），文案更新为"一至八级任选"。
- 行为：用户先选级别 → 32 题针对该级 → 规则引擎算 P → 薄弱考点 Top5。

### 4. 在线表审计（腾讯文档）
- 标注表：**2250 行**（AI初标-待审核），已推送。
- 考点清单：**L1–L8 全量 167 行**（刷新修复了一处"默认推送覆盖回 42 行"的顺序坑）。
- 填写说明：8 行。
- 链接：https://docs.qq.com/sheet/DY1NGTEtzaE1SR1NX

## 开放项 / 待用户
1. **审计全部 AI 初标**：2250 题均为 "AI初标-待审核"，请在在线表逐题/抽样校验；无误后跑 `tdoc_pull_annotation.py --apply` + `kp_validate.py --strict` 固化。
2. **诊断页加载**：`loadBank` 现加载全部 90 套卷（2250 题），浏览器端 90 次 fetch；如需提速可改为按需按级懒加载（已知优化点，非阻塞）。
3. **NONE 题不计入诊断**：诊断目前对编程大题 `gradeOne` 返回 null（不计分），抽样可能含非自动题；如需纯选择诊断可在 `selectQuestions` 加 `auto` 过滤（已知优化点）。
4. git 改动约 197 个文件（试卷标注 + 脚本 + 前端 + 权重），待你 review 后提交。

## 关键文件
- 数据：`data/kp/annotate_input.json`、`data/kp/gesp-cpp-L1~L8.json`、`dist/data/kp_weight.json`
- 试卷：`dist/data/papers/lele-*.json`（90 套 gesp-cpp 已标）
- 脚本：`build/kp_export.py`、`build/prep_ai_chunks.py`、`build/merge_ai_ann.py`、`build/kp_validate.py`、`build/kp_backfill.py`、`build/kp_stats.py`、`build/push_to_tdoc.py`
- 前端：`dist/diagnostic.html`、`dist/assets/js/diagnostic.js`、`dist/assets/css/diagnostic.css`、`dist/assets/js/rule_prob.js`

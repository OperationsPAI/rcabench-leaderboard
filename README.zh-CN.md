# RCABench 排行榜

**语言：** [English](README.md) | 简体中文

面向 FSE 论文中 12 个 RCA 算法的可复现 CI/CD 评测流水线，支持 FSE RCABench 和
OPS-Lite。仓库固定每个算法的 commit 与数据版本，在 Docker 中执行 datapack，使用
统一指标协议计算结果，并将最新结果发布为静态排行榜。

## 仓库内容

| 内容 | 位置 |
| --- | --- |
| 评测控制器、配置、结果和网页 | 本 GitHub 仓库 |
| 版本化 telemetry datapack 和清单 | Hugging Face 的 `HamsterStation/rcabench-fse` |
| 算法不可变镜像 | `ghcr.io/hamsterstation/rcabench-*` |
| 完整评测计算 | 带 `rcabench` 标签的 GitHub self-hosted runner |
| 公共结果页面 | 从 `site/` 部署的 GitHub Pages |

Hugging Face 数据集和原始数据在确认再分发许可前应保持私有。原始数据、Docker
层、训练 checkpoint、缓存和运行日志不提交到 Git。

## 流水线

1. `config/algorithms.json` 登记 12 个算法和镜像，`config/datasets.json` 登记数据集；
   每个数据配置包含 revision、划分数量、资源和错误容忍度。
2. 新算法或数据集通过 PR 提交。`benchmark-pr.yml` 只展开受影响的算法 × 数据集，
   构建 Linux/AMD64 候选镜像，并在 self-hosted runner 上评测。
3. 成功指标会写回 PR，机器人自动 squash merge；失败或不完整评测不会覆盖正式榜单。
   `benchmark.yml` 可手动触发完整或选定的重跑。
4. ART 和 Eadro 的训练产物按算法 commit 缓存；数据版本变化后会使用新缓存并重新训练。
5. 每个 datapack 使用独立日志和原子 `result.json`；中断后会复用已有有效结果继续运行。
6. `dataset-watch.yml` 每日检查受信任的 Hugging Face 仓库，发现新 revision 后生成确定性
   划分并创建可审计 PR；同一 PR 门禁会先完成指标评测。
7. 指标校验后归档到 `results/history/`，更新 `results/leaderboard.json`，再由
   `pages.yml` 发布 Pages。

数据集 PR 先在云端完成 schema、不可变 revision、清单划分和抽样 ground truth 校验。
外部 fork 不接收 secrets，也不会在学校服务器上运行；维护者提升到受信任的同仓库分支后，
才会展开全部注册算法并进入指标合并门禁。

当前注册算法为 BARO、ART、Eadro、CausalRCA、DiagFusion、MicroDig、MicroHECL、
MicroRank、MicroRCA、Nezha、ShapleyIQ 和 SimpleRCA。DiagFusion 使用上游自带 checkpoint；
在新增数据集上没有训练适配器前，不应将它描述为无泄漏重新训练。

## 本地安装与复现

```bash
git clone https://github.com/OperationsPAI/rcabench-leaderboard.git
cd rcabench-leaderboard
python -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'

rcabench-leaderboard validate-registry
rcabench-leaderboard doctor
pytest -q
```

OPS-Lite 数据可直接按固定配置下载并适配：

```bash
rcabench-leaderboard download --config config/ops-lite.json \
  --output .cache/datasets/ops-lite
rcabench-leaderboard normalize --adapter ops-lite \
  --config config/ops-lite.json --snapshot .cache/datasets/ops-lite
```

先跑 BARO 的 5 个 case 做 smoke：

```bash
rcabench-leaderboard run baro --config config/ops-lite.json \
  --snapshot .cache/datasets/ops-lite --output runs/baro-smoke --limit 5
rcabench-leaderboard evaluate baro --config config/ops-lite.json \
  --snapshot .cache/datasets/ops-lite --results runs/baro-smoke \
  --output runs/baro-smoke/metrics.json --limit 5 --require-complete
```

ART/Eadro 在完整运行前需要准备训练资产：

```bash
rcabench-leaderboard prepare art --config config/ops-lite.json \
  --snapshot .cache/datasets/ops-lite --cache-root .cache/assets
rcabench-leaderboard prepare eadro --config config/ops-lite.json \
  --snapshot .cache/datasets/ops-lite --cache-root .cache/assets
```

FSE 数据集通常位于私有 Hugging Face Dataset。只读 token 应通过环境变量提供：

```bash
export HF_TOKEN=hf_...
rcabench-leaderboard download --config config/benchmark.json \
  --output .cache/datasets/fse
rcabench-leaderboard normalize --adapter native \
  --config config/benchmark.json --snapshot .cache/datasets/fse
```

## 新算法和新数据集

新算法需要在 `config/algorithms.json` 固定上游 40 位 commit、镜像、scope 和资源，
在 `containers/run_algorithm.py` 注册容器适配器，必要时在 `prepare.py` 添加训练缓存，
同时补充测试和 smoke。不要为了单个算法修改排名、映射、阈值、数据选择或 fallback。

新数据集只在 Git 提交配置、适配器、manifest 和校验信息，大文件放 Hugging Face。新的
配置使用 40 位 revision SHA，`all/train/test` 必须无重复且完整覆盖，每个 case 需要
`converted/injection.json` 和 `converted/env.json`。详细格式见
[`docs/DATASET_PR.zh-CN.md`](docs/DATASET_PR.zh-CN.md)；完整开发步骤见
[`docs/DEVELOPMENT.zh-CN.md`](docs/DEVELOPMENT.zh-CN.md)。

## 手动触发 Actions

```bash
REPO=OperationsPAI/rcabench-leaderboard

# 完整或选定评测
gh workflow run benchmark.yml --repo "$REPO" --ref main \
  -f benchmarks=all -f algorithms=all
gh workflow run benchmark.yml --repo "$REPO" --ref main \
  -f benchmarks=ops-lite -f algorithms=causalrca

# 评测一个已审查的同仓库 PR
gh workflow run benchmark-pr.yml --repo "$REPO" --ref main -f pr_number=21

# 构建算法镜像、检查 watcher、导入已有结果、发布 Pages
gh workflow run build-images.yml --repo "$REPO" --ref main
gh workflow run dataset-watch.yml --repo "$REPO" --ref main
gh workflow run upstream-watch.yml --repo "$REPO" --ref main
gh workflow run import-server-results.yml --repo "$REPO" --ref main \
  -f run_root=/mnt/jfs-fixed/ops-lite-runs/seed42
gh workflow run pages.yml --repo "$REPO" --ref main

# 只读检查学校 runner、存储、HF 和 GHCR，不执行算法
gh workflow run runner-health.yml --repo "$REPO" --ref main
```

查看运行状态：

```bash
gh run list --repo "$REPO" --limit 10
gh run watch <RUN_ID> --repo "$REPO"
```

完整评测矩阵是串行的，长时间 queued 或运行数小时属于预期。恢复时重新运行相同
workflow 或使用 `import-server-results.yml`，不要删除已有 `result.json`、metrics、
HF cache、checkpoint、smoke 输出、Redis/JuiceFS 元数据或恢复日志。

## 指标协议

- `Top@1`、`Top@3`、`Top@5`、`Avg@3`、`Avg@5` 和 `MRR` 以请求的 manifest 大小为分母。
- 排名评分前会删除重复 service 名称；缺失或无效结果计为 miss。
- 每个 case 的算法异常会序列化为可审计 miss；超过配置容忍度时 CI 失败。
- 排名按 service 级别与 `injection.json` 中的 ground truth 比较。
- OPS-Lite 可以包含两个 root service，命中任意真实 root 都算命中；ART/Eadro 训练使用
  第一个 root，因为其发布的标签流水线只支持单标签。

## 组织与制品状态

仓库现位于 `OperationsPAI/rcabench-leaderboard`，之前的仓库地址会重定向。
仓库迁移不会复制 HF 数据、缓存、checkpoint 或历史结果。

当前公开的是评测控制器、算法 commit/tag、配置、指标历史和排行榜。论文所用修改版
Train-Ticket 微服务镜像、完整 digest manifest、固定 Train-Ticket commit 以及脱敏
Helm/Kubernetes 配置仍需单独整理并经过许可证审查；不要提交内部 Harbor 地址、凭据或
服务器路径。

# RCABench Leaderboard 开发与复现

本文给新维护者一条可审计的路径：先在本地检查配置，再通过 PR 让受信任的
self-hosted runner 评测，最后由机器人归档指标并发布 Pages。仓库迁移到
`LGU-SE-Internal/rcabench-leaderboard` 后，下面的命令只需替换 `REPO` 变量；旧
仓库地址在 GitHub 转移完成后仍会重定向。

## 1. 仓库边界

| 内容 | 所在位置 | 是否提交到 Git |
| --- | --- | --- |
| 算法、数据集注册表 | `config/algorithms.json`, `config/datasets.json` | 是 |
| 运行器、适配器、指标 | `src/`, `containers/`, `scripts/` | 是 |
| GitHub Actions | `.github/workflows/` | 是 |
| 指标快照与历史 | `results/` | 是；只追加历史 |
| 静态排行榜 | `site/` | 是；由 `build-site` 生成 |
| 原始数据、Docker 层、训练 checkpoint、运行日志 | HF、GHCR、self-hosted runner 存储 | 否 |

当前注册了 12 个 RCA 算法。算法镜像必须指向固定的算法 commit 对应的不可变
镜像。新增或更新数据配置必须指向 40 位 Hugging Face commit SHA，不能使用
`main`、分支或可移动 tag；历史配置中的已发布版本 tag 仅为兼容旧榜单而保留。

## 2. 本地安装与最小复现

```bash
git clone https://github.com/LGU-SE-Internal/rcabench-leaderboard.git
cd rcabench-leaderboard
python -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
rcabench-leaderboard validate-registry
pytest -q
```

完整数据通常存放在私有 Hugging Face Dataset。设置只读 `HF_TOKEN` 后下载固定
版本并运行适配器：

```bash
export HF_TOKEN=hf_...
rcabench-leaderboard download --config config/benchmark.json \
  --output .cache/datasets/fse
rcabench-leaderboard normalize --adapter native \
  --config config/benchmark.json --snapshot .cache/datasets/fse
```

若只需公开的 OPS-Lite：

```bash
rcabench-leaderboard download --config config/ops-lite.json \
  --output .cache/datasets/ops-lite
rcabench-leaderboard normalize --adapter ops-lite \
  --config config/ops-lite.json --snapshot .cache/datasets/ops-lite
```

先跑少量 case 验证容器接口，再跑完整 test split：

```bash
rcabench-leaderboard run baro --config config/ops-lite.json \
  --snapshot .cache/datasets/ops-lite --output runs/baro-smoke --limit 5
rcabench-leaderboard evaluate baro --config config/ops-lite.json \
  --snapshot .cache/datasets/ops-lite --results runs/baro-smoke \
  --output runs/baro-smoke/metrics.json --limit 5 --require-complete
```

ART/Eadro 在 `run` 前需要准备训练资产：

```bash
rcabench-leaderboard prepare art --config config/ops-lite.json \
  --snapshot .cache/datasets/ops-lite --cache-root .cache/assets
```

本地 Docker、HF 权限、磁盘和 token 检查可用 `rcabench-leaderboard doctor`；
`doctor` 失败不代表 GitHub runner 失败。

## 3. 开发新算法

1. 在独立分支固定上游仓库的 40 位 commit，并记录来源、scope、资源限制和镜像名。
2. 在 `config/algorithms.json` 增加条目。除非算法确实需要训练，不要添加
   `preparation`；不要修改排名、映射、阈值或数据选择来迁就单个算法。
3. 在 `containers/run_algorithm.py` 注册适配器。容器从标准输入读取单 case，
   输出 JSON 的 service 排名；算法异常必须由运行器记录为可审计的 miss。
4. 若需要训练，在 `src/rcabench_leaderboard/prepare.py` 增加可复用的缓存适配器，
   并确保 checkpoint 不进入 Git。
5. 增加单元测试，运行 `rcabench-leaderboard validate-registry`、`pytest -q` 和
   一个小规模 smoke；确认 `git diff --check` 通过后提交 PR。
6. 受信任分支上的 PR 会构建 `linux/amd64` GHCR 镜像，并按所有已登记数据集串行
   评测。指标完整且无超限异常时，机器人把结果写回 PR 并 squash merge。

新算法不会自动执行外部 fork 的代码。维护者必须先审查固定 commit，再把代码提升
到本仓库的受信任分支。

## 4. 开发新数据集

先阅读 [`DATASET_PR.zh-CN.md`](DATASET_PR.zh-CN.md)。核心约束是：数据放在 HF，
Git 只提交配置、清单和校验信息；`all/train/test` 必须无重复且完整覆盖；每个 case
都要有 `converted/injection.json` 和 `converted/env.json`。

1. 取得数据仓库的 40 位 commit SHA 和 `manifests/all.txt` 的 SHA256。
2. 编写 `config/<name>.json`，登记到 `config/datasets.json`，选择已有 adapter
   或同时提交 adapter 与测试。
3. 本地运行 `validate-registry`、`pytest -q` 和数据提交校验脚本。
4. 提交 PR。云端 `dataset-submission.yml` 只读取少量样本；完整评测仅在维护者
   提升到受信任分支后进行。

数据版本变化会生成新的历史目录；不要覆盖旧的 `result.json`、metrics、smoke
输出、训练 checkpoint 或恢复日志。

## 5. 手动触发评测与发布

先在仓库设置中确认 `BENCHMARK_ENABLED=true`，并准备 `HF_TOKEN`、`rcabench`
self-hosted runner 和 GHCR 读取权限。以下命令默认使用 `main`：

```bash
REPO=LGU-SE-Internal/rcabench-leaderboard

# 完整评测，或只跑指定 benchmark/algorithm（逗号分隔）
gh workflow run benchmark.yml --repo "$REPO" --ref main \
  -f benchmarks=all -f algorithms=all
gh workflow run benchmark.yml --repo "$REPO" --ref main \
  -f benchmarks=ops-lite -f algorithms=causalrca

# 评测已有的同仓库 PR；PR head 必须先经过审查
gh workflow run benchmark-pr.yml --repo "$REPO" --ref main -f pr_number=21

# 只构建注册表中的算法镜像
gh workflow run build-images.yml --repo "$REPO" --ref main

# 检查受信任 HF 数据集或算法上游是否有新 revision
gh workflow run dataset-watch.yml --repo "$REPO" --ref main
gh workflow run upstream-watch.yml --repo "$REPO" --ref main

# 复用服务器已有 OPS-Lite 结果（路径必须是 runner 上已有目录）
gh workflow run import-server-results.yml --repo "$REPO" --ref main \
  -f run_root=/mnt/jfs-fixed/ops-lite-runs/seed42

# 仅重新构建并发布 Pages
gh workflow run pages.yml --repo "$REPO" --ref main

# 迁移或维护后做只读 runner 健康检查（不执行算法、不修改已有结果）
gh workflow run runner-health.yml --repo "$REPO" --ref main
```

也可以用 repository dispatch 触发选定项目：

```bash
gh api --method POST "repos/$REPO/dispatches" \
  -f event_type=algorithm-updated \
  -f 'client_payload[benchmarks]=ops-lite' \
  -f 'client_payload[algorithms]=causalrca'
```

查看运行状态：

```bash
gh run list --repo "$REPO" --limit 10
gh run watch <RUN_ID> --repo "$REPO"
```

`benchmark.yml` 的评测矩阵 `max-parallel: 1`，长时间等待是预期行为；PR 评测
可运行数小时。不要因为 Actions 页面暂时显示 queued 就删除服务器缓存或重启
Docker。

`runner-health.yml` 会验证 runner 接单、Python、Docker、存储、FSE manifest、
Hugging Face token 和全部已登记 GHCR 镜像的读取权限。它只读取现有资源，不下载
数据、不执行算法，也不修改服务器中的 `result.json`、metrics 或 checkpoint。

## 6. Runner、权限与恢复

- self-hosted runner 必须带有 `rcabench`、`linux`、`x64` 标签，并能运行 Docker。
- Actions Variables 至少需要 `BENCHMARK_ENABLED`；部署 Pages 还需要
  `PAGES_ENABLED`。私有 HF 数据只通过 `HF_TOKEN` Secret 读取。
- fork PR 只在云端做无密钥校验；`pull_request_target` 不执行候选代码。
- 运行目录按 PR、commit、benchmark、algorithm 分层；有效的 case `result.json`
  会被复用。恢复时重新运行相同 workflow 或 `import-server-results.yml`，不要删除
  原始数据、HF cache、metrics、checkpoint、smoke 输出、Redis/JuiceFS 元数据或
  日志。
- 指标中出现 `missing_cases`、`invalid_cases` 或 `algorithm_error` 时先停在 PR
  门禁，检查日志和固定 commit；不要通过修改 fallback、映射或阈值掩盖异常。

## 7. 论文 Train-Ticket 制品状态

排行榜仓库并不包含论文所用的修改版 Train-Ticket 微服务镜像。当前可公开复现的是
评测控制器、算法 commit/tag、配置和排行榜；完整 Train-Ticket 镜像 digest manifest、
固定 Train-Ticket commit 以及脱敏 Helm/Kubernetes 配置仍需单独整理并经过许可证审查。
不要把内部 Harbor 地址、凭据或服务器路径提交到本仓库。

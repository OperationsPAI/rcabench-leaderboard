export const SORT_COLUMNS = [
  { key: "display_name", label: "Algorithm", type: "text", direction: "asc", description: "算法名称" },
  { key: "top@1", label: "Top@1", type: "percent", direction: "desc", description: "首位预测命中率" },
  { key: "top@3", label: "Top@3", type: "percent", direction: "desc", description: "前三位预测命中率" },
  { key: "top@5", label: "Top@5", type: "percent", direction: "desc", description: "前五位预测命中率" },
  { key: "avg@3", label: "Avg@3", type: "percent", direction: "desc", description: "Top@1 至 Top@3 的平均值" },
  { key: "avg@5", label: "Avg@5", type: "percent", direction: "desc", description: "Top@1 至 Top@5 的平均值" },
  { key: "mrr", label: "MRR", type: "percent", direction: "desc", description: "首个正确服务的倒数排名均值" },
  { key: "average_algorithm_seconds", label: "Avg. time", type: "seconds", direction: "asc", description: "有耗时记录的 case 的平均算法耗时，越低越好" },
];

export const METRIC_COLUMNS = SORT_COLUMNS.filter(column => column.type !== "text");
export const SCOPES = { all: "全量 · all", test: "测试集 · test", train: "训练集 · train" };

export function normalizeLeaderboard(data) {
  const boards = data?.benchmarks ?? (data?.benchmark
    ? [{ benchmark: data.benchmark, entries: data.entries }] : null);
  if (!Array.isArray(boards) || !boards.length) throw new Error("结果文件中没有可用的数据集。");
  const ids = new Set();
  for (const board of boards) {
    const benchmark = board?.benchmark;
    if (!benchmark || typeof benchmark.id !== "string" || !benchmark.id
      || typeof benchmark.title !== "string" || !benchmark.title
      || !Array.isArray(board.entries) || ids.has(benchmark.id)) {
      throw new Error("数据集格式无效，请检查已发布的结果文件。");
    }
    ids.add(benchmark.id);
    for (const entry of board.entries) {
      if (!entry || typeof entry.algorithm !== "string" || !entry.algorithm
        || typeof entry.display_name !== "string" || !entry.metrics
        || typeof entry.metrics !== "object" || Array.isArray(entry.metrics)) {
        throw new Error("算法记录格式无效，请检查已发布的结果文件。");
      }
    }
  }
  return { boards, generatedAt: data.generated_at };
}

export async function loadLeaderboard(url, fetcher = fetch) {
  const response = await fetcher(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`结果文件加载失败（HTTP ${response.status}）。`);
  return normalizeLeaderboard(await response.json());
}

export function latestEntries(board) {
  // The published order is authoritative; legacy snapshots can contain repeat runs.
  return [...new Map(board.entries.map(entry => [entry.algorithm, entry])).values()];
}

export function metricValue(value) {
  if (!["string", "number"].includes(typeof value) || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function selectEntries(board, { query = "", scope = "", sortKey = "mrr", sortDirection = "desc" } = {}) {
  const search = query.trim().normalize("NFKC").toLocaleLowerCase();
  const direction = sortDirection === "asc" ? 1 : -1;
  return latestEntries(board)
    .filter(entry => (!scope || entry.scope === scope)
      && `${entry.display_name} ${entry.algorithm}`.normalize("NFKC").toLocaleLowerCase().includes(search))
    .sort((left, right) => {
      const tie = left.display_name.localeCompare(right.display_name) || left.algorithm.localeCompare(right.algorithm);
      if (sortKey === "display_name") return tie * direction;
      const a = metricValue(left.metrics[sortKey]);
      const b = metricValue(right.metrics[sortKey]);
      // Missing metrics stay at the bottom in both directions, never become zero scores.
      if (a === null || b === null) return a === b ? tie : a === null ? 1 : -1;
      return (a - b) * direction || tie;
    });
}

export function summarizeBoards(boards) {
  return {
    algorithms: new Set(boards.flatMap(board => latestEntries(board).map(entry => entry.algorithm))).size,
    datasets: boards.length,
    cases: boards.reduce((total, board) => total + (metricValue(board.benchmark.dataset_cases) ?? 0), 0),
  };
}

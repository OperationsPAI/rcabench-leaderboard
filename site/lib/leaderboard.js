export const SORT_COLUMNS = [
  { key: "display_name", label: "Algorithm", type: "text", direction: "asc", description: "Algorithm name" },
  { key: "top@1", label: "Top@1", type: "percent", direction: "desc", description: "Hit rate for the first prediction" },
  { key: "top@3", label: "Top@3", type: "percent", direction: "desc", description: "Hit rate within the first three predictions" },
  { key: "top@5", label: "Top@5", type: "percent", direction: "desc", description: "Hit rate within the first five predictions" },
  { key: "avg@3", label: "Avg@3", type: "percent", direction: "desc", description: "Mean of Top@1 through Top@3" },
  { key: "avg@5", label: "Avg@5", type: "percent", direction: "desc", description: "Mean of Top@1 through Top@5" },
  { key: "mrr", label: "MRR", type: "percent", direction: "desc", description: "Mean reciprocal rank of the first correct service" },
  { key: "average_algorithm_seconds", label: "Avg. time", type: "seconds", direction: "asc", description: "Mean algorithm runtime for cases with recorded timing; lower is better" },
];

export const METRIC_COLUMNS = SORT_COLUMNS.filter(column => column.type !== "text");
export const SCOPES = { all: "All cases · all", test: "Test split · test", train: "Train split · train" };

export function normalizeLeaderboard(data) {
  const boards = data?.benchmarks ?? (data?.benchmark
    ? [{ benchmark: data.benchmark, entries: data.entries }] : null);
  if (!Array.isArray(boards) || !boards.length) throw new Error("No datasets are available in the results file.");
  const ids = new Set();
  for (const board of boards) {
    const benchmark = board?.benchmark;
    if (!benchmark || typeof benchmark.id !== "string" || !benchmark.id
      || typeof benchmark.title !== "string" || !benchmark.title
      || !Array.isArray(board.entries) || ids.has(benchmark.id)) {
      throw new Error("Invalid dataset format. Please check the published results file.");
    }
    ids.add(benchmark.id);
    for (const entry of board.entries) {
      if (!entry || typeof entry.algorithm !== "string" || !entry.algorithm
        || typeof entry.display_name !== "string" || !entry.metrics
        || typeof entry.metrics !== "object" || Array.isArray(entry.metrics)) {
        throw new Error("Invalid algorithm record. Please check the published results file.");
      }
    }
  }
  return { boards, generatedAt: data.generated_at };
}

export async function loadLeaderboard(url, fetcher = fetch) {
  const response = await fetcher(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load the results file (HTTP ${response.status}).`);
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

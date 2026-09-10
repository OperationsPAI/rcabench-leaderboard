import { SCOPES, SORT_COLUMNS } from "./leaderboard.js";

export function readLocation(search, boards) {
  const params = new URLSearchParams(search);
  const requestedSort = params.get("sort");
  return {
    boardId: boards.find(board => board.benchmark.id === params.get("benchmark"))?.benchmark.id
      ?? boards[0].benchmark.id,
    query: params.get("q") ?? "",
    scope: Object.hasOwn(SCOPES, params.get("scope")) ? params.get("scope") : "",
    sortKey: SORT_COLUMNS.some(column => column.key === requestedSort) ? requestedSort : "mrr",
    // Preserve existing shared links: omitted direction historically meant descending.
    sortDirection: params.get("direction") === "asc" ? "asc" : "desc",
  };
}

export function writeLocation(href, state) {
  const url = new URL(href);
  const values = {
    benchmark: state.boardId,
    q: state.query.trim(),
    scope: state.scope,
    sort: state.sortKey === "mrr" ? "" : state.sortKey,
    direction: state.sortDirection === "desc" ? "" : state.sortDirection,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  return url;
}

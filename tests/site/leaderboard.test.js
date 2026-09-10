import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadLeaderboard, latestEntries, normalizeLeaderboard, selectEntries, summarizeBoards, SORT_COLUMNS } from "../../site/lib/leaderboard.js";
import { archiveUrl, escapeHtml, formatDate, formatMetric } from "../../site/lib/format.js";
import { readLocation, writeLocation } from "../../site/lib/location.js";
import { createView, renderRow } from "../../site/lib/view.js";

const root = new URL("../../", import.meta.url);
const published = JSON.parse(readFileSync(new URL("results/leaderboard.json", root), "utf8"));
const { boards } = normalizeLeaderboard(published);
const entry = (name, score, extra = {}) => ({
  algorithm: name.toLowerCase(), display_name: name, scope: "all", metrics: { mrr: score }, ...extra,
});
const board = entries => ({ benchmark: { id: "fse-fixture", title: "Fixture" }, entries });
const names = entries => entries.map(item => item.display_name);

test("legacy and multi-benchmark snapshots use the same data model without mutation", () => {
  const snapshot = structuredClone(published);
  const legacy = { ...boards[0], generated_at: published.generated_at };
  assert.deepEqual(normalizeLeaderboard(legacy).boards, [boards[0]]);
  assert.deepEqual(normalizeLeaderboard(published).boards, published.benchmarks);
  assert.deepEqual(published, snapshot);
});

test("invalid snapshots fail explicitly; a valid board may have zero entries", () => {
  for (const data of [null, {}, { benchmarks: [] }, { benchmarks: [null] },
    { benchmarks: [board([]), board([])] }, { benchmarks: [board([{}])] }]) {
    assert.throws(() => normalizeLeaderboard(data));
  }
  assert.deepEqual(normalizeLeaderboard(board([])).boards[0].entries, []);
});

test("loading uses no-store and exposes HTTP and JSON failures", async () => {
  const loaded = await loadLeaderboard("data.json", async (url, options) => {
    assert.equal(url, "data.json");
    assert.equal(options.cache, "no-store");
    return { ok: true, json: async () => published };
  });
  assert.deepEqual(loaded.boards, boards);
  await assert.rejects(loadLeaderboard("data.json", async () => ({ ok: false, status: 404 })), /404/);
  await assert.rejects(loadLeaderboard("data.json", async () => ({ ok: true, json: async () => { throw new SyntaxError("bad JSON"); } })), /bad JSON/);
});

test("latest entries keep the final published occurrence, not the highest score", () => {
  const older = entry("A", 0.9);
  const latest = entry("A", 0.1);
  const fixture = board([older, entry("B", 0.5), latest]);
  assert.deepEqual(latestEntries(fixture), [latest, fixture.entries[1]]);
  assert.deepEqual(names(selectEntries(fixture)), ["B", "A"]);
  assert.equal(fixture.entries[0], older);
});

test("sorts numerically, breaks ties deterministically, and does not mutate the snapshot", () => {
  const fixture = board([entry("C", "0.2"), entry("B", 0.9), entry("A", 0.9)]);
  const before = structuredClone(fixture);
  assert.deepEqual(names(selectEntries(fixture)), ["A", "B", "C"]);
  assert.deepEqual(names(selectEntries(fixture, { sortDirection: "asc" })), ["C", "A", "B"]);
  assert.deepEqual(names(selectEntries(fixture, { sortKey: "display_name" })), ["C", "B", "A"]);
  assert.deepEqual(fixture, before);
});

test("missing metrics sort last in both directions and never display as a zero", () => {
  for (const missing of [null, undefined, NaN, Infinity, "bad", "", " ", false, [], {}]) {
    const fixture = board([entry("Missing", missing), entry("Zero", 0), entry("One", 1)]);
    assert.deepEqual(names(selectEntries(fixture)), ["One", "Zero", "Missing"]);
    assert.deepEqual(names(selectEntries(fixture, { sortDirection: "asc" })), ["Zero", "One", "Missing"]);
    assert.equal(formatMetric(missing, "percent"), "—");
  }
  assert.equal(formatMetric(0, "percent"), "0.00%");
  assert.equal(formatMetric(0.12345, "percent"), "12.35%");
  assert.equal(formatMetric(682.556, "seconds"), "682.56s");
});

test("query and scope compose without changing the underlying metrics", () => {
  const fixture = board([entry("BARO", 0.7), entry("ART", 0.1, { scope: "test" })]);
  assert.deepEqual(names(selectEntries(fixture, { query: " ｂａｒｏ " })), ["BARO"]);
  assert.deepEqual(names(selectEntries(fixture, { query: "ar", scope: "test" })), ["ART"]);
  assert.deepEqual(selectEntries(fixture, { query: "BARO", scope: "test" }), []);
  assert.deepEqual(selectEntries(board([])), []);
});

test("all configured columns order real records correctly", () => {
  for (const currentBoard of boards) {
    for (const column of SORT_COLUMNS.filter(item => item.type !== "text")) {
      for (const direction of ["asc", "desc"]) {
        const selected = selectEntries(currentBoard, { sortKey: column.key, sortDirection: direction });
        const values = selected.map(item => item.metrics[column.key]);
        assert.equal(values.length, latestEntries(currentBoard).length);
        assert.deepEqual(values, [...values].sort((a, b) => direction === "asc" ? a - b : b - a));
      }
    }
  }
});

test("summary counts unique algorithms and each dataset only once", () => {
  const one = board([entry("A", 0.1), entry("B", 0.2), entry("A", 0.3)]);
  const two = board([entry("B", 0.4)]);
  one.benchmark.dataset_cases = 1422;
  two.benchmark.dataset_cases = 500;
  assert.deepEqual(summarizeBoards([one, two]), { algorithms: 2, datasets: 2, cases: 1922 });
  for (const currentBoard of boards) {
    const testEntries = selectEntries(currentBoard, { scope: "test" });
    assert.equal(testEntries.length, latestEntries(currentBoard).filter(item => item.scope === "test").length);
    assert.ok(testEntries.every(item => item.cases === currentBoard.benchmark.test_cases));
  }
});

test("invalid URL options fall back to safe defaults", () => {
  const state = readLocation("?benchmark=unknown&sort=invalid&direction=up&scope=constructor", boards);
  assert.deepEqual(state, { boardId: boards[0].benchmark.id, query: "", scope: "", sortKey: "mrr", sortDirection: "desc" });
  assert.equal(readLocation("?sort=average_algorithm_seconds", boards).sortDirection, "desc");
});

test("shared links round-trip board, scope, query and sort, retaining anchors and unrelated parameters", () => {
  const state = { boardId: boards[1].benchmark.id, query: "ART & BARO", scope: "test", sortKey: "top@1", sortDirection: "asc" };
  const url = writeLocation("https://example.com/subpath/?utm_source=docs#leaderboard", state);
  assert.deepEqual(readLocation(url.search, boards), state);
  assert.equal(url.hash, "#leaderboard");
  assert.equal(url.pathname, "/subpath/");
  assert.equal(url.searchParams.get("utm_source"), "docs");
  const reset = writeLocation(url.href, { ...state, query: "", scope: "", sortKey: "mrr", sortDirection: "desc" });
  for (const key of ["q", "scope", "sort", "direction"]) assert.equal(reset.searchParams.has(key), false);
});

test("rendered records escape untrusted labels and highlight only the selected column", () => {
  const current = entry('<img src=x onerror="alert(1)">', 0.5, { scope: '<svg onload="bad">', algorithm_commit: 'abc"title="bad' });
  const markup = renderRow(current, 0, board([current]), "mrr");
  assert.ok(!markup.includes("<img"));
  assert.ok(!markup.includes("<svg"));
  assert.match(markup, /&lt;img/);
  assert.equal((markup.match(/active-sort/g) ?? []).length, 1);
  assert.match(markup, /class="number active-sort">50.00%/);
  assert.equal(escapeHtml("'&<>\""), "&#39;&amp;&lt;&gt;&quot;");
});

test("every published archive link resolves to an existing, matching immutable record", () => {
  for (const currentBoard of boards) {
    for (const current of currentBoard.entries) {
      const url = new URL(archiveUrl(current, currentBoard));
      assert.equal(url.origin, "https://github.com");
      const path = url.pathname.split("/blob/main/")[1];
      const local = new URL(path, root);
      assert.ok(existsSync(fileURLToPath(local)), path);
      const archived = JSON.parse(readFileSync(local, "utf8"));
      assert.equal(archived.algorithm_commit, current.algorithm_commit);
      assert.deepEqual(archived.metrics, current.metrics);
    }
  }
  assert.equal(archiveUrl(entry("A", 1), board([])), null);
  assert.equal(archiveUrl({ ...entry("A", 1), run_id: "run" }, { benchmark: { id: "new-dataset" } }), null);
});

test("snapshot dates distinguish missing dates from UTC timestamps", () => {
  assert.equal(formatDate(null), "Update time unknown");
  assert.equal(formatDate("invalid"), "Update time unknown");
  assert.equal(formatDate("2026-08-06T09:27:47Z"), "2026-08-06 09:27 UTC");
});

test("the static preview uses the same bytes as the published leaderboard", () => {
  assert.equal(readFileSync(new URL("site/data.json", root), "utf8"), readFileSync(new URL("results/leaderboard.json", root), "utf8"));
});

test("the public interface declares English and keeps static and dynamic copy in English", () => {
  const page = readFileSync(new URL("site/index.html", root), "utf8");
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<title>Algorithm Leaderboard/);
  assert.match(page, /aria-label="Main navigation"/);
  for (const path of ["site/index.html", "site/app.js", "site/lib/view.js",
    "site/lib/leaderboard.js", "site/lib/format.js", "site/lib/location.js"]) {
    assert.doesNotMatch(readFileSync(new URL(path, root), "utf8"), /\p{Script=Han}/u, path);
  }
});

test("English controls, captions and empty states follow the selected board and ordering", () => {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, {
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
      });
      return elements.get(id);
    },
    querySelectorAll() { return []; },
  };
  const view = createView(document);
  view.initialize({ boards, generatedAt: published.generated_at });
  assert.match(elements.get("scope-filter").innerHTML, /All scopes/);
  assert.match(elements.get("scope-filter").innerHTML, /Test split/);
  for (const currentBoard of boards) {
    const state = readLocation(`?benchmark=${currentBoard.benchmark.id}`, boards);
    view.render(boards, state);
    const count = latestEntries(currentBoard).length;
    assert.equal(elements.get("result-count").textContent, `Showing ${count} / ${count} algorithms`);
    assert.equal(elements.get("table-caption").textContent, `${currentBoard.benchmark.title} service-level root cause analysis results`);
    assert.equal(elements.get("sort-direction").textContent, "Descending ↓");
    assert.match(elements.get("leaderboard-body").innerHTML, /archived metrics/);
    view.render(boards, { ...state, sortDirection: "asc", query: "no-matching-algorithm" });
    assert.equal(elements.get("sort-direction").attributes["aria-label"], "Ascending order; switch to descending");
    assert.match(elements.get("leaderboard-body").innerHTML, /No matching algorithms/);
    view.render([{ ...currentBoard, entries: [] }], state);
    assert.match(elements.get("leaderboard-body").innerHTML, /No published results for this dataset yet/);
  }
});

test("loading failures stop the busy status and keep controls disabled until recovery", () => {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, {
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
      });
      return elements.get(id);
    },
  };
  const view = createView(document);
  view.loading();
  assert.equal(elements.get("filter-controls").disabled, true);
  assert.equal(elements.get("results-panel").attributes["aria-busy"], "true");
  view.error("HTTP 503");
  assert.equal(elements.get("results-panel").attributes["aria-busy"], "false");
  assert.equal(elements.get("load-error").hidden, false);
  assert.equal(elements.get("error-message").textContent, "HTTP 503");
  assert.equal(elements.get("result-count").textContent, "Unable to load results");
  view.loading();
  assert.equal(elements.get("load-error").hidden, true);
  view.initialize({ boards, generatedAt: published.generated_at });
  assert.equal(elements.get("filter-controls").disabled, false);
  assert.equal(elements.get("results-panel").attributes["aria-busy"], "false");
});

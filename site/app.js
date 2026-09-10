import { loadLeaderboard, SORT_COLUMNS } from "./lib/leaderboard.js";
import { readLocation, writeLocation } from "./lib/location.js";
import { createView } from "./lib/view.js";

const view = createView(document);
let boards = [];
let state;

function render({ updateUrl = true } = {}) {
  view.render(boards, state);
  if (updateUrl) history.replaceState(null, "", writeLocation(location.href, state));
}

function changeSort(key) {
  if (key === state.sortKey) {
    state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
  } else {
    state.sortKey = key;
    state.sortDirection = SORT_COLUMNS.find(column => column.key === key).direction;
  }
  render();
}

document.querySelector("#benchmark-tabs").addEventListener("click", event => {
  const tab = event.target.closest("button[data-id]");
  if (!tab || !state) return;
  state.boardId = tab.dataset.id;
  render();
});

document.querySelector("#benchmark-tabs").addEventListener("keydown", event => {
  if (!state || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const current = boards.findIndex(board => board.benchmark.id === state.boardId);
  const next = event.key === "Home" ? 0 : event.key === "End" ? boards.length - 1
    : (current + (event.key === "ArrowRight" ? 1 : -1) + boards.length) % boards.length;
  state.boardId = boards[next].benchmark.id;
  render();
  document.querySelectorAll("#benchmark-tabs button")[next].focus();
});

document.querySelector("#filters").addEventListener("submit", event => event.preventDefault());
document.querySelector("#algorithm-search").addEventListener("input", event => {
  if (!state) return;
  state.query = event.target.value;
  render();
});
document.querySelector("#scope-filter").addEventListener("change", event => {
  state.scope = event.target.value;
  render();
});
document.querySelector("#sort-select").addEventListener("change", event => changeSort(event.target.value));
document.querySelector("#sort-direction").addEventListener("click", () => changeSort(state.sortKey));
document.querySelector("#leaderboard-head").addEventListener("click", event => {
  const button = event.target.closest("button[data-sort]");
  if (button && state) changeSort(button.dataset.sort);
});
document.querySelector("#reset-filters").addEventListener("click", () => {
  state = { ...state, query: "", scope: "", sortKey: "mrr", sortDirection: "desc" };
  render();
});
window.addEventListener("popstate", () => {
  if (!state) return;
  state = readLocation(location.search, boards);
  render({ updateUrl: false });
});

async function start() {
  view.loading();
  try {
    const data = await loadLeaderboard(new URL("./data.json", import.meta.url));
    boards = data.boards;
    state = readLocation(location.search, boards);
    view.initialize(data);
    render();
  } catch (error) {
    view.error(error.message);
  }
}

document.querySelector("#retry-load").addEventListener("click", start);
start();

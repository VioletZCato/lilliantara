/* ============================================================
   controls.js — theme and tree-animation switches
   Drives both the full-size segmented controls on the demo page
   and the mini ones in the corner of every other page. Choices
   persist in localStorage, so they follow you between pages.
   ============================================================ */

(() => {
  "use strict";

  const root = document.documentElement;
  const THEME_KEY = "lt-theme";
  const TREE_KEY = "lt-trees";
  const TREE_MODES = ["legacy-v2", "phylo-v4", "lively-v5"];
  const TREE_DEFAULT = "phylo-v4";

  function press(nodes, attr, choice) {
    for (const b of nodes) b.setAttribute("aria-pressed", String(b.dataset[attr] === choice));
  }

  /* ---------- theme ---------- */

  const themeButtons = document.querySelectorAll("[data-theme-set]");

  function applyTheme(choice) {
    if (choice === "dark" || choice === "light") {
      root.dataset.theme = choice;
      try { localStorage.setItem(THEME_KEY, choice); } catch (e) {}
    } else {
      choice = "auto";
      delete root.dataset.theme;
      try { localStorage.removeItem(THEME_KEY); } catch (e) {}
    }
    press(themeButtons, "themeSet", choice);
  }

  for (const b of themeButtons) {
    b.addEventListener("click", () => applyTheme(b.dataset.themeSet));
  }

  let storedTheme = null;
  try { storedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
  applyTheme(storedTheme || "auto");

  /* ---------- tree animation ---------- */

  const treeButtons = document.querySelectorAll("[data-tree-set]");

  function applyTrees(choice) {
    if (TREE_MODES.indexOf(choice) < 0) choice = TREE_DEFAULT;
    try { localStorage.setItem(TREE_KEY, choice); } catch (e) {}
    press(treeButtons, "treeSet", choice);
    // spice.js dissolves whatever is standing before growing the new style
    window.dispatchEvent(new CustomEvent("lt-tree-mode", { detail: choice }));
  }

  for (const b of treeButtons) {
    b.addEventListener("click", () => applyTrees(b.dataset.treeSet));
  }

  let storedTrees = null;
  try { storedTrees = localStorage.getItem(TREE_KEY); } catch (e) {}
  applyTrees(storedTrees || TREE_DEFAULT);
})();

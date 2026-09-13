(function () {
  var STORAGE_KEY = "jtd-theme";

  function normalize(theme) {
    return theme === "dark" ? "dark" : "light";
  }

  function systemTheme() {
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
    return "light";
  }

  function ariaFor(theme) {
    return normalize(theme) === "dark"
      ? "Switch to light mode"
      : "Switch to dark mode";
  }

  /** Icon shows the mode you can switch *to* (moon → dark, sun → light). */
  function iconFor(theme) {
    return normalize(theme) === "dark" ? "#svg-sun" : "#svg-moon";
  }

  function updateButton(theme) {
    var btn = document.querySelector(".js-theme-toggle");
    if (!btn) return;
    btn.setAttribute("aria-label", ariaFor(theme));
    var use = btn.querySelector("use");
    if (!use) return;
    var href = iconFor(theme);
    use.setAttribute("href", href);
    use.setAttribute("xlink:href", href);
  }

  /** Apply theme visually; only persist when `persist` is true (user chose). */
  function apply(theme, persist) {
    if (typeof jtd === "undefined") return;
    theme = normalize(theme);
    jtd.setTheme(theme);
    if (persist) {
      localStorage.setItem(STORAGE_KEY, theme);
    }
    updateButton(theme);
  }

  function init() {
    if (typeof jtd === "undefined") return;

    var saved = localStorage.getItem(STORAGE_KEY);
    var media =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");

    if (saved === "dark" || saved === "light") {
      apply(saved, false);
    } else {
      apply(systemTheme(), false);
      if (media && media.addEventListener) {
        media.addEventListener("change", function () {
          if (localStorage.getItem(STORAGE_KEY)) return;
          apply(systemTheme(), false);
        });
      }
    }

    var btn = document.querySelector(".js-theme-toggle");
    if (!btn) return;
    jtd.addEvent(btn, "click", function () {
      apply(normalize(jtd.getTheme()) === "dark" ? "light" : "dark", true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

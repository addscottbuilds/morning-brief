(function () {
  "use strict";
  const root = document.documentElement;
  const system = matchMedia("(prefers-color-scheme: dark)");
  const storageKey = "mb_appearance_v1";
  let preference = "system";
  try {
    const saved = localStorage.getItem(storageKey);
    if (["system", "day", "night"].includes(saved)) preference = saved;
  } catch {}

  function apply() {
    const night = preference === "night" || (preference === "system" && system.matches);
    root.dataset.editionTheme = night ? "night" : "day";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", night ? "#142228" : "#fcfdfd");
  }
  apply();
  system.addEventListener("change", apply);
  document.addEventListener("DOMContentLoaded", () => {
    for (const input of document.querySelectorAll('input[name="appearance"]')) {
      input.checked = input.value === preference;
      input.addEventListener("change", () => {
        preference = input.value;
        try { localStorage.setItem(storageKey, preference); } catch {}
        apply();
      });
    }
  });
})();

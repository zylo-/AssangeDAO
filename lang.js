(function() {
  const STORAGE_KEY = "assangedao-lang";
  let currentLang = localStorage.getItem(STORAGE_KEY) || "en";

  function applyLang(lang) {
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang === "zh" ? "zh" : "en";
    document.querySelectorAll("[data-en]").forEach((el) => {
      // Skip the Clock NFT container and anything inside it
      if (el.id === "svg-container" || el.closest("#svg-container") || el.closest(".clock-frame")) return;
      const key = lang === "zh" ? "data-zh" : "data-en";
      const val = el.getAttribute(key);
      if (val != null) el.innerHTML = val;
    });
    const toggle = document.getElementById("langToggle");
    if (toggle) toggle.textContent = lang === "zh" ? "EN" : "中文";
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyLang(currentLang);
    const toggle = document.getElementById("langToggle");
    if (toggle) {
      toggle.addEventListener("click", () => {
        applyLang(currentLang === "en" ? "zh" : "en");
      });
    }
  });
})();

const TREASURY = "0x7BE99ca4E6893ef57cf349ab56307628100feA00";
const JUSTICE = "0x59d1e836F7b7210A978b25a855085cc46fd090B5";
const RPC = "https://ethereum.publicnode.com";
const FREE_FROM = Date.UTC(2024, 5, 26);

function $(id) {
  return document.getElementById(id);
}

function daysFree() {
  return Math.max(0, Math.floor((Date.now() - FREE_FROM) / 86400000));
}

async function loadTreasury() {
  const el = $("ethBal");
  const usdEl = $("ethUsd");
  if (!el) return;
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [TREASURY, "latest"],
      }),
    });
    const json = await res.json();
    const wei = BigInt(json.result || "0x0");
    const eth = Number(wei) / 1e18;
    el.textContent = eth.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " ETH";
    try {
      const cg = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
      const price = (await cg.json())?.ethereum?.usd;
      if (price && usdEl) {
        usdEl.textContent = "≈ $" + Math.round(eth * price).toLocaleString() + " · assangedao.eth";
      }
    } catch (_) {}
  } catch (_) {
    el.textContent = "See treasury";
  }
}

async function addJustice() {
  const btn = $("addToken");
  const status = $("mmStatus");
  const set = (msg) => {
    if (status) status.textContent = msg;
    else if (btn) btn.textContent = msg;
  };
  if (!window.ethereum) {
    set("Install MetaMask");
    window.open("https://metamask.io/download/", "_blank", "noopener");
    return;
  }
  try {
    await window.ethereum.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: JUSTICE,
          symbol: "JUSTICE",
          decimals: 18,
          image: new URL("./img/justice-token.png", window.location.href).href,
        },
      },
    });
    set("Added");
  } catch (err) {
    if (err && err.code === 4001) set("Rejected");
    else set("Could not add");
  }
}

function enableCopy() {
  document.querySelectorAll(".copy-btn, code[data-copy]").forEach((node) => {
    node.addEventListener("click", async (e) => {
      e.preventDefault();
      const value = node.getAttribute("data-copy");
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        const prev = node.textContent;
        node.textContent = "Copied";
        setTimeout(() => { node.textContent = prev; }, 1100);
      } catch (_) {}
    });
  });
}

let currentLang = localStorage.getItem("lang") || "en";

function applyLang(lang) {
  currentLang = lang;
  localStorage.setItem("lang", lang);
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-en]:not(.clock-frame *, #svg-container *, .clock-nft *)").forEach((el) => {
    const key = lang === "zh" ? "data-zh" : "data-en";
    const val = el.getAttribute(key);
    if (val) {
      if (el.tagName === "BUTTON" || el.classList.contains("lang-btn")) {
        el.textContent = val;
      } else {
        el.innerHTML = val;
      }
    }
  });
  const toggle = $("langToggle");
  if (toggle) toggle.textContent = lang === "zh" ? "EN" : "中文";
}

document.addEventListener("DOMContentLoaded", () => {
  const days = $("daysFree");
  if (days) days.textContent = String(daysFree());
  loadTreasury();
  enableCopy();
  $("addToken")?.addEventListener("click", addJustice);

  applyLang(currentLang);
  $("langToggle")?.addEventListener("click", () => {
    applyLang(currentLang === "en" ? "zh" : "en");
  });
});

async function loadTotalTreasury() {
  try {
    const r = await fetch("https://api.safe.global/tx-service/eth/api/v1/safes/0x7BE99ca4E6893ef57cf349ab56307628100feA00/balances/");
    const data = await r.json();
    const prices = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum,assangedao&vs_currencies=usd").then(r => r.json());
    const ethPrice = prices.ethereum?.usd || 2500;
    const justicePrice = prices.assangedao?.usd || 0.0001;
    let total = 0;
    for (const item of data) {
      const token = item.token;
      const sym = token ? (token.symbol || "").toUpperCase() : "ETH";
      const dec = token ? (token.decimals || 18) : 18;
      const amt = Number(item.balance) / Math.pow(10, dec);
      // Only count the main assets, avoid spam and double counting
      const addr = (item.tokenAddress || "").toLowerCase();
      if (sym === "ETH" || sym === "WETH") {
        total += amt * ethPrice;
      } else if (sym === "WSTETH") {
        total += amt * ethPrice; // approximate
      } else if (sym === "JUSTICE" && addr === "0x59d1e836f7b7210a978b25a855085cc46fd090b5") {
        total += amt * justicePrice;
      }
    }
    const el = document.getElementById("ethBal");
    if (el) el.textContent = "$" + Math.round(total).toLocaleString();
    const sub = document.getElementById("ethUsd");
    if (sub) sub.textContent = "total Safe value";
  } catch (e) {
    console.error("Total value error:", e);
  }
}
document.addEventListener("DOMContentLoaded", loadTotalTreasury);


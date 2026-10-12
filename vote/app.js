const CFG = {
  space: "assangedao.eth",
  hub: "https://hub.snapshot.org/graphql",
  seq: "https://seq.snapshot.org",
  app: "vote.justice.exchange",
};

const DOMAIN = { name: "snapshot", version: "0.1.4" };
const VOTE_TYPES = {
  Vote: [
    { name: "from", type: "string" },
    { name: "space", type: "string" },
    { name: "timestamp", type: "uint64" },
    { name: "proposal", type: "string" },
    { name: "choice", type: "uint32" },
    { name: "reason", type: "string" },
    { name: "app", type: "string" },
    { name: "metadata", type: "string" },
  ],
};

const $ = (id) => document.getElementById(id);
const appEl = $("app");
const state = {
  provider: null,
  signer: null,
  address: null,
  filter: "all",
  list: [],
  proposal: null,
  votes: [],
  vp: null,
  myVote: null,
  choice: null,
  busy: false,
};

function short(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}
function fmtVp(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n >= 1e6) return (n / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "M";
  if (n >= 1e3) return (n / 1e3).toLocaleString(undefined, { maximumFractionDigits: 1 }) + "k";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function when(ts) {
  return ts ? new Date(ts * 1000).toLocaleString() : "";
}
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function renderBody(md) {
  let s = escapeHtml(md || "");
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return s;
}
function pidFromHash() {
  const h = (location.hash || "").replace(/^#\/?/, "");
  if (h.startsWith("0x") && h.length >= 66) return h;
  return "";
}

async function gql(query, variables) {
  const r = await fetch(CFG.hub, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors[0]?.message || "Snapshot query failed");
  return j.data;
}

function hideWalletMenu() {
  $("walletMenu").hidden = true;
}
function setDisconnected() {
  state.provider = null;
  state.signer = null;
  state.address = null;
  state.vp = null;
  state.myVote = null;
  $("walletBtn").textContent = "Connect wallet";
  hideWalletMenu();
  render();
}
async function applyAccount(address) {
  state.provider = new ethers.BrowserProvider(window.ethereum);
  state.signer = await state.provider.getSigner();
  state.address = address;
  $("walletBtn").textContent = short(address);
  hideWalletMenu();
  if (state.proposal) await loadMine();
  render();
}
async function connect(opts = {}) {
  if (!window.ethereum) return;
  try {
    if (opts.pick) {
      try {
        await window.ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch (e) {
        if (e && (e.code === 4001 || e.code === "ACTION_REJECTED")) return;
      }
    }
    const acc = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (acc && acc[0]) await applyAccount(acc[0]);
  } catch (e) {
    if (e && (e.code === 4001 || e.code === "ACTION_REJECTED")) return;
    console.warn(e);
  }
}
function disconnect() {
  setDisconnected();
  window.ethereum?.request?.({
    method: "wallet_revokePermissions",
    params: [{ eth_accounts: {} }],
  }).catch(() => {});
}

async function loadList() {
  const data = await gql(`
    query($space: String!) {
      proposals(first: 40, where: { space_in: [$space] }, orderBy: "created", orderDirection: desc) {
        id title state start end type choices scores scores_total quorum author votes
      }
    }
  `, { space: CFG.space });
  state.list = data.proposals || [];
}

async function loadProposal(id) {
  const data = await gql(`
    query($id: String!) {
      proposal(id: $id) {
        id title body discussion start end snapshot state type
        choices scores scores_total quorum author votes space { id name }
      }
      votes(first: 40, where: { proposal: $id }, orderBy: "vp", orderDirection: desc) {
        voter choice vp created reason
      }
    }
  `, { id });
  state.proposal = data.proposal;
  state.votes = data.votes || [];
  state.choice = null;
  await loadMine();
}

async function loadMine() {
  state.vp = null;
  state.myVote = null;
  if (!state.address || !state.proposal) return;
  const data = await gql(`
    query($voter: String!, $space: String!, $proposal: String!) {
      vp(voter: $voter, space: $space, proposal: $proposal) { vp vp_state }
      votes(first: 1, where: { voter: $voter, proposal: $proposal }) {
        choice vp reason
      }
    }
  `, { voter: state.address, space: CFG.space, proposal: state.proposal.id });
  state.vp = data.vp;
  state.myVote = (data.votes && data.votes[0]) || null;
  if (state.myVote) state.choice = Number(state.myVote.choice);
}

async function castVote() {
  if (!state.address) return connect();
  if (!state.proposal || state.proposal.state !== "active") return;
  if (!state.choice) return;
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    const message = {
      from: ethers.getAddress(state.address),
      space: CFG.space,
      timestamp: Math.floor(Date.now() / 1000),
      proposal: state.proposal.id,
      choice: Number(state.choice),
      reason: "",
      app: CFG.app,
      metadata: "{}",
    };
    const sig = await state.signer.signTypedData(DOMAIN, VOTE_TYPES, message);
    const res = await fetch(CFG.seq, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        address: message.from,
        sig,
        data: { domain: DOMAIN, types: VOTE_TYPES, message },
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error_description || out.error || "Vote rejected by Snapshot");
    await loadProposal(state.proposal.id);
  } catch (e) {
    if (!(e && (e.code === 4001 || e.code === "ACTION_REJECTED"))) {
      alert(e?.shortMessage || e?.message || String(e));
    }
  } finally {
    state.busy = false;
    render();
  }
}

function renderList() {
  const rows = state.list.filter((p) => state.filter === "all" || p.state === state.filter);
  const tabs = ["active", "pending", "closed", "all"]
    .map((f) => `<button type="button" class="sort ${state.filter === f ? "on" : ""}" data-filter="${f}">${f}</button>`)
    .join("");
  const cards = rows.length
    ? rows
        .map((p) => {
          const q = p.quorum ? Math.min(100, (Number(p.scores_total || 0) / Number(p.quorum)) * 100) : 0;
          return `<a class="pcard" href="#/${p.id}">
            <div><span class="badge ${p.state}">${p.state}</span><span class="meta">${p.votes || 0} votes · ${fmtVp(p.scores_total)} JUSTICE</span></div>
            <h3>${escapeHtml(p.title)}</h3>
            <div class="meta">Ends ${when(p.end)} · quorum ${q.toFixed(0)}%</div>
          </a>`;
        })
        .join("")
    : `<div class="panel"><div class="empty" style="color:#4a4a4a;">No ${state.filter} proposals.</div></div>`;
  appEl.innerHTML = `<div class="filters">${tabs}</div><div class="plist">${cards}</div>`;
  appEl.querySelectorAll("[data-filter]").forEach((b) => {
    b.addEventListener("click", () => {
      state.filter = b.dataset.filter;
      render();
    });
  });
}

function renderDetail() {
  const p = state.proposal;
  if (!p) {
    appEl.innerHTML = `<div class="panel">Proposal not found. <a class="back" href="#/">Back</a></div>`;
    return;
  }
  const total = Number(p.scores_total || 0);
  const quorum = Number(p.quorum || 0);
  const choices = (p.choices || [])
    .map((c, i) => {
      const score = Number((p.scores && p.scores[i]) || 0);
      const pct = total ? (score / total) * 100 : 0;
      const on = state.choice === i + 1 ? " on" : "";
      return `<button type="button" class="choice${on}" data-c="${i + 1}">
        <span class="sc">${fmtVp(score)} · ${pct.toFixed(1)}%</span>
        ${escapeHtml(c)}
        <div class="bar"><span style="width:${pct}%"></span></div>
      </button>`;
    })
    .join("");
  const canVote = p.state === "active" && state.address && (state.vp?.vp || 0) > 0;
  const voteLabel = !state.address
    ? "Connect wallet to vote"
    : p.state !== "active"
    ? "Voting closed"
    : (state.vp?.vp || 0) <= 0
    ? "No voting power at snapshot"
    : state.busy
    ? "Submitting…"
    : state.myVote
    ? "Update vote"
    : "Sign vote (no gas)";
  const voters = (state.votes || [])
    .map(
      (v) => `<div class="voter">
        <span><a href="https://etherscan.io/address/${v.voter}" target="_blank" rel="noreferrer">${short(v.voter)}</a>
        · choice ${v.choice}</span>
        <span>${fmtVp(v.vp)} JUSTICE</span>
      </div>`
    )
    .join("");
  appEl.innerHTML = `
    <a class="back" href="#/">← All proposals</a>
    <div class="panel">
      <div><span class="badge ${p.state}">${p.state}</span>
        <span style="color:#4a4a4a;font-size:13px;">${p.type} · snapshot block ${p.snapshot}</span></div>
      <h2 style="margin-top:10px;">${escapeHtml(p.title)}</h2>
      <div class="body">${renderBody(p.body)}</div>
      ${p.discussion ? `<p class="tiny"><a href="${escapeHtml(p.discussion)}" target="_blank" rel="noreferrer">Discussion</a></p>` : ""}
      <div class="tiny" style="margin-bottom:12px;">
        Author ${short(p.author)} · ${when(p.start)} → ${when(p.end)}<br />
        ${fmtVp(total)} JUSTICE cast · quorum ${fmtVp(quorum)}
        (${quorum ? Math.min(100, (total / quorum) * 100).toFixed(0) : 0}%)
        ${state.address ? `<br />Your voting power: ${fmtVp(state.vp?.vp || 0)} JUSTICE` : ""}
        ${state.myVote ? `<br />You already voted for choice ${state.myVote.choice}.` : ""}
      </div>
      ${choices}
      <button class="swap-btn" id="voteBtn" type="button" ${canVote && state.choice && !state.busy ? "" : "disabled"}>${voteLabel}</button>
      <div class="tiny" style="margin-top:8px;">Signs an EIP-712 message to seq.snapshot.org. Same vote as snapshot.box. No transaction fee.</div>
    </div>
    <div class="panel">
      <h2>Top votes</h2>
      ${voters || `<div class="empty" style="color:#4a4a4a;">No votes yet.</div>`}
    </div>`;
  appEl.querySelectorAll(".choice").forEach((b) => {
    b.addEventListener("click", () => {
      if (p.state !== "active") return;
      state.choice = Number(b.dataset.c);
      render();
    });
  });
  $("voteBtn")?.addEventListener("click", () => {
    if (!state.address) return connect();
    castVote();
  });
}

function render() {
  if (pidFromHash()) renderDetail();
  else renderList();
}

async function route() {
  const id = pidFromHash();
  try {
    if (id) {
      appEl.innerHTML = `<div class="panel">Loading proposal…</div>`;
      await loadProposal(id);
    } else {
      appEl.innerHTML = `<div class="panel">Loading proposals…</div>`;
      await loadList();
      state.proposal = null;
    }
  } catch (e) {
    appEl.innerHTML = `<div class="panel">Could not load Snapshot data. ${escapeHtml(e.message || "")}</div>`;
    return;
  }
  render();
}

$("walletBtn").addEventListener("click", () => {
  if (!state.address) return connect();
  $("walletMenu").hidden = !$("walletMenu").hidden;
});
$("switchBtn").addEventListener("click", () => connect({ pick: true }));
$("disconnectBtn").addEventListener("click", disconnect);
document.addEventListener("click", (e) => {
  if (!e.target.closest(".wallet-wrap")) hideWalletMenu();
});
window.addEventListener("hashchange", route);

if (window.ethereum) {
  window.ethereum.request({ method: "eth_accounts" }).then((acc) => {
    if (acc && acc[0]) applyAccount(acc[0]);
  });
  window.ethereum.on?.("accountsChanged", (acc) => {
    if (!acc || !acc[0]) disconnect();
    else applyAccount(acc[0]);
  });
}
route();

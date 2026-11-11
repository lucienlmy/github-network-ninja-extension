const COL_W = 16;
const ROW_H = 28;
const NODE_R = 3.5;
const PAD_L = 128;
const PAD_T = 52;

const statusEl = document.getElementById("status");
const repoEl = document.getElementById("repo");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const tip = document.getElementById("tip");

let commits = [];
let meta = null;
let maxT = 0;
let maxS = 0;
let offsetX = 20;
let offsetY = 10;
let scale = 1;
let dragging = false;
let moved = false;
let lastMX = 0;
let lastMY = 0;
let hoverCommit = null;
let needsDraw = false;

const colorCache = {};
const palette = [
  "#24292f", "#0969da", "#1a7f37", "#8250df", "#bf3989",
  "#cf222e", "#bc4c00", "#6e7781", "#0550ae", "#116329",
];

function scheduleDraw() {
  if (needsDraw) return;
  needsDraw = true;
  requestAnimationFrame(() => {
    needsDraw = false;
    draw();
  });
}

function colorFor(login, space) {
  const key = login || "s" + space;
  if (colorCache[key]) return colorCache[key];
  let h = 0;
  const s = String(key);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  colorCache[key] = palette[h % palette.length];
  return colorCache[key];
}

function userBySpace(space) {
  if (!meta?.blocks) return { name: "?", repo: "?" };
  for (let i = meta.blocks.length - 1; i >= 0; i--) {
    if (space >= meta.blocks[i].start) {
      const name = meta.blocks[i].name;
      const u = (meta.users || []).find((x) => x.name === name);
      return { name, repo: u ? u.repo : "?" };
    }
  }
  return { name: "?", repo: "?" };
}

function wx(t) {
  return PAD_L + t * COL_W * scale + offsetX;
}
function wy(s) {
  return PAD_T + s * ROW_H * scale + offsetY;
}

function resize() {
  const body = canvas.parentElement;
  const w = body.clientWidth;
  const h = body.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scheduleDraw();
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function loadNetwork(repo) {
  statusEl.textContent = "拉取 meta…";
  meta = await fetchJson(`https://github.com/${repo}/network/meta`);
  const nethash = meta.nethash;
  if (!nethash) throw new Error("meta 中无 nethash");

  commits = [];
  let offset = 0;
  const pageSize = 500;
  const maxCommits = 12000;
  while (offset < maxCommits) {
    statusEl.textContent = `拉取提交 ${commits.length}…`;
    const url = `https://github.com/${repo}/network/chunk?nethash=${encodeURIComponent(
      nethash
    )}&start=${offset}&end=${offset + pageSize - 1}`;
    const resp = await fetchJson(url);
    const batch = resp.commits || [];
    commits.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    await new Promise((r) => setTimeout(r, 200));
  }

  maxT = 0;
  maxS = 0;
  for (const c of commits) {
    if (c.time > maxT) maxT = c.time;
    if (c.space > maxS) maxS = c.space;
  }
  if (meta.blocks) {
    for (const b of meta.blocks) {
      const end = b.start + (b.count || 1) - 1;
      if (end > maxS) maxS = end;
    }
  }
  if (meta.dates && meta.dates.length - 1 > maxT) maxT = meta.dates.length - 1;

  statusEl.textContent = `${commits.length} 提交 · ${(meta.users || []).length} 仓库`;
  const viewW = canvas.parentElement.clientWidth;
  scale = 1;
  offsetX = Math.min(20, viewW - PAD_L - (maxT + 2) * COL_W - 40);
  offsetY = 10;
  scheduleDraw();
}

function visibleTimeRange(w) {
  let t0 = Math.floor(-offsetX / (COL_W * scale)) - 2;
  let t1 = Math.ceil((w - PAD_L - offsetX) / (COL_W * scale)) + 2;
  if (t0 < 0) t0 = 0;
  if (t1 > maxT) t1 = maxT;
  return { t0, t1 };
}

function visibleSpaceRange(h) {
  let s0 = Math.floor(-offsetY / (ROW_H * scale)) - 1;
  let s1 = Math.ceil((h - PAD_T - offsetY) / (ROW_H * scale)) + 1;
  if (s0 < 0) s0 = 0;
  if (s1 > maxS) s1 = maxS;
  return { s0, s1 };
}

function draw() {
  if (!meta) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#656d76";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("输入 owner/repo 后点击「加载网络图」", w / 2, h / 2);
    return;
  }

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  const tr = visibleTimeRange(w);
  const sr = visibleSpaceRange(h);

  if (meta.blocks) {
    meta.blocks.forEach((b, bi) => {
      const bEnd = b.start + (b.count || 1) - 1;
      if (bEnd < sr.s0 || b.start > sr.s1) return;
      const y0 = wy(b.start) - ROW_H * scale * 0.5;
      const y1 = wy(b.start + b.count) - ROW_H * scale * 0.5;
      ctx.fillStyle = bi % 2 === 0 ? "#f6f8fa" : "#ffffff";
      ctx.fillRect(0, y0, w, Math.max(1, y1 - y0));
    });
  }

  ctx.strokeStyle = "#eaeef2";
  ctx.lineWidth = 1;
  for (let s = sr.s0; s <= sr.s1; s++) {
    const y = wy(s);
    ctx.beginPath();
    ctx.moveTo(PAD_L, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#f6f8fa";
  ctx.fillRect(0, 0, w, PAD_T);
  ctx.strokeStyle = "#d0d7de";
  ctx.beginPath();
  ctx.moveTo(0, PAD_T - 0.5);
  ctx.lineTo(w, PAD_T - 0.5);
  ctx.stroke();

  ctx.fillStyle = "#afb8c1";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Owners", PAD_L / 2, PAD_T / 2);

  ctx.strokeStyle = "#d0d7de";
  ctx.beginPath();
  ctx.moveTo(PAD_L - 0.5, 0);
  ctx.lineTo(PAD_L - 0.5, h);
  ctx.stroke();

  const dates = meta.dates || [];
  const step = scale >= 1.4 ? 1 : scale >= 0.9 ? 2 : scale >= 0.55 ? 4 : 8;
  let lastMonth = "";
  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let t = tr.t0; t <= tr.t1; t++) {
    const x = wx(t);
    ctx.strokeStyle = "#eaeef2";
    ctx.beginPath();
    ctx.moveTo(x, PAD_T);
    ctx.lineTo(x, h);
    ctx.stroke();
    if (t % step !== 0) continue;
    let label = String(t);
    let monthLab = "";
    if (dates[t]) {
      const parts = String(dates[t]).split("-");
      if (parts.length >= 3) {
        label = String(parseInt(parts[2], 10));
        monthLab = months[parseInt(parts[1], 10)] || parts[1];
      }
    }
    ctx.fillStyle = "#656d76";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(label, x, PAD_T - 8);
    if (monthLab && monthLab !== lastMonth) {
      ctx.fillStyle = "#24292f";
      ctx.font = "11px sans-serif";
      ctx.fillText(monthLab, x, 14);
      lastMonth = monthLab;
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, PAD_T, PAD_L - 1, h - PAD_T);
  ctx.clip();
  if (meta.blocks) {
    for (const bb of meta.blocks) {
      const bEnd2 = bb.start + (bb.count || 1) - 1;
      if (bEnd2 < sr.s0 || bb.start > sr.s1) continue;
      const yMid = (wy(bb.start) + wy(bb.start + bb.count - 1)) / 2;
      ctx.fillStyle = "#24292f";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let name = bb.name || "?";
      if (name.length > 14) name = name.slice(0, 12) + "…";
      ctx.fillText(name, PAD_L / 2, yMid);
    }
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(PAD_L, PAD_T, w - PAD_L, h - PAD_T);
  ctx.clip();

  const drawEdges = scale >= 0.45;
  const edgeW = Math.max(1, 1.4 * Math.min(scale, 1.4));
  if (drawEdges) {
    for (const c of commits) {
      if (c.time < tr.t0 - 5 || c.time > tr.t1 + 1) continue;
      if (c.space < sr.s0 - 2 || c.space > sr.s1 + 2) continue;
      const parents = c.parents;
      if (!parents?.length) continue;
      const x2 = wx(c.time);
      const y2 = wy(c.space);
      ctx.strokeStyle = colorFor(c.login || c.author, c.space);
      ctx.lineWidth = edgeW;
      for (const p of parents) {
        const x1 = wx(p[2]);
        const y1 = wy(p[1]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        if (y1 === y2) ctx.lineTo(x2, y2);
        else {
          const midX = x1 + Math.max(6 * scale, (x2 - x1) * 0.4);
          ctx.lineTo(midX, y1);
          ctx.lineTo(midX, y2);
          ctx.lineTo(x2, y2);
        }
        ctx.stroke();
      }
    }
  }

  const r = Math.max(2.2, NODE_R * Math.min(scale, 1.6));
  for (const n of commits) {
    if (n.time < tr.t0 || n.time > tr.t1) continue;
    if (n.space < sr.s0 || n.space > sr.s1) continue;
    const nx = wx(n.time);
    const ny = wy(n.space);
    ctx.beginPath();
    ctx.fillStyle = colorFor(n.login || n.author, n.space);
    ctx.arc(nx, ny, r, 0, Math.PI * 2);
    ctx.fill();
    if (hoverCommit && hoverCommit.id === n.id) {
      ctx.strokeStyle = "#0969da";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function hitTest(sx, sy) {
  if (sx < PAD_L || sy < PAD_T) return null;
  const t = (sx - PAD_L - offsetX) / (COL_W * scale);
  const s = (sy - PAD_T - offsetY) / (ROW_H * scale);
  const t0 = Math.floor(t) - 1;
  const t1 = Math.ceil(t) + 1;
  let best = null;
  let bestD = Math.max(8, 9 * scale);
  for (const c of commits) {
    if (c.time < t0 || c.time > t1) continue;
    if (Math.abs(c.space - s) > 1.5) continue;
    const dx = wx(c.time) - sx;
    const dy = wy(c.space) - sy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function showTip(c, cx, cy) {
  const u = userBySpace(c.space);
  tip.style.display = "block";
  tip.innerHTML =
    '<div class="tip-msg"></div><div class="tip-meta"></div><div class="tip-hash"></div>';
  tip.querySelector(".tip-msg").textContent = c.message || "(no message)";
  tip.querySelector(".tip-meta").textContent = `${c.login || c.author || "?"} · ${c.date || ""} · ${u.name}/${u.repo}`;
  tip.querySelector(".tip-hash").textContent = (c.id || "").slice(0, 12);
  tip.style.left = Math.min(cx + 14, window.innerWidth - 380) + "px";
  tip.style.top = Math.min(cy + 14, window.innerHeight - 120) + "px";
}

function hideTip() {
  tip.style.display = "none";
}

canvas.addEventListener("mousedown", (e) => {
  dragging = true;
  moved = false;
  lastMX = e.clientX;
  lastMY = e.clientY;
});
window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMX;
  const dy = e.clientY - lastMY;
  if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
  offsetX += dx;
  offsetY += dy;
  lastMX = e.clientX;
  lastMY = e.clientY;
  hideTip();
  scheduleDraw();
});
window.addEventListener("mouseup", () => {
  dragging = false;
});

canvas.addEventListener("mousemove", (e) => {
  if (dragging) return;
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const c = hitTest(sx, sy);
  if (c !== hoverCommit) {
    hoverCommit = c;
    scheduleDraw();
    if (c) showTip(c, e.clientX, e.clientY);
    else hideTip();
  } else if (c) {
    tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 380) + "px";
    tip.style.top = Math.min(e.clientY + 14, window.innerHeight - 120) + "px";
  }
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const t0 = (sx - PAD_L - offsetX) / (COL_W * scale);
    const s0 = (sy - PAD_T - offsetY) / (ROW_H * scale);
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.min(3.5, Math.max(0.3, scale * delta));
    offsetX = sx - PAD_L - t0 * COL_W * scale;
    offsetY = sy - PAD_T - s0 * ROW_H * scale;
    scheduleDraw();
  },
  { passive: false }
);

canvas.addEventListener("click", (e) => {
  if (moved) return;
  const rect = canvas.getBoundingClientRect();
  const c = hitTest(e.clientX - rect.left, e.clientY - rect.top);
  if (!c) return;
  const u = userBySpace(c.space);
  window.open(`https://github.com/${u.name}/${u.repo}/commit/${c.id}`, "_blank");
});

document.getElementById("btn-load").addEventListener("click", async () => {
  const repo = (repoEl.value || "").trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/network.*$/, "").replace(/\/$/, "");
  if (!/ maj-[-\w.]+\/[-\w.]+$/.test(repo) && !/^[-
\w.]+\/[-\w.]+$/.test(repo)) {
    statusEl.textContent = "请输入有效的 owner/repo";
    return;
  }
  try {
    await loadNetwork(repo);
  } catch (err) {
    statusEl.textContent = "加载失败：" + (err.message || String(err));
  }
});

window.addEventListener("resize", resize);
resize();
repoEl.value = "dexyfex/CodeWalker";

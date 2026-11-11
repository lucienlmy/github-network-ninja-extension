// Custom network graph — same layout language as GitHub Network, our own canvas
(function () {
  "use strict";

  var COL_W = 16;
  var ROW_H = 28;
  var NODE_R = 3.5;
  var PAD_L = 128;
  var PAD_T = 52;
  var PAD_R = 40;
  var PAD_B = 24;

  var root = null;
  var canvas = null;
  var ctx = null;
  var tip = null;
  var statusEl = null;
  var searchEl = null;

  var commits = [];
  var commitByKey = {};
  var meta = null;
  var repo = null;
  var pageRequest = null;

  var offsetX = 0;
  var offsetY = 0;
  var scale = 1;
  var dragging = false;
  var moved = false;
  var lastMX = 0;
  var lastMY = 0;
  var hoverCommit = null;
  var filterQ = "";

  var colorCache = {};
  var palette = [
    "#24292f",
    "#0969da",
    "#1a7f37",
    "#8250df",
    "#bf3989",
    "#cf222e",
    "#bc4c00",
    "#6e7781",
    "#0550ae",
    "#116329",
  ];

  function colorFor(login, space) {
    var key = login || "s" + space;
    if (colorCache[key]) return colorCache[key];
    var h = 0;
    var s = String(key);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    var c = palette[h % palette.length];
    colorCache[key] = c;
    return c;
  }

  function userBySpace(space) {
    if (!meta || !meta.blocks) return { name: "?", repo: "?" };
    for (var i = meta.blocks.length - 1; i >= 0; i--) {
      if (space >= meta.blocks[i].start) {
        var name = meta.blocks[i].name;
        var u = (meta.users || []).find(function (x) {
          return x.name === name;
        });
        return { name: name, repo: u ? u.repo : "?", block: meta.blocks[i] };
      }
    }
    return { name: "?", repo: "?", block: null };
  }

  function open(opts) {
    pageRequest = opts.pageRequest;
    repo = opts.repo;
    if (!repo || !pageRequest) return;
    buildUI();
    loadData();
  }

  function close() {
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
    canvas = null;
    ctx = null;
    commits = [];
    commitByKey = {};
    hoverCommit = null;
    document.body.style.overflow = "";
  }

  function buildUI() {
    if (root) close();
    document.body.style.overflow = "hidden";

    root = document.createElement("div");
    root.className = "ghn-graph-root";
    root.innerHTML =
      '<div class="ghn-graph-bar">' +
      '<div class="ghn-graph-title">增强网络图 <span class="ghn-graph-sub">布局同 GitHub Network</span> <span class="ghn-graph-status">加载中…</span></div>' +
      '<div class="ghn-graph-actions">' +
      '<input class="ghn-graph-search" type="search" placeholder="筛选提交 / 作者 / hash…" />' +
      '<button type="button" class="ghn-btn ghn-btn-primary ghn-graph-close">关闭</button>' +
      "</div></div>" +
      '<div class="ghn-graph-body"><canvas></canvas>' +
      '<div class="ghn-graph-tip" style="display:none"></div></div>' +
      '<div class="ghn-graph-help">与原版相同：左 Owners · 上时间轴 · 点=提交 · 线=父子关系　｜　拖拽平移 · 滚轮缩放 · 悬停详情 · 单击打开</div>';

    document.body.appendChild(root);
    canvas = root.querySelector("canvas");
    ctx = canvas.getContext("2d");
    tip = root.querySelector(".ghn-graph-tip");
    statusEl = root.querySelector(".ghn-graph-status");
    searchEl = root.querySelector(".ghn-graph-search");

    root.querySelector(".ghn-graph-close").addEventListener("click", close);
    searchEl.addEventListener("input", function () {
      filterQ = (searchEl.value || "").toLowerCase().trim();
      draw();
    });

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("mousemove", onHover);

    window.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape" && root) close();
    });

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
  }

  function resizeCanvas() {
    if (!canvas || !root) return;
    var body = root.querySelector(".ghn-graph-body");
    var w = body.clientWidth;
    var h = body.clientHeight;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  async function loadData() {
    try {
      statusEl.textContent = "拉取 meta…";
      meta = await pageRequest("ghn-fetch-meta", {
        url: "https://github.com/" + repo + "/network/meta",
      });
      var nethash = meta.nethash;
      if (!nethash) throw new Error("meta 中无 nethash");

      commits = [];
      var offset = 0;
      var pageSize = 500;
      var maxCommits = 15000;
      while (offset < maxCommits) {
        statusEl.textContent = "拉取提交 " + commits.length + "…";
        var url =
          "https://github.com/" +
          repo +
          "/network/chunk?nethash=" +
          encodeURIComponent(nethash) +
          "&start=" +
          offset +
          "&end=" +
          (offset + pageSize - 1);
        var resp = await pageRequest("ghn-fetch-chunk", { url: url });
        var batch = resp.commits || [];
        commits = commits.concat(batch);
        if (batch.length < pageSize) break;
        offset += pageSize;
        await sleep(250);
      }

      commitByKey = {};
      commits.forEach(function (c) {
        commitByKey[c.time + "|" + c.space] = c;
      });

      statusEl.textContent =
        commits.length +
        " 提交 · " +
        ((meta.users && meta.users.length) || 0) +
        " 仓库 · 最近 " +
        ((meta.dates && meta.dates.length) || 0) +
        " 日刻度";

      var maxT = 0;
      commits.forEach(function (c) {
        if (c.time > maxT) maxT = c.time;
      });
      var body = root.querySelector(".ghn-graph-body");
      var viewW = body.clientWidth;
      scale = 1;
      offsetX = Math.min(20, viewW - PAD_L - (maxT + 2) * COL_W - PAD_R);
      offsetY = 10;
      draw();
    } catch (err) {
      statusEl.textContent =
        "加载失败：" + (err && err.message ? err.message : String(err));
    }
  }

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function wx(t) {
    return PAD_L + t * COL_W * scale + offsetX;
  }
  function wy(s) {
    return PAD_T + s * ROW_H * scale + offsetY;
  }

  function matchesFilter(c) {
    if (!filterQ) return true;
    var u = userBySpace(c.space);
    var blob = (
      (c.message || "") +
      " " +
      (c.login || "") +
      " " +
      (c.author || "") +
      " " +
      u.name +
      " " +
      (c.id || "")
    ).toLowerCase();
    return blob.indexOf(filterQ) !== -1;
  }

  function maxSpace() {
    var m = 0;
    if (meta && meta.blocks) {
      meta.blocks.forEach(function (b) {
        var end = b.start + (b.count || 1) - 1;
        if (end > m) m = end;
      });
    }
    commits.forEach(function (c) {
      if (c.space > m) m = c.space;
    });
    return m;
  }

  function maxTime() {
    var m = 0;
    commits.forEach(function (c) {
      if (c.time > m) m = c.time;
    });
    if (meta && meta.dates && meta.dates.length - 1 > m)
      m = meta.dates.length - 1;
    return m;
  }

  function draw() {
    if (!ctx || !canvas) return;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    if (!meta) return;

    var ms = maxSpace();
    var mt = maxTime();
    var dates = meta.dates || [];

    if (meta.blocks) {
      meta.blocks.forEach(function (b, idx) {
        var y0 = wy(b.start) - ROW_H * scale * 0.5;
        var y1 = wy(b.start + b.count) - ROW_H * scale * 0.5;
        if (y1 < 0 || y0 > h) return;
        ctx.fillStyle = idx % 2 === 0 ? "#f6f8fa" : "#ffffff";
        ctx.fillRect(0, y0, w, Math.max(1, y1 - y0));
      });
    }

    for (var s = 0; s <= ms; s++) {
      var y = wy(s);
      if (y < PAD_T - 20 || y > h + 20) continue;
      ctx.strokeStyle = "#eaeef2";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD_L, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.save();
    ctx.fillStyle = "#f6f8fa";
    ctx.fillRect(0, 0, w, PAD_T);
    ctx.strokeStyle = "#d0d7de";
    ctx.beginPath();
    ctx.moveTo(0, PAD_T - 0.5);
    ctx.lineTo(w, PAD_T - 0.5);
    ctx.stroke();

    ctx.fillStyle = "#afb8c1";
    ctx.font = "11px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Owners", PAD_L / 2, PAD_T / 2);

    ctx.strokeStyle = "#d0d7de";
    ctx.beginPath();
    ctx.moveTo(PAD_L - 0.5, 0);
    ctx.lineTo(PAD_L - 0.5, h);
    ctx.stroke();

    var step = scale >= 1.2 ? 1 : scale >= 0.7 ? 2 : scale >= 0.4 ? 4 : 8;
    var lastMonth = "";
    for (var t = 0; t <= mt; t++) {
      var x = wx(t);
      if (x < PAD_L - 10 || x > w + 10) continue;
      ctx.strokeStyle = "#eaeef2";
      ctx.beginPath();
      ctx.moveTo(x, PAD_T);
      ctx.lineTo(x, h);
      ctx.stroke();
      if (t % step !== 0) continue;
      var label = "";
      var monthLab = "";
      if (dates[t]) {
        var parts = String(dates[t]).split("-");
        if (parts.length >= 3) {
          label = String(parseInt(parts[2], 10));
          var mon = parts[1];
          var months = [
            "",
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
          ];
          var mi = parseInt(mon, 10);
          monthLab = months[mi] || mon;
        } else label = String(dates[t]);
      } else label = String(t);

      ctx.fillStyle = "#656d76";
      ctx.font = "10px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(label, x, PAD_T - 8);
      if (monthLab && monthLab !== lastMonth) {
        ctx.fillStyle = "#24292f";
        ctx.font = "11px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";
        ctx.fillText(monthLab, x, 14);
        lastMonth = monthLab;
      }
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, PAD_T, PAD_L - 1, h - PAD_T);
    ctx.clip();
    if (meta.blocks) {
      meta.blocks.forEach(function (b) {
        var yMid = (wy(b.start) + wy(b.start + b.count - 1)) / 2;
        if (yMid < PAD_T || yMid > h) return;
        ctx.fillStyle = "#24292f";
        ctx.font =
          "12px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        var name = b.name || "?";
        if (name.length > 14) name = name.slice(0, 12) + "…";
        ctx.fillText(name, PAD_L / 2, yMid);
      });
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD_L, PAD_T, w - PAD_L, h - PAD_T);
    ctx.clip();

    commits.forEach(function (c) {
      if (!matchesFilter(c)) return;
      var parents = c.parents || [];
      var x2 = wx(c.time);
      var y2 = wy(c.space);
      var col = colorFor(c.login || c.author, c.space);
      parents.forEach(function (p) {
        var x1 = wx(p[2]);
        var y1 = wy(p[1]);
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1.2, 1.6 * Math.min(scale, 1.5));
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        if (y1 === y2) {
          ctx.lineTo(x2, y2);
        } else {
          var midX = x1 + Math.max(8 * scale, (x2 - x1) * 0.45);
          ctx.lineTo(midX, y1);
          ctx.lineTo(midX, y2);
          ctx.lineTo(x2, y2);
        }
        ctx.stroke();
      });
    });

    commits.forEach(function (c) {
      if (!matchesFilter(c)) return;
      var x = wx(c.time);
      var y = wy(c.space);
      if (x < PAD_L - 20 || x > w + 20 || y < PAD_T - 20 || y > h + 20)
        return;
      var r = Math.max(2.5, NODE_R * Math.min(scale, 1.8));
      ctx.beginPath();
      ctx.fillStyle = colorFor(c.login || c.author, c.space);
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (hoverCommit && hoverCommit.id === c.id) {
        ctx.strokeStyle = "#0969da";
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = "rgba(9,105,218,0.35)";
        ctx.lineWidth = 1;
        ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  function hitTest(sx, sy) {
    if (sx < PAD_L || sy < PAD_T) return null;
    var best = null;
    var bestD = Math.max(8, 10 * scale);
    for (var i = 0; i < commits.length; i++) {
      var c = commits[i];
      if (!matchesFilter(c)) continue;
      var dx = wx(c.time) - sx;
      var dy = wy(c.space) - sy;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  function onHover(e) {
    if (dragging) return;
    var rect = canvas.getBoundingClientRect();
    var sx = e.clientX - rect.left;
    var sy = e.clientY - rect.top;
    var c = hitTest(sx, sy);
    if (c !== hoverCommit) {
      hoverCommit = c;
      draw();
      if (c) showTip(c, e.clientX, e.clientY);
      else hideTip();
    } else if (c) {
      tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 380) + "px";
      tip.style.top = Math.min(e.clientY + 14, window.innerHeight - 120) + "px";
    }
  }

  function showTip(c, cx, cy) {
    var u = userBySpace(c.space);
    tip.style.display = "block";
    tip.innerHTML =
      '<div class="ghn-tip-msg"></div>' +
      '<div class="ghn-tip-meta"></div>' +
      '<div class="ghn-tip-hash"></div>';
    tip.querySelector(".ghn-tip-msg").textContent = c.message || "(no message)";
    tip.querySelector(".ghn-tip-meta").textContent =
      (c.login || c.author || "?") +
      " · " +
      (c.date || "") +
      " · " +
      u.name +
      "/" +
      u.repo;
    tip.querySelector(".ghn-tip-hash").textContent = (c.id || "").slice(0, 12);
    tip.style.left = Math.min(cx + 14, window.innerWidth - 380) + "px";
    tip.style.top = Math.min(cy + 14, window.innerHeight - 120) + "px";
  }

  function hideTip() {
    tip.style.display = "none";
  }

  function onDown(e) {
    dragging = true;
    moved = false;
    lastMX = e.clientX;
    lastMY = e.clientY;
  }
  function onMove(e) {
    if (!dragging) return;
    var dx = e.clientX - lastMX;
    var dy = e.clientY - lastMY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    offsetX += dx;
    offsetY += dy;
    lastMX = e.clientX;
    lastMY = e.clientY;
    hideTip();
    draw();
  }
  function onUp() {
    dragging = false;
  }

  function onWheel(e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var sx = e.clientX - rect.left;
    var sy = e.clientY - rect.top;
    var t0 = (sx - PAD_L - offsetX) / (COL_W * scale);
    var s0 = (sy - PAD_T - offsetY) / (ROW_H * scale);
    var delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.min(3.5, Math.max(0.3, scale * delta));
    offsetX = sx - PAD_L - t0 * COL_W * scale;
    offsetY = sy - PAD_T - s0 * ROW_H * scale;
    draw();
  }

  function onClick(e) {
    if (moved) return;
    var rect = canvas.getBoundingClientRect();
    var c = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (!c) return;
    var u = userBySpace(c.space);
    window.open(
      "https://github.com/" + u.name + "/" + u.repo + "/commit/" + c.id,
      "_blank",
      "noopener"
    );
  }

  window.__ghnEnhancedGraph = { open: open, close: close };
})();

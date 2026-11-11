// Custom network graph — fully controlled overlay (no GitHub canvas)
(function () {
  "use strict";

  var ROW_H = 22;
  var COL_W = 14;
  var NODE_R = 4;
  var PAD_L = 140;
  var PAD_T = 40;

  var root = null;
  var canvas = null;
  var ctx = null;
  var tip = null;
  var statusEl = null;
  var searchEl = null;

  var commits = [];
  var meta = null;
  var repo = null;
  var pageRequest = null;

  var offsetX = 0;
  var offsetY = 0;
  var scale = 1;
  var dragging = false;
  var lastMX = 0;
  var lastMY = 0;
  var hoverCommit = null;
  var filterQ = "";

  var colorCache = {};

  function colorFor(login) {
    if (colorCache[login]) return colorCache[login];
    var h = 0;
    var s = String(login || "?");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    var hue = h % 360;
    var c = "hsl(" + hue + ",65%,42%)";
    colorCache[login] = c;
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
        return { name: name, repo: u ? u.repo : "?" };
      }
    }
    return { name: "?", repo: "?" };
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
      '<div class="ghn-graph-title">增强网络图 <span class="ghn-graph-status">加载中…</span></div>' +
      '<div class="ghn-graph-actions">' +
      '<input class="ghn-graph-search" type="search" placeholder="筛选提交 / 作者…" />' +
      '<button type="button" class="ghn-btn ghn-btn-primary ghn-graph-close">关闭</button>' +
      "</div></div>" +
      '<div class="ghn-graph-body"><canvas></canvas>' +
      '<div class="ghn-graph-tip" style="display:none"></div></div>' +
      '<div class="ghn-graph-help">拖拽平移 · 滚轮缩放 · 悬停查看 · 单击打开提交</div>';

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
      if (e.key === "Escape" && root) {
        close();
      }
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
        await sleep(300);
      }
      statusEl.textContent =
        commits.length +
        " 提交 · " +
        ((meta.users && meta.users.length) || 0) +
        " 仓库";
      offsetX = 20;
      offsetY = 20;
      scale = 1;
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

  function worldToScreen(x, y) {
    return {
      x: PAD_L + x * COL_W * scale + offsetX,
      y: PAD_T + y * ROW_H * scale + offsetY,
    };
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - PAD_L - offsetX) / (COL_W * scale),
      y: (sy - PAD_T - offsetY) / (ROW_H * scale),
    };
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

  function draw() {
    if (!ctx || !canvas) return;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    if (!commits.length) return;

    var spaces = {};
    commits.forEach(function (c) {
      spaces[c.space] = true;
    });
    Object.keys(spaces)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      })
      .forEach(function (sp) {
        var u = userBySpace(sp);
        var p = worldToScreen(0, sp);
        if (p.y < 10 || p.y > h - 10) return;
        ctx.fillStyle = "#656d76";
        ctx.font = "11px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        var label = u.name;
        if (label.length > 16) label = label.slice(0, 14) + "…";
        ctx.fillText(label, PAD_L - 10, p.y);
        ctx.strokeStyle = "rgba(208,215,222,0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD_L, p.y);
        ctx.lineTo(w, p.y);
        ctx.stroke();
      });

    commits.forEach(function (c) {
      if (!matchesFilter(c)) return;
      var parents = c.parents || [];
      var to = worldToScreen(c.time, c.space);
      var col = colorFor(c.login || c.author);
      parents.forEach(function (p) {
        var from = worldToScreen(p[2], p[1]);
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1, 1.5 * scale);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        var mx = (from.x + to.x) / 2;
        ctx.bezierCurveTo(mx, from.y, mx, to.y, to.x, to.y);
        ctx.stroke();
      });
    });

    commits.forEach(function (c) {
      if (!matchesFilter(c)) return;
      var p = worldToScreen(c.time, c.space);
      if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) return;
      var r = Math.max(2, NODE_R * scale);
      ctx.beginPath();
      ctx.fillStyle = colorFor(c.login || c.author);
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (hoverCommit && hoverCommit.id === c.id) {
        ctx.strokeStyle = "#0969da";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  }

  function hitTest(sx, sy) {
    var best = null;
    var bestD = 10;
    for (var i = 0; i < commits.length; i++) {
      var c = commits[i];
      if (!matchesFilter(c)) continue;
      var p = worldToScreen(c.time, c.space);
      var dx = p.x - sx;
      var dy = p.y - sy;
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
      tip.style.left = e.clientX + 14 + "px";
      tip.style.top = e.clientY + 14 + "px";
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
    tip.querySelector(".ghn-tip-hash").textContent = (c.id || "").slice(0, 10);
    tip.style.left = cx + 14 + "px";
    tip.style.top = cy + 14 + "px";
  }

  function hideTip() {
    tip.style.display = "none";
  }

  function onDown(e) {
    dragging = true;
    lastMX = e.clientX;
    lastMY = e.clientY;
  }
  function onMove(e) {
    if (!dragging) return;
    offsetX += e.clientX - lastMX;
    offsetY += e.clientY - lastMY;
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
    var before = screenToWorld(sx, sy);
    var delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.min(4, Math.max(0.25, scale * delta));
    var after = screenToWorld(sx, sy);
    offsetX += (after.x - before.x) * COL_W * scale;
    offsetY += (after.y - before.y) * ROW_H * scale;
    draw();
  }

  function onClick(e) {
    if (dragging) return;
    var rect = canvas.getBoundingClientRect();
    var c = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (!c) return;
    var u = userBySpace(c.space);
    var url =
      "https://github.com/" + u.name + "/" + u.repo + "/commit/" + c.id;
    window.open(url, "_blank", "noopener");
  }

  window.__ghnEnhancedGraph = { open: open, close: close };
})();

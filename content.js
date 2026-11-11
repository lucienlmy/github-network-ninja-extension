(function () {
  "use strict";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function getRepo() {
    const m = location.pathname.match(/^\/([^/]+)\/([^/]+)\/network/);
    return m ? m[1] + "/" + m[2] : null;
  }

  function waitFor(selector, timeout) {
    timeout = timeout || 15000;
    return new Promise(function (resolve, reject) {
      const el = $(selector);
      if (el) return resolve(el);
      const obs = new MutationObserver(function () {
        const el2 = $(selector);
        if (el2) {
          obs.disconnect();
          resolve(el2);
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(function () {
        obs.disconnect();
        reject(new Error("timeout waiting for " + selector));
      }, timeout);
    });
  }

  // Bridge to page.js (MAIN world)
  let msgId = 0;
  const pending = new Map();

  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.source !== "ghn-page") return;
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    if (data.type.endsWith("-err")) p.reject(new Error(data.error || "unknown"));
    else if (data.type === "ghn-nethash") p.resolve(data.nethash);
    else p.resolve(data.data);
  });

  function pageRequest(type, payload, timeoutMs) {
    timeoutMs = timeoutMs || 15000;
    const id = ++msgId;
    return new Promise(function (resolve, reject) {
      pending.set(id, { resolve: resolve, reject: reject });
      window.postMessage(
        Object.assign({ source: "ghn-extension", type: type, id: id }, payload),
        "*"
      );
      setTimeout(function () {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error("timeout"));
        }
      }, timeoutMs);
    });
  }

  function getNethashFromPage() {
    return pageRequest("ghn-get-nethash", {});
  }

  // ---------- focus mode (hide chrome only) ----------
  let isFullscreen = false;

  function getGraphEl() {
    return (
      $("network-graph") ||
      $(".js-network-graph-container") ||
      $(".network-graph-container")
    );
  }

  function enterFullscreen() {
    document.body.classList.add("ghn-fullscreen");
    isFullscreen = true;
    updateButtons();
  }

  function exitFullscreen() {
    document.body.classList.remove("ghn-fullscreen");
    isFullscreen = false;
    updateButtons();
  }

  function toggleFullscreen() {
    if (isFullscreen) exitFullscreen();
    else enterFullscreen();
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isFullscreen) {
      exitFullscreen();
    }
  });

  let btnFullscreen;

  function updateButtons() {
    if (btnFullscreen) {
      btnFullscreen.textContent = isFullscreen ? "退出专注" : "专注模式";
      btnFullscreen.classList.toggle("ghn-btn-primary", !isFullscreen);
    }
  }

  function createToolbar() {
    if ($(".ghn-toolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.className = "ghn-toolbar";

    btnFullscreen = document.createElement("button");
    btnFullscreen.type = "button";
    btnFullscreen.className = "ghn-btn ghn-btn-primary";
    btnFullscreen.textContent = "专注模式";
    btnFullscreen.addEventListener("click", toggleFullscreen);

    const btnCommits = document.createElement("button");
    btnCommits.type = "button";
    btnCommits.className = "ghn-btn";
    btnCommits.textContent = "提交列表";
    btnCommits.addEventListener("click", showCommitModal);

    toolbar.appendChild(btnFullscreen);
    toolbar.appendChild(btnCommits);

    let placed = false;
    const candidates = $$("h1, h2, .h1, .h2");
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      const t = (el.textContent || "").trim();
      if (/network\s*graph|网络图/i.test(t)) {
        const wrap = document.createElement("div");
        wrap.className = "ghn-title-row";
        wrap.style.display = "flex";
        wrap.style.alignItems = "center";
        wrap.style.flexWrap = "wrap";
        wrap.style.gap = "8px";
        const parent = el.parentElement;
        if (parent) {
          parent.insertBefore(wrap, el);
          wrap.appendChild(el);
          wrap.appendChild(toolbar);
          placed = true;
          break;
        }
      }
    }

    if (!placed) {
      const container =
        $(".js-network-graph-container") || $(".network-graph-container");
      if (container && container.parentElement) {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "flex-end";
        row.style.gap = "8px";
        row.style.margin = "0 0 8px 0";
        row.appendChild(toolbar);
        container.parentElement.insertBefore(row, container);
        placed = true;
      }
    }

    if (!placed) {
      document.body.appendChild(toolbar);
    }

    if (!$(".ghn-exit-bar")) {
      const exitBar = document.createElement("div");
      exitBar.className = "ghn-exit-bar";
      const exitBtn = document.createElement("button");
      exitBtn.type = "button";
      exitBtn.className = "ghn-btn ghn-btn-primary";
      exitBtn.textContent = "退出专注";
      exitBtn.addEventListener("click", exitFullscreen);
      const listBtn2 = document.createElement("button");
      listBtn2.type = "button";
      listBtn2.className = "ghn-btn";
      listBtn2.textContent = "提交列表";
      listBtn2.addEventListener("click", showCommitModal);
      exitBar.appendChild(exitBtn);
      exitBar.appendChild(listBtn2);
      document.body.appendChild(exitBar);
    }
  }

  // ---------- commit list ----------
  const config = {
    number_of_commits_per_request: 500,
    api_request_interval: 1000,
    number_of_max_commits: 10000,
  };

  let networkMetaData;
  let modalEl, maskEl, inputEl, tableEl, loadingEl;
  let numberOfTotalCommits = 0;
  let fetchInProgress = false;

  function showCommitModal() {
    if (modalEl) {
      maskEl.style.display = "block";
      modalEl.style.display = "flex";
      inputEl && inputEl.focus();
      return;
    }

    maskEl = document.createElement("div");
    maskEl.className = "ghn-mask";
    maskEl.addEventListener("click", hideCommitModal);

    modalEl = document.createElement("div");
    modalEl.className = "ghn-modal";
    modalEl.innerHTML =
      '<input type="text" placeholder="加载中…" />' +
      '<div class="ghn-table-wrap">' +
      '<div class="ghn-loading"><div class="num">0</div><div>commits fetched...</div>' +
      '<div style="margin-top:8px;font-size:12px">请等待全部提交拉取完成</div></div>' +
      '<table style="display:none"></table>' +
      "</div>";

    document.body.appendChild(maskEl);
    document.body.appendChild(modalEl);

    inputEl = modalEl.querySelector("input");
    loadingEl = modalEl.querySelector(".ghn-loading");
    tableEl = modalEl.querySelector("table");
    inputEl.addEventListener("input", debounce(filterTable, 300));

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modalEl && modalEl.style.display !== "none") {
        hideCommitModal();
        e.stopPropagation();
      }
    });

    startFetch();
  }

  function hideCommitModal() {
    if (maskEl) maskEl.style.display = "none";
    if (modalEl) modalEl.style.display = "none";
    if (inputEl) {
      inputEl.value = "";
      filterTable();
    }
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      const args = arguments;
      t = setTimeout(function () {
        fn.apply(null, args);
      }, ms);
    };
  }

  function filterTable() {
    if (!tableEl || !inputEl) return;
    const q = inputEl.value.toLowerCase().trim();
    $$("tr", tableEl).forEach(function (tr) {
      const text = tr.getAttribute("data-search") || "";
      tr.style.display = !q || text.includes(q) ? "" : "none";
    });
  }

  async function startFetch() {
    if (fetchInProgress) return;
    fetchInProgress = true;
    numberOfTotalCommits = 0;
    const repo = getRepo();
    if (!repo) {
      showError("无法识别当前仓库路径");
      return;
    }

    try {
      networkMetaData = await pageRequest("ghn-fetch-meta", {
        url: "https://github.com/" + repo + "/network/meta",
      });

      const nethash = await waitForNethash(20000);
      if (!nethash) {
        showError(
          "未能获取 nethash。请等网络图加载完成后再打开提交列表。"
        );
        return;
      }

      await fetchCommitsLoop(repo, nethash, 0);
    } catch (err) {
      showError(
        "无法获取网络元数据：" +
          (err && err.message ? err.message : String(err)) +
          "。请刷新页面后重试。"
      );
    } finally {
      fetchInProgress = false;
    }
  }

  function showError(msg) {
    if (loadingEl) {
      loadingEl.innerHTML =
        '<div style="color:#cf222e;padding:12px;line-height:1.5">' +
        escapeHtml(msg) +
        "</div>";
    }
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  function waitForNethash(timeoutMs) {
    const start = Date.now();
    return new Promise(function (resolve) {
      function tick() {
        getNethashFromPage()
          .then(function (h) {
            if (h) return resolve(h);
            if (Date.now() - start > timeoutMs) return resolve(null);
            setTimeout(tick, 400);
          })
          .catch(function () {
            if (Date.now() - start > timeoutMs) return resolve(null);
            setTimeout(tick, 400);
          });
      }
      tick();
    });
  }

  async function fetchCommitsLoop(repo, nethash, offset) {
    let retry = 3;
    while (true) {
      try {
        const url =
          "https://github.com/" +
          repo +
          "/network/chunk?nethash=" +
          encodeURIComponent(nethash) +
          "&start=" +
          offset +
          "&end=" +
          (offset + config.number_of_commits_per_request - 1);

        const response = await pageRequest("ghn-fetch-chunk", { url: url });
        const commits = response.commits || [];
        numberOfTotalCommits += commits.length;

        if (loadingEl) {
          const num = loadingEl.querySelector(".num");
          if (num) num.textContent = numberOfTotalCommits;
        }

        commits.forEach(function (c) {
          const tr = document.createElement("tr");
          if (getUserBySpace(c.space) !== getUserBySpace(0)) {
            tr.classList.add("non-merged");
          }
          const author = c.login || "(" + (c.author || "?") + ")";
          const msg = c.message || "";
          const date = c.date || "";
          const commitUrl =
            "https://github.com/" +
            getUserRepoBySpace(c.space) +
            "/commit/" +
            c.id;

          tr.setAttribute(
            "data-search",
            (author + " " + msg + " " + date).toLowerCase()
          );
          tr.innerHTML =
            '<td class="author"></td><td class="message"></td><td class="date"></td>';
          tr.querySelector(".author").textContent = author;
          const a = document.createElement("a");
          a.href = commitUrl;
          a.target = "_blank";
          a.rel = "noopener";
          a.textContent = msg;
          tr.querySelector(".message").appendChild(a);
          tr.querySelector(".date").textContent = date;
          tableEl.insertBefore(tr, tableEl.firstChild);
        });

        const done =
          numberOfTotalCommits >= config.number_of_max_commits ||
          commits.length < config.number_of_commits_per_request;

        if (done) {
          if (loadingEl) loadingEl.style.display = "none";
          if (tableEl) tableEl.style.display = "table";
          if (inputEl) {
            inputEl.placeholder =
              "在 " +
              numberOfTotalCommits +
              " 条提交 / " +
              (networkMetaData.users || []).length +
              " 个仓库中搜索…";
            inputEl.focus();
          }
          return;
        }

        offset += config.number_of_commits_per_request;
        await sleep(config.api_request_interval);
        retry = 3;
      } catch (err) {
        retry--;
        if (retry <= 0) {
          showError(
            "拉取提交失败：" + (err && err.message ? err.message : String(err))
          );
          return;
        }
        await sleep(config.api_request_interval);
      }
    }
  }

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function getUserBySpace(space) {
    if (!networkMetaData || !networkMetaData.blocks) return "_unknown_";
    for (let i = networkMetaData.blocks.length - 1; i >= 0; i--) {
      if (space >= networkMetaData.blocks[i].start) {
        return networkMetaData.blocks[i].name;
      }
    }
    return "_unknown_";
  }

  function getUserRepo(user) {
    if (!networkMetaData || !networkMetaData.users) return user + "/_unknown_";
    for (let i = 0; i < networkMetaData.users.length; i++) {
      if (networkMetaData.users[i].name === user) {
        return (
          networkMetaData.users[i].name + "/" + networkMetaData.users[i].repo
        );
      }
    }
    return user + "/_unknown_";
  }

  function getUserRepoBySpace(space) {
    return getUserRepo(getUserBySpace(space));
  }

  function init() {
    if (!getRepo()) return;
    function tryPlace() {
      createToolbar();
    }
    tryPlace();
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (!$(".ghn-toolbar")) tryPlace();
      var tb = $(".ghn-toolbar");
      var title = null;
      $$("h1, h2").forEach(function (el) {
        if (/网络图|network\s*graph/i.test(el.textContent || "")) title = el;
      });
      if (tb && title && title.parentElement && !title.parentElement.contains(tb) && !title.closest(".ghn-title-row")) {
        tb.remove();
        var bar = $(".ghn-exit-bar");
        if (bar) bar.remove();
        createToolbar();
      }
      if (tries >= 20) clearInterval(timer);
    }, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

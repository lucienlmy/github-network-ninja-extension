(function () {
  "use strict";

  // ---------- helpers ----------
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

  // ---------- fullscreen ----------
  let isFullscreen = false;
  let canvasOrigSize = null;

  function enterFullscreen() {
    const container =
      $(".js-network-graph-container") || $(".network-graph-container");
    if (!container) return;

    const canvas = container.querySelector("canvas");
    if (canvas) {
      canvasOrigSize = {
        width: canvas.getAttribute("width"),
        height: canvas.getAttribute("height"),
      };
    }

    document.body.classList.add("ghn-fullscreen");

    // Resize canvas to viewport
    requestAnimationFrame(function () {
      if (canvas) {
        canvas.setAttribute("width", window.innerWidth);
        canvas.setAttribute("height", window.innerHeight);
      }
      window.dispatchEvent(new Event("resize"));
    });

    isFullscreen = true;
    updateButtons();
  }

  function exitFullscreen() {
    const container =
      $(".js-network-graph-container") || $(".network-graph-container");
    const canvas = container && container.querySelector("canvas");

    document.body.classList.remove("ghn-fullscreen");

    if (canvas) {
      if (canvasOrigSize) {
        if (canvasOrigSize.width)
          canvas.setAttribute("width", canvasOrigSize.width);
        else canvas.removeAttribute("width");
        if (canvasOrigSize.height)
          canvas.setAttribute("height", canvasOrigSize.height);
        else canvas.removeAttribute("height");
      } else {
        canvas.removeAttribute("width");
        canvas.removeAttribute("height");
      }
    }

    // Let GitHub recalculate layout
    setTimeout(function () {
      window.dispatchEvent(new Event("resize"));
    }, 50);

    isFullscreen = false;
    updateButtons();
  }

  function toggleFullscreen() {
    if (isFullscreen) exitFullscreen();
    else enterFullscreen();
  }

  // ESC to exit fullscreen
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isFullscreen) {
      exitFullscreen();
    }
  });

  // ---------- toolbar ----------
  let btnFullscreen, btnCommits, exitBar;

  function updateButtons() {
    if (btnFullscreen) {
      btnFullscreen.textContent = isFullscreen ? "退出全屏" : "全屏网络图";
      btnFullscreen.classList.toggle("ghn-btn-primary", !isFullscreen);
    }
  }

  function createToolbar() {
    const toolbar = document.createElement("div");
    toolbar.className = "ghn-toolbar";

    btnFullscreen = document.createElement("button");
    btnFullscreen.type = "button";
    btnFullscreen.className = "ghn-btn ghn-btn-primary";
    btnFullscreen.textContent = "全屏网络图";
    btnFullscreen.addEventListener("click", toggleFullscreen);

    btnCommits = document.createElement("button");
    btnCommits.type = "button";
    btnCommits.className = "ghn-btn";
    btnCommits.textContent = "提交列表";
    btnCommits.addEventListener("click", showCommitModal);

    toolbar.appendChild(btnFullscreen);
    toolbar.appendChild(btnCommits);

    // Prefer inserting after the page title "Network graph"
    const titleEl =
      $$("h1, .h1, h2").find(function (el) {
        return /network\s*graph/i.test(el.textContent || "");
      }) || $("h1");

    if (titleEl && titleEl.parentElement) {
      titleEl.style.display = "inline-block";
      titleEl.insertAdjacentElement("afterend", toolbar);
    } else {
      const container =
        $(".js-network-graph-container") || $(".network-graph-container");
      if (container) {
        container.style.position = "relative";
        toolbar.style.position = "absolute";
        toolbar.style.top = "8px";
        toolbar.style.right = "8px";
        toolbar.style.zIndex = "10";
        container.appendChild(toolbar);
      } else {
        document.body.appendChild(toolbar);
      }
    }

    // Floating exit bar (only visible in fullscreen via CSS)
    exitBar = document.createElement("div");
    exitBar.className = "ghn-exit-bar";
    const exitBtn = document.createElement("button");
    exitBtn.type = "button";
    exitBtn.className = "ghn-btn ghn-btn-primary";
    exitBtn.textContent = "退出全屏";
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

  // ---------- commit list modal ----------
  const config = {
    number_of_commits_per_request: 500,
    api_request_interval: 1000,
    number_of_max_commits: 10000,
  };

  let nethash;
  let networkMetaData;
  let modalEl, maskEl, inputEl, tableEl, loadingEl;
  let numberOfTotalCommits = 0;

  // Hook fetch to steal nethash
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url =
        typeof input === "string"
          ? input
          : input && input.url
            ? input.url
            : "";
      if (!nethash) {
        const m = /[?&]nethash=([^&]+)/.exec(url);
        if (m) nethash = m[1];
      }
    } catch (e) {}
    return originalFetch.apply(this, arguments);
  };

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
      "<div style=\"margin-top:8px;font-size:12px\">请等待全部提交拉取完成</div></div>" +
      "<table style=\"display:none\"></table>" +
      "</div>";

    document.body.appendChild(maskEl);
    document.body.appendChild(modalEl);

    inputEl = modalEl.querySelector("input");
    loadingEl = modalEl.querySelector(".ghn-loading");
    tableEl = modalEl.querySelector("table");

    inputEl.addEventListener("input", debounce(filterTable, 300));

    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape") {
        if (modalEl && modalEl.style.display !== "none") {
          hideCommitModal();
          e.stopPropagation();
        }
      }
    });

    fetchNetworkMetaData();
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

  function fetchNetworkMetaData(retry) {
    retry = retry == null ? 3 : retry;
    const repo = getRepo();
    if (!repo) return;

    fetch("https://github.com/" + repo + "/network/meta")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        networkMetaData = data;
        fetchCommits(0);
      })
      .catch(function () {
        if (retry > 0) {
          setTimeout(function () {
            fetchNetworkMetaData(retry - 1);
          }, config.api_request_interval);
        } else if (loadingEl) {
          loadingEl.innerHTML =
            '<div style="color:#cf222e">无法获取网络元数据，请刷新页面重试</div>';
        }
      });
  }

  function fetchCommits(offset, retry) {
    offset = offset || 0;
    retry = retry == null ? 3 : retry;
    const repo = getRepo();
    if (!repo || !nethash) {
      if (offset === 0 && retry > 0) {
        setTimeout(function () {
          fetchCommits(0, retry - 1);
        }, 800);
      }
      return;
    }

    const url =
      "https://github.com/" +
      repo +
      "/network/chunk?nethash=" +
      encodeURIComponent(nethash) +
      "&start=" +
      offset +
      "&end=" +
      (offset + config.number_of_commits_per_request - 1);

    fetch(url)
      .then(function (r) {
        return r.json();
      })
      .then(function (response) {
        const commits = response.commits || [];
        numberOfTotalCommits += commits.length;
        if (loadingEl) {
          const num = loadingEl.querySelector(".num");
          if (num) num.textContent = numberOfTotalCommits;
        }

        commits.forEach(function (c) {
          const tr = document.createElement("tr");
          const spaceUser = getUserBySpace(c.space);
          if (spaceUser !== getUserBySpace(0)) tr.classList.add("non-merged");

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

        let done =
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
        } else {
          setTimeout(function () {
            fetchCommits(offset + config.number_of_commits_per_request);
          }, config.api_request_interval);
        }
      })
      .catch(function () {
        if (retry > 0) {
          setTimeout(function () {
            fetchCommits(offset, retry - 1);
          }, config.api_request_interval);
        } else if (loadingEl) {
          loadingEl.innerHTML =
            '<div style="color:#cf222e">拉取提交失败，请刷新页面重试</div>';
        }
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

  // ---------- init ----------
  function init() {
    if (!getRepo()) return;
    waitFor(".js-network-graph-container, .network-graph-container, canvas")
      .then(function () {
        setTimeout(createToolbar, 300);
      })
      .catch(function () {
        createToolbar();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

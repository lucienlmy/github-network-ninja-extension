// Runs in PAGE (MAIN) world — same JS environment as GitHub itself
(function () {
  "use strict";
  if (window.__ghnPage) return;
  window.__ghnPage = { nethash: null, meta: null };

  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url =
        typeof input === "string"
          ? input
          : input && input.url
            ? input.url
            : "";
      if (!window.__ghnPage.nethash) {
        const m = /[?&]nethash=([^&]+)/.exec(url);
        if (m) window.__ghnPage.nethash = decodeURIComponent(m[1]);
      }
    } catch (e) {}
    return originalFetch.apply(this, arguments);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      if (typeof url === "string" && !window.__ghnPage.nethash) {
        const m = /[?&]nethash=([^&]+)/.exec(url);
        if (m) window.__ghnPage.nethash = decodeURIComponent(m[1]);
      }
    } catch (e) {}
    return originalOpen.apply(this, arguments);
  };

  async function pageFetchJson(url) {
    const res = await originalFetch(url, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(function () {
        return "";
      });
      throw new Error("HTTP " + res.status + " " + text.slice(0, 120));
    }
    return res.json();
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.source !== "ghn-extension") return;

    if (data.type === "ghn-fetch-meta") {
      pageFetchJson(data.url)
        .then(function (json) {
          window.__ghnPage.meta = json;
          window.postMessage(
            { source: "ghn-page", type: "ghn-meta-ok", data: json, id: data.id },
            "*"
          );
        })
        .catch(function (err) {
          window.postMessage(
            {
              source: "ghn-page",
              type: "ghn-meta-err",
              error: String(err && err.message ? err.message : err),
              id: data.id,
            },
            "*"
          );
        });
    }

    if (data.type === "ghn-fetch-chunk") {
      pageFetchJson(data.url)
        .then(function (json) {
          window.postMessage(
            { source: "ghn-page", type: "ghn-chunk-ok", data: json, id: data.id },
            "*"
          );
        })
        .catch(function (err) {
          window.postMessage(
            {
              source: "ghn-page",
              type: "ghn-chunk-err",
              error: String(err && err.message ? err.message : err),
              id: data.id,
            },
            "*"
          );
        });
    }

    if (data.type === "ghn-get-nethash") {
      window.postMessage(
        {
          source: "ghn-page",
          type: "ghn-nethash",
          nethash: window.__ghnPage.nethash,
          id: data.id,
        },
        "*"
      );
    }
  });
})();

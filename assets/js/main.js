const toggle = document.querySelector(".mobile-toggle");
const mobileMenu = document.querySelector("#mobile-menu");
const mobileLinks = document.querySelectorAll(".mobile-menu a");

const APJ_LINK_API_URL = "https://script.google.com/macros/s/AKfycbwJxEp0UdTH1cameXqLkK4S8ImYRNfs_vWpH53aREulf7mSiEaHxAQ_q5WAlxjkj8kd/exec";
const APJ_LINK_CACHE_KEY = "apj_link_sheet_cache_v3";
const APJ_LINK_CACHE_TTL = 2 * 60 * 1000; // 2 menit: cache hanya di browser, server tetap baca Sheet terbaru.
const APJ_LINK_TIMEOUT = 4500;

function setMenu(open) {
  if (!toggle || !mobileMenu) return;
  toggle.classList.toggle("is-open", open);
  mobileMenu.classList.toggle("is-open", open);
  document.body.classList.toggle("menu-open", open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
  mobileMenu.setAttribute("aria-hidden", String(!open));
}

if (toggle && mobileMenu) {
  toggle.addEventListener("click", () => {
    setMenu(!mobileMenu.classList.contains("is-open"));
  });

  mobileLinks.forEach((link) => {
    link.addEventListener("click", () => setMenu(false));
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!mobileMenu.classList.contains("is-open")) return;
    if (mobileMenu.contains(target) || toggle.contains(target)) return;
    setMenu(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenu(false);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 940) setMenu(false);
  });
}

function isSafeUrl(url) {
  return /^(https?:\/\/|#|tel:|mailto:)/i.test(String(url || "").trim());
}

function readCachedLinks() {
  try {
    const raw = localStorage.getItem(APJ_LINK_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    if (!cache || !cache.data || !cache.savedAt) return null;
    return cache;
  } catch (_) {
    return null;
  }
}

function writeCachedLinks(data) {
  try {
    localStorage.setItem(APJ_LINK_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch (_) {
    // Storage bisa penuh/disabled. Tidak masalah, fallback tetap jalan.
  }
}

function rememberFallback(el) {
  if (!el.dataset.fallbackHref) el.dataset.fallbackHref = el.getAttribute("href") || "#";
  if (!el.dataset.fallbackTitle) el.dataset.fallbackTitle = el.getAttribute("title") || el.getAttribute("aria-label") || "";

  const textEl = el.querySelector(".qa-text");
  if (textEl && !el.dataset.fallbackText) el.dataset.fallbackText = textEl.textContent.trim();
}

function applyDynamicLinks(data) {
  if (!data || !data.ok || !data.links) return false;

  document.querySelectorAll("[data-link-key]").forEach((el) => {
    rememberFallback(el);

    const key = el.getAttribute("data-link-key");
    const item = data.links[key];
    const fallbackHref = el.dataset.fallbackHref || "#";
    const fallbackLabel = el.dataset.fallbackTitle || "";
    const fallbackText = el.dataset.fallbackText || "";
    const textEl = el.querySelector(".qa-text");

    if (item && item.url && isSafeUrl(item.url)) {
      el.href = item.url;
    } else {
      el.href = fallbackHref;
    }

    const label = item && item.label ? item.label : fallbackLabel;
    if (label) {
      el.setAttribute("title", label);
      if (!el.classList.contains("floating-wa")) el.setAttribute("aria-label", label);
    }

    if (textEl) textEl.textContent = item && item.label ? item.label : fallbackText;
  });

  document.documentElement.setAttribute("data-apj-links", "loaded");
  return true;
}

function buildApiUrl({ callbackName = "", force = false } = {}) {
  const separator = APJ_LINK_API_URL.includes("?") ? "&" : "?";
  const cacheBucket = force ? Date.now() : Math.floor(Date.now() / APJ_LINK_CACHE_TTL);
  let url = `${APJ_LINK_API_URL}${separator}action=links&v=${cacheBucket}`;
  if (callbackName) url += `&callback=${encodeURIComponent(callbackName)}`;
  return url;
}

function loadDynamicLinksByJsonp(options = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `apjLinkCallback_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const script = document.createElement("script");
    let done = false;

    const cleanup = () => {
      script.remove();
      delete window[callbackName];
    };

    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      fn(value);
    };

    const timer = setTimeout(() => {
      finish(reject, new Error("Timeout memuat link APJ"));
    }, APJ_LINK_TIMEOUT);

    window[callbackName] = (data) => {
      if (!applyDynamicLinks(data)) {
        finish(reject, new Error("Format data link APJ tidak valid"));
        return;
      }
      writeCachedLinks(data);
      finish(resolve, data);
    };

    script.src = buildApiUrl({ callbackName, force: options.force });
    script.async = true;
    script.onerror = () => finish(reject, new Error("JSONP link APJ gagal dimuat"));

    document.head.appendChild(script);
  });
}

async function loadDynamicLinksByFetch(options = {}) {
  const response = await fetch(buildApiUrl({ force: options.force }), {
    cache: options.force ? "reload" : "force-cache",
    redirect: "follow"
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!applyDynamicLinks(data)) throw new Error("Format data link APJ tidak valid");
  writeCachedLinks(data);
  return data;
}

function refreshDynamicLinks(options = {}) {
  if (!APJ_LINK_API_URL) return Promise.resolve(null);

  return loadDynamicLinksByJsonp(options).catch(() => {
    return loadDynamicLinksByFetch(options).catch((error) => {
      console.warn("Gagal memuat link APJ dari Google Sheet. Link bawaan/cache tetap dipakai.", error);
      return null;
    });
  });
}

function scheduleDynamicLinks() {
  const cache = readCachedLinks();
  const hasFreshCache = cache && Date.now() - cache.savedAt < APJ_LINK_CACHE_TTL;

  if (cache && cache.data) applyDynamicLinks(cache.data);
  if (hasFreshCache) return;

  const run = () => refreshDynamicLinks();
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 1200 });
  } else {
    window.setTimeout(run, 250);
  }
}

window.apjRefreshLinks = () => refreshDynamicLinks({ force: true });
scheduleDynamicLinks();

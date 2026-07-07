const toggle = document.querySelector(".mobile-toggle");
const mobileMenu = document.querySelector("#mobile-menu");
const mobileLinks = document.querySelectorAll(".mobile-menu a");

const APJ_LINK_API_URL = "https://script.google.com/macros/s/AKfycbwJxEp0UdTH1cameXqLkK4S8ImYRNfs_vWpH53aREulf7mSiEaHxAQ_q5WAlxjkj8kd/exec";

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
    if (event.key === "Escape") {
      setMenu(false);
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 940) {
      setMenu(false);
    }
  });
}

function isSafeUrl(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  if (/^(https?:\/\/|#|tel:|mailto:)/i.test(value)) return true;
  if (value.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  return /^[\w.\-/~?#=&%+,:;()]+$/i.test(value);
}

function applyDynamicLinks(data) {
  if (!data || !data.ok || !data.links) return;

  document.querySelectorAll("[data-link-key]").forEach((el) => {
    const key = el.getAttribute("data-link-key");
    const item = data.links[key];

    if (!item) return;

    if (item.url && isSafeUrl(item.url)) {
      el.href = item.url;
    }

    const fixedLabel = el.hasAttribute("data-fixed-label");
    if (item.label && !fixedLabel) {
      const textEl = el.querySelector(".qa-text");
      if (textEl) textEl.textContent = item.label;

      el.setAttribute("title", item.label);
      if (!el.classList.contains("floating-wa")) {
        el.setAttribute("aria-label", item.label);
      }
    }
  });
}

async function loadDynamicLinksByFetch() {
  const url = `${APJ_LINK_API_URL}?action=links&t=${Date.now()}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  applyDynamicLinks(data);
}

function loadDynamicLinksByJsonp() {
  const callbackName = `apjLinkCallback_${Date.now()}`;
  const script = document.createElement("script");
  const separator = APJ_LINK_API_URL.includes("?") ? "&" : "?";

  window[callbackName] = (data) => {
    applyDynamicLinks(data);
    script.remove();
    delete window[callbackName];
  };

  script.src = `${APJ_LINK_API_URL}${separator}action=links&callback=${callbackName}&t=${Date.now()}`;
  script.async = true;
  script.onerror = () => {
    script.remove();
    delete window[callbackName];
    console.warn("Gagal memuat link APJ dari Google Sheet. Link bawaan tetap dipakai.");
  };

  document.head.appendChild(script);
}

function loadDynamicLinks() {
  if (!APJ_LINK_API_URL) return;

  loadDynamicLinksByFetch().catch(() => {
    loadDynamicLinksByJsonp();
  });
}

loadDynamicLinks();


/* Secret admin access: klik logo APJ 5 kali cepat, lalu masukkan PIN */
const APJ_SECRET_ADMIN_PIN_KEY = "apj_menu_admin_pin_v1";
const APJ_SECRET_ADMIN_SESSION_KEY = "apj_menu_admin_pin_session_v1";
const APJ_SECRET_ADMIN_TARGET = "admin-menu.html";

function apjSecretJsonp(action, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `apjSecretCallback_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const script = document.createElement("script");
    let done = false;

    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      script.remove();
      delete window[callbackName];
      fn(value);
    };

    const query = new URLSearchParams({ action, callback: callbackName, t: String(Date.now()), ...params });
    const timer = setTimeout(() => finish(reject, new Error("Timeout validasi PIN admin")), 10000);

    window[callbackName] = (data) => finish(resolve, data);
    script.async = true;
    script.src = `${APJ_LINK_API_URL}?${query.toString()}`;
    script.onerror = () => finish(reject, new Error("Gagal menghubungi server APJ"));
    document.head.appendChild(script);
  });
}

function ensureSecretAdminModal() {
  let modal = document.querySelector("#apj-secret-admin-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.className = "secret-admin-modal";
  modal.id = "apj-secret-admin-modal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="secret-admin-backdrop" data-secret-close></div>
    <div class="secret-admin-card" role="dialog" aria-modal="true" aria-labelledby="secret-admin-title">
      <button class="secret-admin-close" type="button" aria-label="Tutup" data-secret-close>×</button>
      <p class="secret-admin-kicker">Admin Menu</p>
      <h2 id="secret-admin-title">Masukkan PIN</h2>
      <p class="secret-admin-copy">Akses khusus untuk kasir/admin APJ.</p>
      <form id="secret-admin-form" class="secret-admin-form">
        <input id="secret-admin-pin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN Admin" aria-label="PIN Admin" required />
        <button id="secret-admin-submit" class="btn btn-gold" type="submit">Masuk Admin</button>
      </form>
      <p id="secret-admin-status" class="secret-admin-status" aria-live="polite"></p>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll("[data-secret-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeSecretAdminModal());
  });

  modal.querySelector("#secret-admin-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const pinInput = modal.querySelector("#secret-admin-pin");
    const submit = modal.querySelector("#secret-admin-submit");
    const status = modal.querySelector("#secret-admin-status");
    const pin = pinInput.value.trim();
    if (!pin) return;

    submit.disabled = true;
    status.textContent = "Memeriksa PIN...";
    status.classList.remove("is-error", "is-success");

    try {
      const data = await apjSecretJsonp("admin_menu", { pin });
      if (!data || !data.ok) throw new Error(data && data.message ? data.message : "PIN admin salah.");
      try { sessionStorage.setItem(APJ_SECRET_ADMIN_SESSION_KEY, pin); } catch (_) {}
      try { localStorage.removeItem(APJ_SECRET_ADMIN_PIN_KEY); } catch (_) {}
      status.textContent = "PIN benar. Membuka Admin Menu...";
      status.classList.add("is-success");
      window.location.href = APJ_SECRET_ADMIN_TARGET;
    } catch (error) {
      status.textContent = error.message || "PIN admin salah atau server belum siap.";
      status.classList.add("is-error");
      submit.disabled = false;
      pinInput.focus();
      pinInput.select();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      closeSecretAdminModal();
    }
  });

  return modal;
}

function openSecretAdminModal() {
  const modal = ensureSecretAdminModal();
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("secret-admin-open");
  const input = modal.querySelector("#secret-admin-pin");
  const status = modal.querySelector("#secret-admin-status");
  status.textContent = "";
  input.value = "";
  try { localStorage.removeItem(APJ_SECRET_ADMIN_PIN_KEY); } catch (_) {}
  setTimeout(() => input.focus(), 30);
}

function closeSecretAdminModal() {
  const modal = document.querySelector("#apj-secret-admin-modal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("secret-admin-open");
}

function initSecretAdminAccess() {
  const brands = document.querySelectorAll(".brand");
  if (!brands.length) return;

  let clicks = 0;
  let resetTimer = null;
  let navigateTimer = null;
  const windowMs = 1500;

  brands.forEach((brand) => {
    brand.addEventListener("click", (event) => {
      const href = brand.getAttribute("href") || "index.html#beranda";
      event.preventDefault();

      clearTimeout(navigateTimer);
      clearTimeout(resetTimer);
      clicks += 1;

      if (clicks >= 5) {
        clicks = 0;
        openSecretAdminModal();
        return;
      }

      resetTimer = setTimeout(() => {
        clicks = 0;
      }, windowMs);

      navigateTimer = setTimeout(() => {
        if (clicks <= 1) {
          clicks = 0;
          window.location.href = href;
        }
      }, 460);
    });
  });
}

initSecretAdminAccess();

/* Home: tampilkan 4 paket nasi tersedia dari MENU_APJ */
function apjEscapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function apjHomeMenuJsonp(action) {
  return new Promise((resolve, reject) => {
    const callbackName = `apjHomeMenuCallback_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const script = document.createElement("script");
    let done = false;

    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      script.remove();
      delete window[callbackName];
      fn(value);
    };

    const timer = setTimeout(() => finish(reject, new Error("Timeout memuat menu pilihan")), 12000);
    window[callbackName] = (data) => finish(resolve, data);
    script.async = true;
    script.src = `${APJ_LINK_API_URL}?action=${encodeURIComponent(action)}&callback=${callbackName}&t=${Date.now()}`;
    script.onerror = () => finish(reject, new Error("Gagal memuat menu pilihan"));
    document.head.appendChild(script);
  });
}

async function apjFetchHomeMenu() {
  try {
    const response = await fetch(`${APJ_LINK_API_URL}?action=menu&t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (_) {
    return apjHomeMenuJsonp("menu");
  }
}

function apjShuffleItems(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function apjHomeMenuCard(item) {
  const name = apjEscapeHtml(item.nama || "Menu APJ");
  const category = apjEscapeHtml(item.kategori || "Paket Nasi");
  const desc = apjEscapeHtml(item.deskripsi || "Paket nasi hangat dengan lauk pilihan dan cita rasa khas APJ.");
  const price = apjEscapeHtml(item.hargaText || "Rp -");
  const photo = apjEscapeHtml(item.foto || "assets/img/signature-dish.jpg");

  return `
    <article class="menu-card home-favorite-card">
      <figure class="menu-photo">
        <img src="${photo}" alt="${name}" width="640" height="360" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='assets/img/signature-dish.jpg';" />
      </figure>
      <div class="menu-card-body">
        <span class="badge">${category}</span>
        <h3>${name}</h3>
        <p>${desc}</p>
        <div class="card-footer">
          <strong>${price}</strong>
          <a href="menu.html" data-fixed-label="true">Pesan</a>
        </div>
      </div>
    </article>
  `;
}

async function initHomeMenuFavorites() {
  const grid = document.querySelector("#home-menu-grid");
  if (!grid || !APJ_LINK_API_URL) return;

  try {
    const data = await apjFetchHomeMenu();
    if (!data || !data.ok || !Array.isArray(data.items)) throw new Error("Data menu tidak valid");

    const available = data.items.filter((item) => item && item.tersedia !== false && item.active !== false);
    const paketNasi = available.filter((item) => String(item.kategori || "").trim().toLowerCase() === "paket nasi");
    const source = paketNasi.length ? paketNasi : available;
    const selected = apjShuffleItems(source).slice(0, 4);

    if (!selected.length) {
      grid.innerHTML = `
        <article class="menu-card home-menu-empty">
          <div class="menu-card-body">
            <span class="badge">Belum tersedia</span>
            <h3>Menu online sedang diperbarui.</h3>
            <p>Silakan cek halaman menu atau hubungi admin APJ untuk ketersediaan hari ini.</p>
            <div class="card-footer">
              <strong>APJ</strong>
              <a href="menu.html" data-fixed-label="true">Buka Menu</a>
            </div>
          </div>
        </article>`;
      return;
    }

    grid.innerHTML = selected.map(apjHomeMenuCard).join("");
  } catch (error) {
    console.warn("Gagal memuat menu pilihan APJ:", error);
    grid.innerHTML = `
      <article class="menu-card home-menu-empty">
        <div class="menu-card-body">
          <span class="badge">Menu APJ</span>
          <h3>Menu pilihan belum dapat dimuat.</h3>
          <p>Buka halaman menu untuk melihat pilihan yang tersedia atau hubungi admin APJ.</p>
          <div class="card-footer">
            <strong>APJ</strong>
            <a href="menu.html" data-fixed-label="true">Buka Menu</a>
          </div>
        </div>
      </article>`;
  }
}

initHomeMenuFavorites();

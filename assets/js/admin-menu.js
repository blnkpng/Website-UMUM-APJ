const APJ_ADMIN_API_URL = "https://script.google.com/macros/s/AKfycbwJxEp0UdTH1cameXqLkK4S8ImYRNfs_vWpH53aREulf7mSiEaHxAQ_q5WAlxjkj8kd/exec";
const APJ_ADMIN_PIN_KEY = "apj_menu_admin_pin_v1";
const APJ_ADMIN_TIMEOUT = 7000;

let adminPin = "";
let adminItems = [];
let adminCategory = "Semua";
let adminSearch = "";

const adminEls = {
  gate: document.querySelector("#admin-gate"),
  app: document.querySelector("#admin-app"),
  form: document.querySelector("#admin-login-form"),
  pin: document.querySelector("#admin-pin"),
  loginStatus: document.querySelector("#admin-login-status"),
  loginSubmit: document.querySelector("#admin-login-form button[type='submit']"),
  logout: document.querySelector("#admin-logout"),
  refresh: document.querySelector("#admin-refresh"),
  status: document.querySelector("#admin-status"),
  list: document.querySelector("#admin-menu-list"),
  search: document.querySelector("#admin-search"),
  categories: document.querySelector("#admin-category-list"),
  total: document.querySelector("#admin-total"),
  available: document.querySelector("#admin-available"),
  empty: document.querySelector("#admin-empty")
};

function jsonp(action, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `apjAdminCallback_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

    const timer = setTimeout(() => finish(reject, new Error("Timeout memuat admin menu")), APJ_ADMIN_TIMEOUT);
    const query = new URLSearchParams({ action, callback: callbackName, t: String(Date.now()), ...params });

    window[callbackName] = (data) => finish(resolve, data);
    script.async = true;
    script.src = `${APJ_ADMIN_API_URL}?${query.toString()}`;
    script.onerror = () => finish(reject, new Error("Gagal menghubungi server APJ"));
    document.head.appendChild(script);
  });
}

function setAdminStatus(message, type = "info") {
  if (!adminEls.status) return;
  adminEls.status.textContent = message || "";
  adminEls.status.dataset.type = type;
}

function setLoginStatus(message, type = "info") {
  if (!adminEls.loginStatus) return;
  adminEls.loginStatus.textContent = message || "";
  adminEls.loginStatus.dataset.type = type;
}

function setLoginLoading(loading) {
  if (adminEls.loginSubmit) adminEls.loginSubmit.disabled = loading;
  if (adminEls.pin) adminEls.pin.disabled = loading;
}

function showApp(loggedIn) {
  if (adminEls.gate) adminEls.gate.hidden = loggedIn;
  if (adminEls.app) adminEls.app.hidden = !loggedIn;
}

function formatRupiah(value) {
  const number = Number(value) || 0;
  return `Rp ${number.toLocaleString("id-ID")}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderAdminCategories() {
  if (!adminEls.categories) return;
  const categories = ["Semua", ...Array.from(new Set(adminItems.map((item) => item.kategori))).sort()];
  adminEls.categories.innerHTML = categories
    .map((category) => `<button class="menu-filter-btn${category === adminCategory ? " is-active" : ""}" type="button" data-admin-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`)
    .join("");
}

function renderAdminList() {
  const q = adminSearch.trim().toLowerCase();
  const filtered = adminItems.filter((item) => {
    const matchCategory = adminCategory === "Semua" || item.kategori === adminCategory;
    const matchSearch = !q || `${item.kode} ${item.nama} ${item.kategori}`.toLowerCase().includes(q);
    return matchCategory && matchSearch;
  });

  if (adminEls.total) adminEls.total.textContent = String(adminItems.length);
  if (adminEls.available) adminEls.available.textContent = String(adminItems.filter((item) => item.tersedia).length);
  if (adminEls.empty) adminEls.empty.textContent = String(adminItems.filter((item) => !item.tersedia).length);

  if (!adminEls.list) return;

  if (!filtered.length) {
    adminEls.list.innerHTML = `<div class="menu-empty-state">Menu tidak ditemukan.</div>`;
    return;
  }

  adminEls.list.innerHTML = filtered.map((item) => `
    <article class="admin-menu-row${item.tersedia ? " is-available" : " is-empty"}" data-kode="${escapeHtml(item.kode)}">
      <div class="admin-menu-main">
        <span class="admin-code">${escapeHtml(item.kode)}</span>
        <div>
          <h3>${escapeHtml(item.nama)}</h3>
          <p>${escapeHtml(item.kategori)} · ${formatRupiah(item.harga)}</p>
        </div>
      </div>
      <button class="availability-toggle${item.tersedia ? " is-on" : ""}" type="button" data-toggle-availability="${escapeHtml(item.kode)}" aria-pressed="${item.tersedia}">
        <span>${item.tersedia ? "Tersedia" : "Habis"}</span>
      </button>
    </article>
  `).join("");
}

async function loadAdminMenu(options = {}) {
  const fromLogin = options.fromLogin === true;
  const alreadyInApp = adminEls.app && !adminEls.app.hidden;

  if (!adminPin) {
    showApp(false);
    return;
  }

  if (fromLogin) {
    showApp(false);
    setLoginStatus("Memeriksa PIN admin...", "info");
    setLoginLoading(true);
  } else {
    setAdminStatus("Memuat data menu...", "info");
  }

  try {
    const data = await jsonp("admin_menu", { pin: adminPin });
    if (!data || !data.ok) throw new Error(data && data.message ? data.message : "Data admin tidak valid.");
    adminItems = data.items || [];
    renderAdminCategories();
    renderAdminList();
    showApp(true);
    setLoginStatus("", "info");
    setAdminStatus("Data menu siap. Klik tombol untuk ubah tersedia/habis.", "success");
  } catch (error) {
    console.warn(error);
    const message = error.message || "PIN admin salah atau server belum siap.";
    try { localStorage.removeItem(APJ_ADMIN_PIN_KEY); } catch (_) {}
    try { sessionStorage.removeItem(APJ_ADMIN_PIN_KEY); } catch (_) {}
    adminPin = "";

    if (alreadyInApp && !fromLogin) {
      setAdminStatus(message, "error");
      return;
    }

    showApp(false);
    setAdminStatus("", "info");
    setLoginStatus(message, "error");
  } finally {
    if (fromLogin) {
      setLoginLoading(false);
      if (!adminPin && adminEls.gate && !adminEls.gate.hidden && adminEls.pin) {
        adminEls.pin.focus();
        adminEls.pin.select();
      }
    }
  }
}

async function toggleAvailability(kode) {
  const item = adminItems.find((row) => row.kode === kode);
  if (!item) return;
  const next = !item.tersedia;
  const old = item.tersedia;
  item.tersedia = next;
  renderAdminList();
  setAdminStatus(`Menyimpan ${item.nama}...`, "info");

  try {
    const data = await jsonp("update_availability", { pin: adminPin, kode, tersedia: String(next) });
    if (!data || !data.ok) throw new Error(data && data.message ? data.message : "Gagal update status.");
    setAdminStatus(data.message || "Status tersimpan.", "success");
  } catch (error) {
    item.tersedia = old;
    renderAdminList();
    setAdminStatus(error.message || "Gagal menyimpan status.", "error");
  }
}

if (adminEls.form) {
  adminEls.form.addEventListener("submit", (event) => {
    event.preventDefault();
    adminPin = adminEls.pin.value.trim();
    if (!adminPin) {
      setLoginStatus("PIN wajib diisi.", "error");
      return;
    }
    try { localStorage.removeItem(APJ_ADMIN_PIN_KEY); } catch (_) {}
    try { sessionStorage.removeItem(APJ_ADMIN_PIN_KEY); } catch (_) {}
    loadAdminMenu({ fromLogin: true });
  });
}

if (adminEls.logout) {
  adminEls.logout.addEventListener("click", () => {
    try { localStorage.removeItem(APJ_ADMIN_PIN_KEY); } catch (_) {}
    try { sessionStorage.removeItem(APJ_ADMIN_PIN_KEY); } catch (_) {}
    adminPin = "";
    showApp(false);
    setAdminStatus("", "info");
    setLoginStatus("", "info");
  });
}

if (adminEls.refresh) adminEls.refresh.addEventListener("click", loadAdminMenu);
if (adminEls.search) {
  adminEls.search.addEventListener("input", () => {
    adminSearch = adminEls.search.value;
    renderAdminList();
  });
}
if (adminEls.categories) {
  adminEls.categories.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-admin-category]");
    if (!btn) return;
    adminCategory = btn.dataset.adminCategory;
    renderAdminCategories();
    renderAdminList();
  });
}
if (adminEls.list) {
  adminEls.list.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-toggle-availability]");
    if (!btn) return;
    toggleAvailability(btn.dataset.toggleAvailability);
  });
}

loadAdminMenu();

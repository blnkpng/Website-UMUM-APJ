const APJ_MENU_API_URL = "https://script.google.com/macros/s/AKfycbwJxEp0UdTH1cameXqLkK4S8ImYRNfs_vWpH53aREulf7mSiEaHxAQ_q5WAlxjkj8kd/exec";
const APJ_CART_KEY = "apj_online_cart_v1";
const APJ_MENU_TIMEOUT = 6000;
const APJ_MENU_POLL_MS = 5000;
const APJ_MENU_UPDATE_SIGNAL_KEY = "apj_menu_update_signal_v1";
const APJ_LAHOR_OUTLET_ADDRESS = "Outlet Lahor";

let menuItems = [];
let categories = [];
let activeCategory = "Semua";
let searchQuery = "";
let cart = readCart();
let links = {};
let menuRefreshInFlight = false;

const els = {
  grid: document.querySelector("#order-menu-grid"),
  categories: document.querySelector("#menu-category-list"),
  search: document.querySelector("#menu-search"),
  status: document.querySelector("#menu-load-status"),
  cartItems: document.querySelector("#cart-items"),
  cartEmpty: document.querySelector("#cart-empty"),
  cartCount: document.querySelector("#cart-count"),
  cartTotal: document.querySelector("#cart-total"),
  cartTotalMobile: document.querySelector("#cart-total-mobile"),
  cartCountMobile: document.querySelector("#cart-count-mobile"),
  checkout: document.querySelector("#checkout-wa"),
  clearCart: document.querySelector("#clear-cart"),
  note: document.querySelector("#order-note"),
  customerName: document.querySelector("#customer-name"),
  orderMethod: document.querySelector("#order-method"),
  orderLocation: document.querySelector("#order-location"),
  orderLocationLabel: document.querySelector("#order-location-label"),
  orderLocationField: document.querySelector("#order-location-field"),
  sharelocActions: document.querySelector("#shareloc-actions"),
  useCurrentLocation: document.querySelector("#use-current-location"),
  orderLocationStatus: document.querySelector("#order-location-status"),
  openCart: document.querySelector("#open-cart"),
  closeCart: document.querySelector("#close-cart"),
  cartPanel: document.querySelector("#cart-panel"),
  cartBackdrop: document.querySelector("#cart-backdrop")
};

function jsonp(action, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `apjMenuCallback_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

    const timer = setTimeout(() => finish(reject, new Error("Timeout memuat data APJ")), APJ_MENU_TIMEOUT);
    const query = new URLSearchParams({ action, callback: callbackName, t: String(Date.now()), ...params });

    window[callbackName] = (data) => finish(resolve, data);
    script.async = true;
    script.src = `${APJ_MENU_API_URL}?${query.toString()}`;
    script.onerror = () => finish(reject, new Error("Gagal memuat data APJ"));
    document.head.appendChild(script);
  });
}


function normalizeMenuImageUrl(url) {
  const text = String(url || "").trim();
  if (!text) return "";
  if (text.startsWith("assets/") || text.startsWith("data:")) return text;

  const fileId = extractDriveFileId(text);
  if (fileId) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1000`;
  }

  return text;
}

function extractDriveFileId(url) {
  const text = String(url || "").trim();
  let match = text.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (match) return match[1];
  match = text.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (match) return match[1];
  match = text.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (match) return match[1];
  match = text.match(/^([a-zA-Z0-9_-]{20,})$/);
  if (match) return match[1];
  return "";
}

function formatRupiah(value) {
  const number = Number(value) || 0;
  return `Rp ${number.toLocaleString("id-ID")}`;
}

function readCart() {
  try {
    const raw = localStorage.getItem(APJ_CART_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveCart() {
  if (!cart || !Object.keys(cart).length) {
    localStorage.removeItem(APJ_CART_KEY);
    return;
  }
  localStorage.setItem(APJ_CART_KEY, JSON.stringify(cart));
}

function getItem(kode) {
  return menuItems.find((item) => item.kode === kode);
}

function cartEntries() {
  return Object.entries(cart)
    .map(([kode, qty]) => ({ item: getItem(kode), qty }))
    .filter((entry) => entry.item && entry.qty > 0 && entry.item.tersedia);
}

function setStatus(message, type = "info") {
  if (!els.status) return;
  els.status.textContent = message || "";
  els.status.dataset.type = type;
}

function renderCategories() {
  if (!els.categories) return;
  const list = ["Semua", ...categories];
  els.categories.innerHTML = list
    .map((category) => `<button class="menu-filter-btn${category === activeCategory ? " is-active" : ""}" type="button" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`)
    .join("");
}

function renderMenu() {
  if (!els.grid) return;

  const q = searchQuery.trim().toLowerCase();
  const filtered = menuItems.filter((item) => {
    const matchCategory = activeCategory === "Semua" || item.kategori === activeCategory;
    const haystack = `${item.nama} ${item.kategori} ${item.deskripsi}`.toLowerCase();
    const matchSearch = !q || haystack.includes(q);
    return item.active !== false && matchCategory && matchSearch;
  });

  if (!filtered.length) {
    els.grid.innerHTML = `<div class="menu-empty-state">Menu tidak ditemukan. Coba kata kunci atau kategori lain.</div>`;
    return;
  }

  els.grid.innerHTML = filtered.map(renderMenuCard).join("");
}

function renderMenuCard(item) {
  const qty = cart[item.kode] || 0;
  const disabled = !item.tersedia;
  const badge = item.tersedia ? "Tersedia" : "Habis";
  const badgeClass = item.tersedia ? "stock-available" : "stock-empty";
  const image = normalizeMenuImageUrl(item.foto) || "assets/img/signature-dish.jpg";

  return `
    <article class="order-menu-card${disabled ? " is-empty" : ""}" data-kode="${escapeHtml(item.kode)}">
      <figure class="order-menu-photo">
        <img src="${escapeAttr(image)}" alt="${escapeAttr(item.nama)}" loading="lazy" decoding="async" onerror="this.src='assets/img/signature-dish.jpg'" />
        <span class="stock-badge ${badgeClass}">${badge}</span>
      </figure>
      <div class="order-menu-body">
        <p class="order-menu-category">${escapeHtml(item.kategori)}</p>
        <h3>${escapeHtml(item.nama)}</h3>
        <p class="order-menu-desc">${escapeHtml(item.deskripsi || "Menu pilihan APJ.")}</p>
        <div class="order-menu-footer">
          <strong>${escapeHtml(item.hargaText || formatRupiah(item.harga))}</strong>
          ${disabled ? `<button class="qty-btn disabled" type="button" disabled>Habis</button>` : renderQtyControl(item.kode, qty)}
        </div>
      </div>
    </article>
  `;
}

function renderQtyControl(kode, qty) {
  if (qty <= 0) {
    return `
      <span class="order-action-wrap">
        <button class="add-cart-btn order-add-btn" type="button" data-cart-add="${escapeAttr(kode)}">Tambah</button>
        <span class="qty-control order-mobile-stepper" aria-label="Jumlah pesanan">
          <button type="button" data-cart-minus="${escapeAttr(kode)}" aria-label="Kurangi" disabled>−</button>
          <span>0</span>
          <button type="button" data-cart-add="${escapeAttr(kode)}" aria-label="Tambah">+</button>
        </span>
      </span>
    `;
  }

  return `
    <div class="qty-control" aria-label="Jumlah pesanan">
      <button type="button" data-cart-minus="${escapeAttr(kode)}" aria-label="Kurangi">−</button>
      <span>${qty}</span>
      <button type="button" data-cart-add="${escapeAttr(kode)}" aria-label="Tambah">+</button>
    </div>
  `;
}

function renderCart() {
  const entries = cartEntries();
  const totalQty = entries.reduce((sum, entry) => sum + entry.qty, 0);
  const total = entries.reduce((sum, entry) => sum + (Number(entry.item.harga) || 0) * entry.qty, 0);

  if (els.cartCount) els.cartCount.textContent = String(totalQty);
  if (els.cartCountMobile) els.cartCountMobile.textContent = String(totalQty);
  if (els.cartTotal) els.cartTotal.textContent = formatRupiah(total);
  if (els.cartTotalMobile) els.cartTotalMobile.textContent = formatRupiah(total);
  if (els.checkout) els.checkout.disabled = totalQty <= 0;

  if (!els.cartItems || !els.cartEmpty) return;

  if (!entries.length) {
    els.cartEmpty.hidden = false;
    els.cartItems.innerHTML = "";
    return;
  }

  els.cartEmpty.hidden = true;
  els.cartItems.innerHTML = entries.map(({ item, qty }) => `
    <div class="cart-line">
      <div>
        <strong>${escapeHtml(item.nama)}</strong>
        <span>${qty} × ${escapeHtml(item.hargaText || formatRupiah(item.harga))}</span>
      </div>
      <div class="cart-line-actions">
        <button type="button" data-cart-minus="${escapeAttr(item.kode)}">−</button>
        <span>${qty}</span>
        <button type="button" data-cart-add="${escapeAttr(item.kode)}">+</button>
      </div>
    </div>
  `).join("");
}

function updateQty(kode, delta) {
  const item = getItem(kode);
  if (!item || !item.tersedia) return;
  cart[kode] = Math.max(0, (cart[kode] || 0) + delta);
  if (cart[kode] <= 0) delete cart[kode];
  saveCart();
  renderMenu();
  renderCart();
}

function clearCart() {
  cart = {};
  saveCart();
  renderMenu();
  renderCart();
}

function isDeliveryMethod() {
  return els.orderMethod && els.orderMethod.value === "Delivery";
}

function setSharelocStatus(message, type = "info") {
  if (!els.orderLocationStatus) return;
  els.orderLocationStatus.textContent = message || "";
  els.orderLocationStatus.dataset.type = type;
}

function setSharelocLoading(loading) {
  if (!els.useCurrentLocation) return;
  els.useCurrentLocation.disabled = loading;
  els.useCurrentLocation.textContent = loading ? "Mengambil lokasi..." : "Ambil Shareloc Otomatis";
}

function updateOrderLocationField() {
  if (!els.orderLocation) return;

  if (isDeliveryMethod()) {
    if (els.orderLocationLabel) els.orderLocationLabel.textContent = "Shareloc Delivery";
    if (els.sharelocActions) els.sharelocActions.hidden = false;
    els.orderLocation.readOnly = true;
    els.orderLocation.placeholder = "Tekan tombol Ambil Shareloc Otomatis";
    if (els.orderLocation.value.trim() === APJ_LAHOR_OUTLET_ADDRESS) {
      els.orderLocation.value = "";
    }
    if (!els.orderLocation.value.trim()) {
      setSharelocStatus("Tekan tombol untuk mengambil lokasi customer otomatis.", "info");
    }
    return;
  }

  if (els.orderLocationLabel) els.orderLocationLabel.textContent = "Alamat Outlet";
  if (els.sharelocActions) els.sharelocActions.hidden = true;
  setSharelocStatus("", "info");
  els.orderLocation.readOnly = true;
  els.orderLocation.placeholder = "Outlet Lahor";
  els.orderLocation.value = APJ_LAHOR_OUTLET_ADDRESS;
}

function getOrderLocationLine() {
  const value = els.orderLocation && els.orderLocation.value.trim() ? els.orderLocation.value.trim() : "";
  if (isDeliveryMethod()) {
    return `Shareloc Delivery: ${value}`;
  }
  return `Alamat Outlet: ${value || APJ_LAHOR_OUTLET_ADDRESS}`;
}

function getGeolocationErrorMessage(error) {
  if (!error) return "Lokasi belum bisa diambil. Coba aktifkan GPS lalu ulangi.";
  if (error.code === 1) return "Izin lokasi ditolak. Aktifkan izin lokasi browser untuk mengirim shareloc.";
  if (error.code === 2) return "Lokasi belum ditemukan. Pastikan GPS aktif lalu coba lagi.";
  if (error.code === 3) return "Pengambilan lokasi terlalu lama. Coba tekan tombol lagi.";
  return "Lokasi belum bisa diambil. Coba aktifkan GPS lalu ulangi.";
}

function useCurrentLocation() {
  if (!isDeliveryMethod()) return;

  if (!navigator.geolocation) {
    setSharelocStatus("Browser ini belum mendukung ambil lokasi otomatis.", "error");
    return;
  }

  setSharelocLoading(true);
  setSharelocStatus("Mohon izinkan akses lokasi di browser.", "info");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude.toFixed(6);
      const lng = position.coords.longitude.toFixed(6);
      const mapUrl = `https://maps.google.com/?q=${lat},${lng}`;
      const accuracy = position.coords.accuracy ? Math.round(position.coords.accuracy) : 0;

      if (els.orderLocation) els.orderLocation.value = mapUrl;
      setSharelocStatus(accuracy ? `Shareloc berhasil diambil. Akurasi sekitar ${accuracy} meter.` : "Shareloc berhasil diambil.");
      setSharelocLoading(false);
    },
    (error) => {
      setSharelocStatus(getGeolocationErrorMessage(error), "error");
      setSharelocLoading(false);
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}

function buildCheckoutText() {
  const entries = cartEntries();
  const total = entries.reduce((sum, entry) => sum + (Number(entry.item.harga) || 0) * entry.qty, 0);
  const lines = entries.map((entry, index) => {
    const subtotal = (Number(entry.item.harga) || 0) * entry.qty;
    return `${index + 1}. ${entry.item.nama} x${entry.qty} = ${formatRupiah(subtotal)}`;
  });

  const name = els.customerName && els.customerName.value.trim() ? els.customerName.value.trim() : "";
  const method = els.orderMethod ? els.orderMethod.value : "Ambil sendiri";
  const note = els.note && els.note.value.trim() ? els.note.value.trim() : "";

  return [
    "Halo Admin APJ 👋🏻",
    "",
    "Pesanan:",
    ...lines,
    "",
    "Estimasi Total Pembayaran",
    formatRupiah(total),
    "",
    `Nama: ${name}`,
    `Metode: ${method}`,
    getOrderLocationLine(),
    `Catatan: ${note}`,
    "",
    "*_Total bersifat sementara, akan dikonfirmasi oleh Admin APJ. untuk total dan ketersediannya lauk_*"
  ].join("\n");
}

function getCheckoutUrl(text) {
  const item = links.checkout_online || links.whatsapp || links.floating_whatsapp;
  const fallback = "https://wa.me/6280000000000";
  const base = item && item.url ? item.url : fallback;

  try {
    const url = new URL(base);
    url.searchParams.set("text", text);
    return url.toString();
  } catch (_) {
    const separator = base.includes("?") ? "&" : "?";
    return `${fallback}${separator}text=${encodeURIComponent(text)}`;
  }
}

function checkout() {
  const entries = cartEntries();
  if (!entries.length) return;

  if (isDeliveryMethod() && (!els.orderLocation || !els.orderLocation.value.trim())) {
    showApjConfirm({
      title: "Ambil shareloc dulu",
      message: "Untuk pesanan delivery, customer perlu menekan tombol Ambil Shareloc Otomatis agar lokasi Maps ikut terkirim ke admin APJ.",
      primaryText: "Ambil Shareloc",
      secondaryText: "Batal",
      primaryClass: "btn-gold",
      secondaryClass: "btn-outline-modal",
      onPrimary: () => {
        openCartPanel(true);
        setTimeout(() => {
          if (els.useCurrentLocation) els.useCurrentLocation.focus();
        }, 80);
      }
    });
    return;
  }

  const totalQty = entries.reduce((sum, entry) => sum + entry.qty, 0);
  const total = entries.reduce((sum, entry) => sum + (Number(entry.item.harga) || 0) * entry.qty, 0);
  const summary = entries
    .slice(0, 4)
    .map((entry) => `${entry.item.nama} x${entry.qty}`)
    .join(", ");
  const more = entries.length > 4 ? ` dan ${entries.length - 4} menu lain` : "";

  showApjConfirm({
    title: "Pesanan sudah benar?",
    message: `${totalQty} item: ${summary}${more}. Total estimasi ${formatRupiah(total)}. Setelah lanjut ke WhatsApp, keranjang akan dikosongkan otomatis.`,
    primaryText: "Lanjut Pesanan",
    secondaryText: "Tambah Pesanan",
    primaryClass: "btn-gold",
    secondaryClass: "btn-outline-modal",
    onPrimary: () => {
      const url = getCheckoutUrl(buildCheckoutText());
      window.open(url, "_blank", "noopener");
      clearCart();
      openCartPanel(false);
    },
    onSecondary: () => openCartPanel(true)
  });
}

function openCartPanel(open) {
  if (!els.cartPanel || !els.cartBackdrop) return;
  els.cartPanel.classList.toggle("is-open", open);
  els.cartBackdrop.classList.toggle("is-open", open);
  document.body.classList.toggle("cart-open", open);
}


function hasActiveCart() {
  return cartEntries().length > 0;
}

function ensureApjModal() {
  let root = document.querySelector("#apj-cart-confirm-modal");
  if (root) return root;

  root = document.createElement("div");
  root.id = "apj-cart-confirm-modal";
  root.className = "apj-modal-backdrop";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="apj-modal" role="dialog" aria-modal="true" aria-labelledby="apj-modal-title">
      <button class="apj-modal-close" type="button" aria-label="Tutup">×</button>
      <p class="section-kicker">Konfirmasi</p>
      <h2 id="apj-modal-title"></h2>
      <p class="apj-modal-message"></p>
      <div class="apj-modal-actions">
        <button class="btn apj-modal-secondary" type="button"></button>
        <button class="btn apj-modal-primary" type="button"></button>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  return root;
}

function showApjConfirm(options) {
  const root = ensureApjModal();
  const title = root.querySelector("#apj-modal-title");
  const message = root.querySelector(".apj-modal-message");
  const primary = root.querySelector(".apj-modal-primary");
  const secondary = root.querySelector(".apj-modal-secondary");
  const close = root.querySelector(".apj-modal-close");

  title.textContent = options.title || "Konfirmasi";
  message.textContent = options.message || "";
  primary.textContent = options.primaryText || "Lanjut";
  secondary.textContent = options.secondaryText || "Batal";

  primary.className = `btn apj-modal-primary ${options.primaryClass || "btn-gold"}`;
  secondary.className = `btn apj-modal-secondary ${options.secondaryClass || "btn-outline-modal"}`;

  const hide = () => {
    root.classList.remove("is-open");
    root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  };

  primary.onclick = () => {
    hide();
    if (typeof options.onPrimary === "function") options.onPrimary();
  };
  secondary.onclick = () => {
    hide();
    if (typeof options.onSecondary === "function") options.onSecondary();
  };
  close.onclick = () => {
    hide();
    if (typeof options.onClose === "function") options.onClose();
  };
  root.onclick = (event) => {
    if (event.target === root) close.click();
  };

  root.classList.add("is-open");
  root.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  primary.focus({ preventScroll: true });
}

function maybeShowSavedCartPrompt() {
  if (!hasActiveCart()) return;
  if (sessionStorage.getItem("apj_cart_restore_prompted") === "1") return;
  sessionStorage.setItem("apj_cart_restore_prompted", "1");

  showApjConfirm({
    title: "Lanjutkan pesanan sebelumnya?",
    message: "Keranjang masih menyimpan pesanan yang belum dikirim. Lanjutkan pesanan ini atau keluar dan hapus keranjang?",
    primaryText: "Lanjutkan Pesanan",
    secondaryText: "Keluar & Hapus",
    primaryClass: "btn-gold",
    secondaryClass: "btn-danger-modal",
    onPrimary: () => openCartPanel(true),
    onSecondary: () => clearCart()
  });
}

function handleNavigationWithCart(event) {
  const link = event.target.closest("a[href]");
  if (!link || !hasActiveCart()) return;
  if (link.target === "_blank" || link.hasAttribute("download")) return;

  const href = link.getAttribute("href") || "";
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

  const current = new URL(window.location.href);
  const target = new URL(link.href, window.location.href);
  if (target.href === current.href || (target.pathname === current.pathname && target.hash)) return;

  event.preventDefault();
  showApjConfirm({
    title: "Tinggalkan halaman menu?",
    message: "Keranjangmu masih berisi pesanan. Pilih lanjutkan pesanan untuk tetap di halaman ini, atau keluar untuk menghapus keranjang dan pindah halaman.",
    primaryText: "Lanjutkan Pesanan",
    secondaryText: "Keluar",
    primaryClass: "btn-gold",
    secondaryClass: "btn-danger-modal",
    onPrimary: () => openCartPanel(true),
    onSecondary: () => {
      clearCart();
      window.location.href = target.href;
    }
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}


function applyMenuPayload(data, options = {}) {
  if (!data || !data.ok) return false;

  const beforeCartCodes = new Set(Object.keys(cart));
  menuItems = data.items || [];
  categories = data.categories || [];

  const activeAvailableCodes = new Set(
    menuItems
      .filter((item) => item && item.active !== false && item.tersedia)
      .map((item) => item.kode)
  );

  let removedFromCart = false;
  Object.keys(cart).forEach((kode) => {
    if (!activeAvailableCodes.has(kode)) {
      delete cart[kode];
      removedFromCart = true;
    }
  });

  if (removedFromCart) saveCart();

  renderCategories();
  renderMenu();
  renderCart();

  if (removedFromCart && !options.silent) {
    setStatus("Ada menu di keranjang yang sudah tidak tersedia dan otomatis dihapus.", "info");
  }

  if (removedFromCart && options.silent) {
    setStatus("Menu diperbarui. Item yang sudah habis otomatis dihapus dari keranjang.", "info");
  }

  return beforeCartCodes.size !== Object.keys(cart).length || true;
}

async function refreshMenuSilently(reason = "poll") {
  if (menuRefreshInFlight) return;
  if (document.hidden && reason === "poll") return;

  menuRefreshInFlight = true;
  try {
    const data = await jsonp("menu", { source: reason });
    if (!data || !data.ok) return;
    applyMenuPayload(data, { silent: true });
  } catch (_) {
    // Senyap saja. Kalau jaringan gagal sesaat, data lama tetap dipakai.
  } finally {
    menuRefreshInFlight = false;
  }
}

function initMenuAutoRefresh() {
  window.setInterval(() => refreshMenuSilently("poll"), APJ_MENU_POLL_MS);

  window.addEventListener("focus", () => refreshMenuSilently("focus"));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshMenuSilently("visible");
  });

  window.addEventListener("storage", (event) => {
    if (event.key === APJ_MENU_UPDATE_SIGNAL_KEY) {
      refreshMenuSilently("admin-signal");
    }
  });

  try {
    if (window.BroadcastChannel) {
      const channel = new BroadcastChannel("apj_menu_updates");
      channel.addEventListener("message", (event) => {
        if (event.data && event.data.type === "menu-updated") {
          refreshMenuSilently("broadcast");
        }
      });
    }
  } catch (_) {}
}

async function initMenu() {
  setStatus("Memuat menu APJ...", "info");

  try {
    const [menuData, linkData] = await Promise.all([
      jsonp("menu"),
      jsonp("links").catch(() => ({ ok: false }))
    ]);

    if (linkData && linkData.ok && linkData.links) links = linkData.links;

    if (!menuData || !menuData.ok) {
      throw new Error(menuData && menuData.message ? menuData.message : "Data menu tidak valid.");
    }

    applyMenuPayload(menuData, { silent: false });
    setStatus(`${menuItems.length} menu dimuat.`, "success");
  } catch (error) {
    console.warn(error);
    setStatus("Menu belum bisa dimuat. Pastikan Code.gs sudah di-deploy ulang dan setupMenuApj() sudah dijalankan.", "error");
    if (els.grid) els.grid.innerHTML = `<div class="menu-empty-state">Menu belum tersedia. Silakan hubungi admin APJ melalui WhatsApp.</div>`;
  }
}

if (els.categories) {
  els.categories.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-category]");
    if (!btn) return;
    activeCategory = btn.dataset.category;
    renderCategories();
    renderMenu();
  });
}

if (els.search) {
  els.search.addEventListener("input", () => {
    searchQuery = els.search.value;
    renderMenu();
  });
}

document.addEventListener("click", (event) => {
  const add = event.target.closest("[data-cart-add]");
  const minus = event.target.closest("[data-cart-minus]");
  if (add) updateQty(add.dataset.cartAdd, 1);
  if (minus) updateQty(minus.dataset.cartMinus, -1);
});

if (els.checkout) els.checkout.addEventListener("click", checkout);
if (els.orderMethod) els.orderMethod.addEventListener("change", updateOrderLocationField);
if (els.useCurrentLocation) els.useCurrentLocation.addEventListener("click", useCurrentLocation);
if (els.clearCart) els.clearCart.addEventListener("click", () => {
  showApjConfirm({
    title: "Kosongkan keranjang?",
    message: "Semua menu yang sudah dipilih akan dihapus dari keranjang.",
    primaryText: "Kosongkan",
    secondaryText: "Batal",
    primaryClass: "btn-danger-modal",
    secondaryClass: "btn-outline-modal",
    onPrimary: () => clearCart()
  });
});
if (els.openCart) els.openCart.addEventListener("click", () => openCartPanel(true));
if (els.closeCart) els.closeCart.addEventListener("click", () => openCartPanel(false));
if (els.cartBackdrop) els.cartBackdrop.addEventListener("click", () => openCartPanel(false));
document.addEventListener("click", handleNavigationWithCart, true);
window.addEventListener("beforeunload", (event) => {
  if (!hasActiveCart()) return;
  event.preventDefault();
  event.returnValue = "";
});

initMenu().then(() => {
  updateOrderLocationField();
  maybeShowSavedCartPrompt();
  initMenuAutoRefresh();
});

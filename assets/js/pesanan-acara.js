const CUSTOM_LINK_API_URL = "https://script.google.com/macros/s/AKfycbwJxEp0UdTH1cameXqLkK4S8ImYRNfs_vWpH53aREulf7mSiEaHxAQ_q5WAlxjkj8kd/exec";
const FALLBACK_CHECKOUT_URL = "https://wa.me/6280000000000";

const els = {
  groups: document.querySelector("#custom-groups"),
  emptyState: document.querySelector("#custom-empty-state"),
  summaryList: document.querySelector("#custom-summary-list"),
  summaryStatus: document.querySelector("#custom-summary-status"),
  checkoutBtn: document.querySelector("#custom-checkout-wa"),
  copyBtn: document.querySelector("#custom-copy-message"),
  reservationBtn: document.querySelector("#reservation-wa"),
  loadSampleBtn: document.querySelector("#load-sample-order"),
  customerName: document.querySelector("#customer-name"),
  customerPhone: document.querySelector("#customer-phone"),
  orderDate: document.querySelector("#order-date"),
  orderTime: document.querySelector("#order-time"),
  orderMethod: document.querySelector("#order-method"),
  orderLocation: document.querySelector("#order-location"),
  orderNote: document.querySelector("#order-note")
};

let groups = [];
let checkoutUrl = FALLBACK_CHECKOUT_URL;

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) return "-";
  const [year, month, date] = value.split("-");
  if (!year || !month || !date) return value;
  return `${date}/${month}/${year}`;
}

function toInt(value) {
  const number = parseInt(String(value || "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(number) ? number : 0;
}

function groupUnit(type) {
  if (type === "Nasi Kotak") return "kotak";
  if (type === "Nasi Bungkus") return "bungkus";
  return "item";
}

function getCustomerData() {
  return {
    name: els.customerName?.value.trim() || "-",
    phone: els.customerPhone?.value.trim() || "-",
    date: els.orderDate?.value || "",
    time: els.orderTime?.value || "",
    method: els.orderMethod?.value || "-",
    location: els.orderLocation?.value.trim() || "-",
    note: els.orderNote?.value.trim() || "-"
  };
}

function addPackageVariant(group, data = {}) {
  group.variants.push({
    id: createId("var"),
    qty: data.qty || "",
    lauk: data.lauk || "",
    note: data.note || ""
  });
}

function addLaukItem(group, data = {}) {
  group.items.push({
    id: createId("lauk"),
    qty: data.qty || "",
    name: data.name || "",
    unit: data.unit || "pcs",
    note: data.note || ""
  });
}

function addGroup(type, data = {}) {
  const group = {
    id: createId("group"),
    type,
    total: data.total || "",
    laukCount: data.laukCount || "",
    note: data.note || "",
    variants: [],
    items: []
  };

  if (type === "Lauk Saja") {
    (data.items || []).forEach((item) => addLaukItem(group, item));
    if (!group.items.length) addLaukItem(group);
  } else {
    (data.variants || []).forEach((variant) => addPackageVariant(group, variant));
    if (!group.variants.length) addPackageVariant(group);
  }

  groups.push(group);
  render();
}

function removeGroup(groupId) {
  groups = groups.filter((group) => group.id !== groupId);
  render();
}

function findGroup(groupId) {
  return groups.find((group) => group.id === groupId);
}

function updateGroupValue(groupId, key, value) {
  const group = findGroup(groupId);
  if (!group) return;
  group[key] = value;
  renderSummaryOnly();
}

function updateVariantValue(groupId, variantId, key, value) {
  const group = findGroup(groupId);
  if (!group) return;
  const variant = group.variants.find((item) => item.id === variantId);
  if (!variant) return;
  variant[key] = value;
  renderSummaryOnly();
}

function updateLaukValue(groupId, itemId, key, value) {
  const group = findGroup(groupId);
  if (!group) return;
  const item = group.items.find((row) => row.id === itemId);
  if (!item) return;
  item[key] = value;
  renderSummaryOnly();
}

function removeVariant(groupId, variantId) {
  const group = findGroup(groupId);
  if (!group) return;
  group.variants = group.variants.filter((item) => item.id !== variantId);
  if (!group.variants.length) addPackageVariant(group);
  render();
}

function removeLaukItem(groupId, itemId) {
  const group = findGroup(groupId);
  if (!group) return;
  group.items = group.items.filter((item) => item.id !== itemId);
  if (!group.items.length) addLaukItem(group);
  render();
}

function getGroupStatus(group) {
  if (group.type === "Lauk Saja") {
    const filledItems = group.items.filter((item) => toInt(item.qty) > 0 && item.name.trim());
    return {
      ok: filledItems.length > 0,
      text: filledItems.length ? `${filledItems.length} lauk diisi` : "Isi minimal 1 lauk.",
      variantTotal: filledItems.reduce((sum, item) => sum + toInt(item.qty), 0),
      diff: 0
    };
  }

  const total = toInt(group.total);
  const variantTotal = group.variants.reduce((sum, item) => sum + toInt(item.qty), 0);
  const validNames = group.variants.every((item) => toInt(item.qty) <= 0 || item.lauk.trim());
  const diff = total - variantTotal;

  if (!total) return { ok: false, text: "Isi jumlah total.", variantTotal, diff };
  if (!validNames) return { ok: false, text: "Ada varian yang belum diisi lauknya.", variantTotal, diff };
  if (variantTotal === total) return { ok: true, text: "Total sesuai.", variantTotal, diff };
  if (diff > 0) return { ok: false, text: `Masih kurang ${diff} ${groupUnit(group.type)}.`, variantTotal, diff };
  return { ok: false, text: `Kelebihan ${Math.abs(diff)} ${groupUnit(group.type)}.`, variantTotal, diff };
}

function renderVariantRow(group, variant) {
  return `
    <div class="variant-row" data-variant-id="${variant.id}">
      <label>
        Qty
        <input type="number" min="0" inputmode="numeric" value="${escapeHtml(variant.qty)}" data-field="variant-qty" placeholder="15" />
      </label>
      <label>
        Isi Lauk / Kombinasi
        <input type="text" value="${escapeHtml(variant.lauk)}" data-field="variant-lauk" placeholder="Rendang + Perkedel" />
      </label>
      <label>
        Catatan
        <input type="text" value="${escapeHtml(variant.note)}" data-field="variant-note" placeholder="Opsional" />
      </label>
      <button class="custom-row-remove" type="button" data-remove-variant="${variant.id}" aria-label="Hapus varian">×</button>
    </div>
  `;
}

function renderLaukRow(group, item) {
  return `
    <div class="lauk-row" data-lauk-id="${item.id}">
      <label>
        Qty
        <input type="number" min="0" inputmode="numeric" value="${escapeHtml(item.qty)}" data-field="lauk-qty" placeholder="20" />
      </label>
      <label>
        Nama Lauk
        <input type="text" value="${escapeHtml(item.name)}" data-field="lauk-name" placeholder="Rendang" />
      </label>
      <label>
        Satuan
        <select data-field="lauk-unit">
          <option value="pcs" ${item.unit === "pcs" ? "selected" : ""}>pcs</option>
          <option value="porsi" ${item.unit === "porsi" ? "selected" : ""}>porsi</option>
          <option value="kg" ${item.unit === "kg" ? "selected" : ""}>kg</option>
          <option value="paket" ${item.unit === "paket" ? "selected" : ""}>paket</option>
        </select>
      </label>
      <label>
        Catatan
        <input type="text" value="${escapeHtml(item.note)}" data-field="lauk-note" placeholder="Opsional" />
      </label>
      <button class="custom-row-remove" type="button" data-remove-lauk="${item.id}" aria-label="Hapus lauk">×</button>
    </div>
  `;
}

function renderGroup(group, index) {
  const status = getGroupStatus(group);
  const unit = groupUnit(group.type);

  if (group.type === "Lauk Saja") {
    return `
      <article class="custom-group-card" data-group-id="${group.id}">
        <div class="custom-group-head">
          <div>
            <span class="custom-group-number">${index + 1}</span>
            <h3>${escapeHtml(group.type)}</h3>
            <p>Untuk pesanan lauk tanpa nasi/kotak.</p>
          </div>
          <button class="custom-remove-group" type="button" data-remove-group="${group.id}">Hapus</button>
        </div>
        <div class="custom-row-list">
          ${group.items.map((item) => renderLaukRow(group, item)).join("")}
        </div>
        <div class="custom-group-bottom">
          <button class="custom-add-row" type="button" data-add-lauk="${group.id}">+ Tambah Lauk</button>
          <span class="custom-validation ${status.ok ? "is-ok" : "is-warning"}">${escapeHtml(status.text)}</span>
        </div>
      </article>
    `;
  }

  return `
    <article class="custom-group-card" data-group-id="${group.id}">
      <div class="custom-group-head">
        <div>
          <span class="custom-group-number">${index + 1}</span>
          <h3>${escapeHtml(group.type)}</h3>
          <p>Bagi total ${unit} menjadi beberapa varian isi lauk.</p>
        </div>
        <button class="custom-remove-group" type="button" data-remove-group="${group.id}">Hapus</button>
      </div>

      <div class="package-config-grid">
        <label>
          Total ${unit}
          <input type="number" min="0" inputmode="numeric" value="${escapeHtml(group.total)}" data-field="group-total" placeholder="50" />
        </label>
        <label>
          Jumlah jenis lauk
          <input type="number" min="1" max="10" inputmode="numeric" value="${escapeHtml(group.laukCount)}" data-field="group-lauk-count" placeholder="2 / 3 / 5" />
        </label>
        <label>
          Catatan grup
          <input type="text" value="${escapeHtml(group.note)}" data-field="group-note" placeholder="Contoh: sambal pisah" />
        </label>
      </div>

      <div class="custom-progress" aria-label="Validasi jumlah varian">
        <div>
          <strong>${status.variantTotal}</strong>
          <span>terbagi dari ${toInt(group.total)} ${unit}</span>
        </div>
        <em class="${status.ok ? "is-ok" : "is-warning"}">${escapeHtml(status.text)}</em>
      </div>

      <div class="custom-row-list">
        ${group.variants.map((variant) => renderVariantRow(group, variant)).join("")}
      </div>
      <div class="custom-group-bottom">
        <button class="custom-add-row" type="button" data-add-variant="${group.id}">+ Tambah Varian</button>
        <span class="custom-validation ${status.ok ? "is-ok" : "is-warning"}">${status.ok ? "Siap dikirim" : "Belum sesuai"}</span>
      </div>
    </article>
  `;
}

function renderGroups() {
  if (!els.groups) return;
  els.groups.innerHTML = groups.map(renderGroup).join("");
  if (els.emptyState) els.emptyState.hidden = groups.length > 0;
}

function buildSummaryHtml() {
  if (!groups.length) return `<p class="custom-summary-empty">Rincian pesanan akan tampil di sini.</p>`;

  return groups.map((group, index) => {
    const status = getGroupStatus(group);
    const unit = groupUnit(group.type);

    if (group.type === "Lauk Saja") {
      const rows = group.items
        .filter((item) => toInt(item.qty) > 0 || item.name.trim())
        .map((item) => `<li>${toInt(item.qty) || "?"} ${escapeHtml(item.unit)} ${escapeHtml(item.name || "(nama lauk belum diisi)")}${item.note ? ` <small>(${escapeHtml(item.note)})</small>` : ""}</li>`)
        .join("");
      return `
        <div class="custom-summary-group">
          <strong>${index + 1}. ${escapeHtml(group.type)}</strong>
          <ul>${rows || "<li>Belum ada lauk.</li>"}</ul>
          <span class="${status.ok ? "is-ok" : "is-warning"}">${escapeHtml(status.text)}</span>
        </div>
      `;
    }

    const rows = group.variants
      .filter((item) => toInt(item.qty) > 0 || item.lauk.trim())
      .map((item) => `<li>${toInt(item.qty) || "?"} ${unit} — ${escapeHtml(item.lauk || "(lauk belum diisi)")}${item.note ? ` <small>(${escapeHtml(item.note)})</small>` : ""}</li>`)
      .join("");

    return `
      <div class="custom-summary-group">
        <strong>${index + 1}. ${escapeHtml(group.type)}</strong>
        <p>Total: ${toInt(group.total) || "?"} ${unit}${group.laukCount ? ` • Jenis lauk: ${escapeHtml(group.laukCount)}` : ""}</p>
        <ul>${rows || "<li>Belum ada varian.</li>"}</ul>
        <span class="${status.ok ? "is-ok" : "is-warning"}">${escapeHtml(status.text)}</span>
      </div>
    `;
  }).join("");
}

function getOverallStatus() {
  if (!groups.length) return { ok: false, text: "Tambahkan minimal 1 grup pesanan.", type: "info" };
  const invalid = groups.map(getGroupStatus).filter((status) => !status.ok);
  if (invalid.length) return { ok: false, text: `${invalid.length} grup belum sesuai. Rapikan dulu sebelum kirim WhatsApp.`, type: "warning" };
  return { ok: true, text: "Semua grup sudah sesuai. Pesanan siap dikirim ke admin APJ.", type: "success" };
}

function renderSummaryOnly() {
  if (els.summaryList) els.summaryList.innerHTML = buildSummaryHtml();
  const status = getOverallStatus();
  if (els.summaryStatus) {
    els.summaryStatus.textContent = status.text;
    els.summaryStatus.dataset.status = status.type;
  }
  if (els.checkoutBtn) els.checkoutBtn.disabled = !status.ok;
  if (els.copyBtn) els.copyBtn.disabled = !groups.length;
}

function render() {
  renderGroups();
  renderSummaryOnly();
}

function buildWhatsAppMessage(isReservationOnly = false) {
  const customer = getCustomerData();

  if (isReservationOnly) {
    return [
      "Halo Admin APJ, saya mau reservasi / konsultasi pesanan acara dari website.",
      "",
      "DATA PEMESAN",
      `Nama: ${customer.name}`,
      `No. WA: ${customer.phone}`,
      `Tanggal: ${formatDate(customer.date)}`,
      `Jam: ${customer.time || "-"}`,
      `Metode: ${customer.method}`,
      `Outlet / Alamat: ${customer.location}`,
      `Catatan: ${customer.note}`,
      "",
      "Mohon dibantu konfirmasi ketersediaan dan detail paketnya."
    ].join("\n");
  }

  const lines = [
    "Halo Admin APJ, saya mau membuat pesanan dari website.",
    "",
    "DATA PEMESAN",
    `Nama: ${customer.name}`,
    `No. WA: ${customer.phone}`,
    `Tanggal: ${formatDate(customer.date)}`,
    `Jam: ${customer.time || "-"}`,
    `Metode: ${customer.method}`,
    `Outlet / Alamat: ${customer.location}`,
    `Catatan Umum: ${customer.note}`,
    "",
    "RINCIAN PESANAN"
  ];

  groups.forEach((group, index) => {
    const unit = groupUnit(group.type);
    lines.push("");
    lines.push(`${index + 1}. ${group.type.toUpperCase()}`);

    if (group.type === "Lauk Saja") {
      const items = group.items.filter((item) => toInt(item.qty) > 0 && item.name.trim());
      if (!items.length) {
        lines.push("- Belum ada lauk diisi.");
      } else {
        items.forEach((item) => {
          lines.push(`- ${item.name}: ${toInt(item.qty)} ${item.unit}${item.note ? ` (${item.note})` : ""}`);
        });
      }
      return;
    }

    lines.push(`Total: ${toInt(group.total)} ${unit}`);
    if (group.laukCount) lines.push(`Jumlah jenis lauk: ${group.laukCount}`);
    if (group.note) lines.push(`Catatan grup: ${group.note}`);
    lines.push("Rincian:");
    group.variants
      .filter((variant) => toInt(variant.qty) > 0 && variant.lauk.trim())
      .forEach((variant) => {
        lines.push(`- ${variant.lauk}: ${toInt(variant.qty)} ${unit}${variant.note ? ` (${variant.note})` : ""}`);
      });
  });

  lines.push("");
  lines.push("Mohon dikonfirmasi total harga dan ketersediaannya.");
  return lines.join("\n");
}

function openWhatsapp(message) {
  const baseUrl = checkoutUrl || FALLBACK_CHECKOUT_URL;
  const separator = baseUrl.includes("?") ? "&" : "?";
  const textParam = `text=${encodeURIComponent(message)}`;
  window.location.href = `${baseUrl}${separator}${textParam}`;
}

async function copyMessage() {
  const message = buildWhatsAppMessage(false);
  try {
    await navigator.clipboard.writeText(message);
    if (els.summaryStatus) {
      els.summaryStatus.textContent = "Format pesanan berhasil disalin.";
      els.summaryStatus.dataset.status = "success";
    }
  } catch (error) {
    window.prompt("Salin format pesanan ini:", message);
  }
}

function loadSampleOrder() {
  groups = [];
  addGroup("Nasi Bungkus", {
    total: "50",
    laukCount: "2",
    variants: [
      { qty: "34", lauk: "Ayam Goreng" },
      { qty: "16", lauk: "Telur Balado" }
    ]
  });
  addGroup("Nasi Kotak", {
    total: "50",
    laukCount: "3",
    variants: [
      { qty: "15", lauk: "Rendang" },
      { qty: "15", lauk: "Rendang + Perkedel" },
      { qty: "20", lauk: "Ayam Goreng" }
    ]
  });
  addGroup("Lauk Saja", {
    items: [
      { qty: "20", name: "Rendang", unit: "pcs" },
      { qty: "30", name: "Ayam Goreng", unit: "pcs" },
      { qty: "50", name: "Perkedel", unit: "pcs" }
    ]
  });
  document.querySelector("#order-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function onGroupInput(event) {
  const groupCard = event.target.closest("[data-group-id]");
  if (!groupCard) return;
  const groupId = groupCard.dataset.groupId;
  const variantRow = event.target.closest("[data-variant-id]");
  const laukRow = event.target.closest("[data-lauk-id]");
  const field = event.target.dataset.field;
  if (!field) return;

  if (variantRow) {
    const variantId = variantRow.dataset.variantId;
    const keyMap = { "variant-qty": "qty", "variant-lauk": "lauk", "variant-note": "note" };
    updateVariantValue(groupId, variantId, keyMap[field], event.target.value);
    return;
  }

  if (laukRow) {
    const itemId = laukRow.dataset.laukId;
    const keyMap = { "lauk-qty": "qty", "lauk-name": "name", "lauk-unit": "unit", "lauk-note": "note" };
    updateLaukValue(groupId, itemId, keyMap[field], event.target.value);
    return;
  }

  const keyMap = { "group-total": "total", "group-lauk-count": "laukCount", "group-note": "note" };
  if (keyMap[field]) updateGroupValue(groupId, keyMap[field], event.target.value);
}

function onGroupClick(event) {
  const addType = event.target.closest("[data-add-group]");
  if (addType) {
    addGroup(addType.dataset.addGroup);
    return;
  }

  const groupCard = event.target.closest("[data-group-id]");
  const groupId = groupCard?.dataset.groupId;
  if (!groupId) return;

  const removeGroupBtn = event.target.closest("[data-remove-group]");
  if (removeGroupBtn) {
    removeGroup(groupId);
    return;
  }

  const addVariantBtn = event.target.closest("[data-add-variant]");
  if (addVariantBtn) {
    const group = findGroup(groupId);
    if (group) addPackageVariant(group);
    render();
    return;
  }

  const removeVariantBtn = event.target.closest("[data-remove-variant]");
  if (removeVariantBtn) {
    removeVariant(groupId, removeVariantBtn.dataset.removeVariant);
    return;
  }

  const addLaukBtn = event.target.closest("[data-add-lauk]");
  if (addLaukBtn) {
    const group = findGroup(groupId);
    if (group) addLaukItem(group);
    render();
    return;
  }

  const removeLaukBtn = event.target.closest("[data-remove-lauk]");
  if (removeLaukBtn) {
    removeLaukItem(groupId, removeLaukBtn.dataset.removeLauk);
  }
}

function applyCheckoutLink(data) {
  if (!data || !data.ok || !data.links) return;
  const link = data.links.checkout_online || data.links.whatsapp || data.links.floating_whatsapp;
  if (link && link.url && /^https?:\/\//i.test(link.url)) checkoutUrl = link.url;
}

function loadCheckoutLinkJsonp() {
  return new Promise((resolve) => {
    const callbackName = `apjCustomOrderLinks_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const script = document.createElement("script");
    const finish = (data) => {
      clearTimeout(timer);
      script.remove();
      delete window[callbackName];
      applyCheckoutLink(data);
      resolve();
    };
    const timer = setTimeout(() => finish(null), 7000);
    window[callbackName] = finish;
    script.async = true;
    script.src = `${CUSTOM_LINK_API_URL}?action=links&callback=${callbackName}&t=${Date.now()}`;
    script.onerror = () => finish(null);
    document.head.appendChild(script);
  });
}

async function loadCheckoutLink() {
  try {
    const response = await fetch(`${CUSTOM_LINK_API_URL}?action=links&t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    applyCheckoutLink(data);
  } catch (error) {
    await loadCheckoutLinkJsonp();
  }
}

function init() {
  document.querySelectorAll("[data-add-group]").forEach((btn) => {
    btn.addEventListener("click", () => addGroup(btn.dataset.addGroup));
  });

  els.groups?.addEventListener("input", onGroupInput);
  els.groups?.addEventListener("change", onGroupInput);
  els.groups?.addEventListener("click", onGroupClick);

  [els.customerName, els.customerPhone, els.orderDate, els.orderTime, els.orderMethod, els.orderLocation, els.orderNote].forEach((input) => {
    input?.addEventListener("input", renderSummaryOnly);
    input?.addEventListener("change", renderSummaryOnly);
  });

  els.checkoutBtn?.addEventListener("click", () => openWhatsapp(buildWhatsAppMessage(false)));
  els.copyBtn?.addEventListener("click", copyMessage);
  els.reservationBtn?.addEventListener("click", () => openWhatsapp(buildWhatsAppMessage(true)));
  els.loadSampleBtn?.addEventListener("click", loadSampleOrder);

  addGroup("Nasi Bungkus");
  loadCheckoutLink();
}

init();

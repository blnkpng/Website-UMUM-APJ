/**
 * Ampera Pak Jenggot - Google Apps Script Web API
 *
 * Dipakai oleh website statis APJ untuk:
 * - membaca link dinamis dari sheet LINK_APJ
 * - membaca menu dari sheet MENU_APJ
 * - login admin menu dengan PIN
 * - mengubah status tersedia/habis
 * - menambah dan memperbarui item menu
 * - mengunggah foto menu ke Google Drive
 *
 * Konfigurasi dapat diganti langsung di CONFIG, atau lebih aman lewat
 * Project Settings > Script Properties:
 * APJ_SPREADSHEET_ID, APJ_PHOTO_FOLDER_ID, APJ_ADMIN_PIN.
 */

const CONFIG = Object.freeze({
  SPREADSHEET_ID: "1g0aYmdYNYUeJ4xMMjEiW5ej2K0TUFGU5p8d0wCfX3jk",
  SHEET_LINK: "LINK_APJ",
  SHEET_MENU: "MENU_APJ",
  PHOTO_FOLDER_ID: "1iUwa9K0jVP3HdgiQLsb46c03Lsdrr_T5",
  PHOTO_FOLDER_NAME: "APJ_MENU_PHOTOS",
  ADMIN_PIN: "123456",
  DEFAULT_IMAGE: "assets/img/signature-dish.jpg",
  MAX_PHOTO_BYTES: 5 * 1024 * 1024,
  CACHE_HINT: "SERVER_REALTIME_BROWSER_CACHE_2_MINUTES",
  LINK_HEADERS: ["KEY", "LABEL", "URL", "ACTIVE", "KETERANGAN", "UPDATED_AT"],
  MENU_HEADERS: [
    "KODE",
    "KATEGORI",
    "NAMA_MENU",
    "DESKRIPSI",
    "HARGA_ONLINE",
    "FOTO",
    "TERSEDIA",
    "ACTIVE",
    "URUTAN",
    "UPDATED_AT"
  ]
});

function doGet(e) {
  const params = getParams_(e);
  const action = normalizeAction_(params.action, "links");
  const callback = sanitizeCallback_(params.callback);
  let result;

  try {
    result = routeGet_(action, params);
  } catch (err) {
    result = error_(getErrorMessage_(err));
  }

  return output_(result, callback);
}

function doPost(e) {
  const params = getParams_(e);
  const action = normalizeAction_(params.action, "");
  let result;

  try {
    if (action === "add_menu_item_upload") {
      result = addMenuItemWithUpload_(params);
    } else if (action === "update_menu_item_upload") {
      result = updateMenuItemWithUpload_(params);
    } else {
      result = error_("Action POST tidak dikenali.");
    }
  } catch (err) {
    result = error_(getErrorMessage_(err));
  }

  return postMessageOutput_(result, params.requestId || "");
}

function routeGet_(action, params) {
  if (action === "setup" || action === "setup_links") {
    return setupLinkApj();
  }

  if (action === "setup_menu") {
    return setupMenuApj();
  }

  if (action === "setup_all") {
    return setupAllApj();
  }

  if (action === "health") {
    return healthCheck_();
  }

  if (action === "menu") {
    return getMenuApjData_(false);
  }

  if (action === "admin_menu") {
    return requirePin_(params) || getMenuApjData_(true);
  }

  if (action === "update_availability") {
    return updateMenuAvailability_(params);
  }

  if (action === "add_menu_item") {
    return addMenuItem_(params);
  }

  if (action === "update_menu_item") {
    return updateMenuItem_(params);
  }

  return getLinkApjData_();
}

/**
 * Jalankan sekali dari Apps Script editor atau browser:
 * ?action=setup_all
 */
function setupAllApj() {
  const links = setupLinkApj();
  const menu = setupMenuApj();

  return {
    ok: links.ok && menu.ok,
    message: "Setup APJ selesai. Sheet link dan menu siap dipakai.",
    links,
    menu
  };
}

function setupLinkApj() {
  const ss = getSpreadsheet_();
  const sh = getOrCreateSheet_(ss, getSetting_("SHEET_LINK"));
  const rows = getDefaultLinkRows_();

  sh.clear();
  sh.getRange(1, 1, 1, CONFIG.LINK_HEADERS.length).setValues([CONFIG.LINK_HEADERS]);
  sh.getRange(2, 1, rows.length, CONFIG.LINK_HEADERS.length).setValues(rows);

  formatLinkSheet_(sh);

  return {
    ok: true,
    message: "Sheet LINK_APJ berhasil dibuat atau diperbarui.",
    spreadsheetId: ss.getId(),
    sheetName: sh.getName(),
    rowCount: rows.length
  };
}

function setupMenuApj() {
  const ss = getSpreadsheet_();
  const sh = ensureMenuSheet_(ss, true);

  formatMenuSheet_(sh);
  ensureWebsiteLinkRows_();

  return {
    ok: true,
    message: "Sheet MENU_APJ siap dipakai. Link website juga sudah dicek.",
    spreadsheetId: ss.getId(),
    sheetName: sh.getName(),
    rowCount: Math.max(sh.getLastRow() - 1, 0)
  };
}

function healthCheck_() {
  return {
    ok: true,
    app: "APJ Web API",
    spreadsheetId: getSetting_("SPREADSHEET_ID"),
    linkSheet: getSetting_("SHEET_LINK"),
    menuSheet: getSetting_("SHEET_MENU"),
    updatedAt: new Date().toISOString()
  };
}

function getLinkApjData_() {
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(getSetting_("SHEET_LINK"));

  if (!sh) {
    return error_("Sheet LINK_APJ belum ada. Jalankan setupLinkApj() atau ?action=setup_links dulu.");
  }

  const values = sh.getDataRange().getValues();
  if (values.length < 2) {
    return error_("Sheet LINK_APJ masih kosong.");
  }

  const headers = getHeaderMapFromValues_(values[0]);
  const required = ["KEY", "LABEL", "URL", "ACTIVE"];
  const missing = findMissingHeaders_(headers, required);
  if (missing.length) {
    return error_("Header LINK_APJ belum lengkap: " + missing.join(", ") + ".");
  }

  const links = {};
  const inactiveKeys = [];

  values.slice(1).forEach(function(row) {
    const key = cell_(row, headers, "KEY").trim();
    const label = cell_(row, headers, "LABEL").trim();
    const url = cell_(row, headers, "URL").trim();
    const active = toBoolean_(cellRaw_(row, headers, "ACTIVE"), false);
    const updatedAt = cellRaw_(row, headers, "UPDATED_AT");

    if (!key) return;

    if (!active || !url) {
      inactiveKeys.push(key);
      return;
    }

    links[key] = {
      label: label || key,
      url,
      updatedAt: toIsoText_(updatedAt)
    };
  });

  return {
    ok: true,
    source: "APJ_LINK_SHEET",
    cache: CONFIG.CACHE_HINT,
    links,
    inactiveKeys,
    updatedAt: new Date().toISOString()
  };
}

function getMenuApjData_(includeInactive) {
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(getSetting_("SHEET_MENU"));

  if (!sh) {
    return error_("Sheet MENU_APJ belum ada. Jalankan setupMenuApj() atau ?action=setup_menu dulu.");
  }

  const lastRow = sh.getLastRow();
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = getHeaderMap_(sh);
  const required = ["KODE", "KATEGORI", "NAMA_MENU", "HARGA_ONLINE", "TERSEDIA", "ACTIVE"];
  const missing = findMissingHeaders_(headers, required);

  if (missing.length) {
    return error_("Header MENU_APJ belum lengkap: " + missing.join(", ") + ".");
  }

  if (lastRow < 2) {
    return {
      ok: true,
      source: "APJ_MENU_SHEET",
      items: [],
      categories: [],
      message: "Belum ada data menu.",
      updatedAt: new Date().toISOString()
    };
  }

  const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const items = [];
  const categoryMap = {};

  values.forEach(function(row) {
    const item = menuItemFromRow_(row, headers);
    if (!item.kode || !item.nama) return;
    if (!includeInactive && !item.active) return;

    categoryMap[item.kategori] = true;
    items.push(item);
  });

  items.sort(function(a, b) {
    if (a.urutan !== b.urutan) return a.urutan - b.urutan;
    return a.nama.localeCompare(b.nama);
  });

  return {
    ok: true,
    source: "APJ_MENU_SHEET",
    items,
    categories: Object.keys(categoryMap).sort(),
    updatedAt: new Date().toISOString()
  };
}

function updateMenuAvailability_(params) {
  const authError = requirePin_(params);
  if (authError) return authError;

  const kode = cleanText_(params.kode).toUpperCase();
  const tersedia = toBoolean_(params.tersedia, null);

  if (!kode) return error_("Kode menu wajib diisi.");
  if (tersedia === null) return error_("Status tersedia wajib diisi.");

  return withWriteLock_(function() {
    const ss = getSpreadsheet_();
    const sh = ensureMenuSheet_(ss, false);
    const headers = getHeaderMap_(sh);
    const rowIndex = findMenuRowByCode_(sh, headers, kode);

    if (rowIndex < 0) {
      return error_("Menu dengan kode " + kode + " tidak ditemukan.");
    }

    setCell_(sh, headers, rowIndex, "TERSEDIA", tersedia);
    setCell_(sh, headers, rowIndex, "UPDATED_AT", new Date());
    SpreadsheetApp.flush();

    return {
      ok: true,
      message: tersedia ? "Menu ditandai tersedia." : "Menu ditandai habis.",
      kode,
      tersedia,
      updatedAt: new Date().toISOString()
    };
  });
}

function addMenuItem_(params) {
  const authError = requirePin_(params);
  if (authError) return authError;

  const payload = normalizeMenuPayload_(params, {
    requireCode: false,
    defaultAvailable: true,
    defaultActive: true
  });

  return withWriteLock_(function() {
    return addMenuItemInternal_(payload);
  });
}

function updateMenuItem_(params) {
  const authError = requirePin_(params);
  if (authError) return authError;

  const payload = normalizeMenuPayload_(params, {
    requireCode: true,
    defaultAvailable: undefined,
    defaultActive: undefined
  });

  return withWriteLock_(function() {
    return updateMenuItemInternal_(payload);
  });
}

function addMenuItemWithUpload_(params) {
  const authError = requirePin_(params);
  if (authError) return authError;

  const payload = normalizeMenuPayload_(params, {
    requireCode: false,
    defaultAvailable: true,
    defaultActive: true
  });

  if (cleanText_(params.fotoBase64)) {
    payload.foto = saveMenuPhoto_(params, payload.nama);
  }

  const result = withWriteLock_(function() {
    return addMenuItemInternal_(payload);
  });

  if (result.ok && payload.foto) result.fotoUrl = payload.foto;
  return result;
}

function updateMenuItemWithUpload_(params) {
  const authError = requirePin_(params);
  if (authError) return authError;

  const payload = normalizeMenuPayload_(params, {
    requireCode: true,
    defaultAvailable: undefined,
    defaultActive: undefined
  });

  if (cleanText_(params.fotoBase64)) {
    payload.foto = saveMenuPhoto_(params, payload.nama);
  }

  const result = withWriteLock_(function() {
    return updateMenuItemInternal_(payload);
  });

  if (result.ok && payload.foto) result.fotoUrl = payload.foto;
  return result;
}

function addMenuItemInternal_(payload) {
  const ss = getSpreadsheet_();
  const sh = ensureMenuSheet_(ss, false);
  const headers = getHeaderMap_(sh);
  const missing = findMissingHeaders_(headers, CONFIG.MENU_HEADERS);

  if (missing.length) {
    return error_("Header MENU_APJ belum lengkap: " + missing.join(", ") + ".");
  }

  const meta = getNextMenuMeta_(sh, headers);
  const kode = payload.kode || meta.kode;

  if (findMenuRowByCode_(sh, headers, kode) > 0) {
    return error_("Kode menu " + kode + " sudah dipakai.");
  }

  const rowIndex = sh.getLastRow() + 1;
  const item = {
    kode,
    kategori: payload.kategori,
    nama: payload.nama,
    deskripsi: payload.deskripsi,
    harga: payload.harga,
    foto: payload.foto || CONFIG.DEFAULT_IMAGE,
    tersedia: payload.tersedia !== false,
    active: payload.active !== false,
    urutan: payload.urutan || meta.urutan
  };

  writeMenuItem_(sh, headers, rowIndex, item, true);
  formatMenuSheet_(sh);
  SpreadsheetApp.flush();

  return {
    ok: true,
    message: "Item " + item.nama + " berhasil ditambahkan.",
    kode,
    item: readMenuItem_(sh, headers, rowIndex)
  };
}

function updateMenuItemInternal_(payload) {
  const ss = getSpreadsheet_();
  const sh = ensureMenuSheet_(ss, false);
  const headers = getHeaderMap_(sh);
  const rowIndex = findMenuRowByCode_(sh, headers, payload.kode);

  if (rowIndex < 0) {
    return error_("Menu dengan kode " + payload.kode + " tidak ditemukan.");
  }

  writeMenuItem_(sh, headers, rowIndex, payload, false);
  formatMenuSheet_(sh);
  SpreadsheetApp.flush();

  return {
    ok: true,
    message: "Item " + payload.nama + " berhasil diperbarui.",
    kode: payload.kode,
    item: readMenuItem_(sh, headers, rowIndex)
  };
}

function normalizeMenuPayload_(params, options) {
  const requireCode = options && options.requireCode === true;
  const hasDefaultAvailable = options && options.defaultAvailable !== undefined;
  const hasDefaultActive = options && options.defaultActive !== undefined;

  const payload = {
    kode: cleanText_(firstValue_(params.kode, params.KODE)).toUpperCase(),
    kategori: cleanText_(firstValue_(params.kategori, params.KATEGORI)),
    nama: cleanText_(firstValue_(params.nama, params.namaMenu, params.NAMA_MENU)),
    deskripsi: cleanText_(firstValue_(params.deskripsi, params.DESKRIPSI)),
    harga: parseHarga_(firstValue_(params.harga, params.hargaOnline, params.HARGA_ONLINE)),
    foto: cleanText_(firstValue_(params.foto, params.fotoUrl, params.FOTO)),
    tersedia: hasParam_(params, "tersedia") ? toBoolean_(params.tersedia, true) : undefined,
    active: hasParam_(params, "active") ? toBoolean_(params.active, true) : undefined,
    urutan: hasParam_(params, "urutan") ? Number(params.urutan) || 0 : undefined
  };

  if (hasDefaultAvailable && payload.tersedia === undefined) {
    payload.tersedia = options.defaultAvailable;
  }

  if (hasDefaultActive && payload.active === undefined) {
    payload.active = options.defaultActive;
  }

  if (requireCode && !payload.kode) throw new Error("Kode menu wajib diisi.");
  if (!payload.nama) throw new Error("Nama menu wajib diisi.");
  if (!payload.kategori) throw new Error("Kategori wajib diisi.");
  if (payload.harga <= 0) throw new Error("Harga harus lebih dari 0.");

  return payload;
}

function writeMenuItem_(sh, headers, rowIndex, item, isNew) {
  if (isNew) setCell_(sh, headers, rowIndex, "KODE", item.kode);

  setCell_(sh, headers, rowIndex, "KATEGORI", item.kategori);
  setCell_(sh, headers, rowIndex, "NAMA_MENU", item.nama);
  setCell_(sh, headers, rowIndex, "DESKRIPSI", item.deskripsi || "");
  setCell_(sh, headers, rowIndex, "HARGA_ONLINE", Number(item.harga) || 0);

  if (isNew || cleanText_(item.foto)) {
    setCell_(sh, headers, rowIndex, "FOTO", cleanText_(item.foto) || CONFIG.DEFAULT_IMAGE);
  }

  if (isNew || item.tersedia !== undefined) {
    setCell_(sh, headers, rowIndex, "TERSEDIA", item.tersedia !== false);
  }

  if (isNew || item.active !== undefined) {
    setCell_(sh, headers, rowIndex, "ACTIVE", item.active !== false);
  }

  if (isNew || item.urutan !== undefined) {
    setCell_(sh, headers, rowIndex, "URUTAN", Number(item.urutan) || 9999);
  }

  setCell_(sh, headers, rowIndex, "UPDATED_AT", new Date());
}

function readMenuItem_(sh, headers, rowIndex) {
  const row = sh.getRange(rowIndex, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  return menuItemFromRow_(row, headers);
}

function menuItemFromRow_(row, headers) {
  const kategori = cell_(row, headers, "KATEGORI") || "Lainnya";
  const harga = parseHarga_(cellRaw_(row, headers, "HARGA_ONLINE"));
  const foto = cell_(row, headers, "FOTO") || CONFIG.DEFAULT_IMAGE;
  const updatedAt = cellRaw_(row, headers, "UPDATED_AT");

  return {
    kode: cell_(row, headers, "KODE"),
    kategori,
    nama: cell_(row, headers, "NAMA_MENU"),
    deskripsi: cell_(row, headers, "DESKRIPSI"),
    harga,
    hargaText: formatRupiah_(harga),
    foto,
    tersedia: toBoolean_(cellRaw_(row, headers, "TERSEDIA"), false),
    active: toBoolean_(cellRaw_(row, headers, "ACTIVE"), true),
    urutan: Number(cellRaw_(row, headers, "URUTAN")) || 9999,
    updatedAt: toIsoText_(updatedAt)
  };
}

function saveMenuPhoto_(params, menuName) {
  const base64 = cleanText_(params.fotoBase64).replace(/^data:[^,]+,/, "");
  if (!base64) return "";

  const mime = cleanText_(params.fotoMime || "image/jpeg").split(";")[0] || "image/jpeg";
  if (mime.indexOf("image/") !== 0) {
    throw new Error("File foto harus berupa gambar.");
  }

  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > CONFIG.MAX_PHOTO_BYTES) {
    throw new Error("Ukuran foto maksimal 5 MB.");
  }

  const folder = getOrCreatePhotoFolder_();
  const safeName = buildSafeFileName_(params.fotoName, menuName, mime);
  const blob = Utilities.newBlob(bytes, mime, safeName);
  const file = folder.createFile(blob);

  safeSetAnyoneWithLink_(file);

  return "https://drive.google.com/uc?export=view&id=" + file.getId();
}

function getOrCreatePhotoFolder_() {
  const folderId = cleanText_(getSetting_("PHOTO_FOLDER_ID"));

  if (folderId) {
    return DriveApp.getFolderById(folderId);
  }

  const folderName = cleanText_(getSetting_("PHOTO_FOLDER_NAME")) || CONFIG.PHOTO_FOLDER_NAME;
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();

  const folder = DriveApp.createFolder(folderName);
  safeSetAnyoneWithLink_(folder);
  return folder;
}

function safeSetAnyoneWithLink_(driveItem) {
  try {
    driveItem.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return true;
  } catch (err) {
    Logger.log("APJ: setSharing dilewati: " + getErrorMessage_(err));
    return false;
  }
}

function buildSafeFileName_(originalName, menuName, mime) {
  const extensionByMime = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif"
  };

  const rawName = cleanText_(originalName) || cleanText_(menuName) || "menu-apj";
  const hasExtension = /\.[a-zA-Z0-9]{2,5}$/.test(rawName);
  const extension = hasExtension ? "" : (extensionByMime[mime] || ".jpg");
  const safeName = rawName
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "menu-apj";

  return "APJ_" + new Date().getTime() + "_" + safeName + extension;
}

function requirePin_(params) {
  const pin = cleanText_(params && params.pin);
  const expected = cleanText_(getSetting_("ADMIN_PIN"));

  if (!pin || pin !== expected) {
    return error_("PIN admin salah atau belum diisi.");
  }

  return null;
}

function ensureMenuSheet_(ss, seedDefaults) {
  const sh = getOrCreateSheet_(ss, getSetting_("SHEET_MENU"));
  ensureHeaders_(sh, CONFIG.MENU_HEADERS);

  if (seedDefaults && sh.getLastRow() < 2) {
    const rows = getDefaultMenuRows_();
    sh.getRange(2, 1, rows.length, CONFIG.MENU_HEADERS.length).setValues(rows);
  }

  return sh;
}

function ensureWebsiteLinkRows_() {
  const ss = getSpreadsheet_();
  const sh = getOrCreateSheet_(ss, getSetting_("SHEET_LINK"));

  ensureHeaders_(sh, CONFIG.LINK_HEADERS);

  const headers = getHeaderMap_(sh);
  getDefaultLinkRows_().forEach(function(row) {
    upsertLinkRow_(sh, headers, row, true);
  });

  formatLinkSheet_(sh);
}

function upsertLinkRow_(sh, headers, row, preserveExistingUrl) {
  const key = String(row[0] || "").trim();
  const rowIndex = findLinkRowByKey_(sh, headers, key);

  if (rowIndex < 0) {
    const nextRow = sh.getLastRow() + 1;
    writeLinkRow_(sh, headers, nextRow, row);
    return;
  }

  const currentUrl = cleanText_(sh.getRange(rowIndex, headers["URL"]).getValue());
  const nextUrl = preserveExistingUrl && currentUrl ? currentUrl : row[2];

  writeLinkRow_(sh, headers, rowIndex, [
    row[0],
    row[1],
    nextUrl,
    row[3],
    row[4],
    new Date()
  ]);
}

function writeLinkRow_(sh, headers, rowIndex, row) {
  setCell_(sh, headers, rowIndex, "KEY", row[0]);
  setCell_(sh, headers, rowIndex, "LABEL", row[1]);
  setCell_(sh, headers, rowIndex, "URL", row[2]);
  setCell_(sh, headers, rowIndex, "ACTIVE", row[3]);
  setCell_(sh, headers, rowIndex, "KETERANGAN", row[4]);
  setCell_(sh, headers, rowIndex, "UPDATED_AT", row[5] || new Date());
}

function getDefaultLinkRows_() {
  const now = new Date();

  return [
    ["outlet", "Lokasi Outlet", "#outlet", true, "Tombol menuju section outlet di website.", now],
    ["menu", "Lihat Menu", "menu.html", true, "Tombol menuju halaman menu online website.", now],
    [
      "checkout_online",
      "Checkout Online",
      "https://wa.me/6280000000000?text=Halo%20Admin%20APJ%2C%20saya%20mau%20pesan%20dari%20website.",
      true,
      "Link WhatsApp untuk checkout pesanan dari halaman menu.",
      now
    ],
    [
      "whatsapp",
      "WhatsApp",
      "https://wa.me/6280000000000?text=Halo%20APJ%2C%20saya%20mau%20pesan.",
      true,
      "Link WhatsApp utama.",
      now
    ],
    [
      "gofood",
      "GoFood",
      "https://wa.me/6280000000000?text=Halo%20APJ%2C%20saya%20mau%20tanya%20pesanan%20GoFood.",
      true,
      "Ganti dengan link GoFood resmi jika tersedia.",
      now
    ],
    [
      "shopeefood",
      "ShopeeFood",
      "https://wa.me/6280000000000?text=Halo%20APJ%2C%20saya%20mau%20tanya%20pesanan%20ShopeeFood.",
      true,
      "Ganti dengan link ShopeeFood resmi jika tersedia.",
      now
    ],
    [
      "grabfood",
      "GrabFood",
      "https://wa.me/6280000000000?text=Halo%20APJ%2C%20saya%20mau%20tanya%20pesanan%20GrabFood.",
      true,
      "Ganti dengan link GrabFood resmi jika tersedia.",
      now
    ],
    [
      "floating_whatsapp",
      "WhatsApp",
      "https://wa.me/6280000000000?text=Halo%20APJ%2C%20saya%20mau%20pesan.",
      true,
      "Link tombol WhatsApp mengambang kanan bawah.",
      now
    ]
  ];
}

function getDefaultMenuRows_() {
  const now = new Date();

  return [
    [
      "MNU001",
      "Paket Nasi",
      "Nasi Rendang Daging",
      "Nasi hangat, rendang daging, sayur, sambal, dan kuah khas Padang.",
      25000,
      CONFIG.DEFAULT_IMAGE,
      true,
      true,
      1,
      now
    ],
    [
      "MNU002",
      "Paket Nasi",
      "Nasi Ayam Goreng",
      "Ayam goreng berbumbu, nasi, sayur, sambal, dan kuah pilihan.",
      18000,
      CONFIG.DEFAULT_IMAGE,
      true,
      true,
      2,
      now
    ],
    [
      "MNU003",
      "Paket Nasi",
      "Nasi Gulai Kikil",
      "Kikil empuk dengan kuah gulai gurih untuk santapan yang lebih mantap.",
      25000,
      CONFIG.DEFAULT_IMAGE,
      true,
      true,
      3,
      now
    ],
    [
      "MNU004",
      "Lauk",
      "Perkedel Kentang",
      "Tambahan sederhana yang kecil-kecil tapi sering dicari pelanggan.",
      5000,
      CONFIG.DEFAULT_IMAGE,
      true,
      true,
      4,
      now
    ],
    [
      "MNU005",
      "Minuman",
      "Es Teh",
      "Minuman segar pendamping makan.",
      5000,
      CONFIG.DEFAULT_IMAGE,
      true,
      true,
      5,
      now
    ],
    [
      "MNU006",
      "Nasi Kotak",
      "Nasi Kotak APJ",
      "Paket praktis untuk acara kantor, keluarga, pengajian, dan rombongan.",
      25000,
      CONFIG.DEFAULT_IMAGE,
      true,
      true,
      6,
      now
    ]
  ];
}

function getSpreadsheet_() {
  const spreadsheetId = cleanText_(getSetting_("SPREADSHEET_ID"));
  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID belum diisi di CONFIG atau Script Properties.");
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

function getSetting_(key) {
  const fallback = CONFIG[key];
  const propKey = "APJ_" + key;

  try {
    const value = PropertiesService.getScriptProperties().getProperty(propKey);
    if (cleanText_(value)) return cleanText_(value);
  } catch (err) {
    Logger.log("APJ: Script Properties tidak dapat dibaca: " + getErrorMessage_(err));
  }

  return fallback;
}

function getOrCreateSheet_(ss, sheetName) {
  const name = cleanText_(sheetName);
  if (!name) throw new Error("Nama sheet belum diisi.");

  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function ensureHeaders_(sh, requiredHeaders) {
  const lastCol = Math.max(sh.getLastColumn(), requiredHeaders.length, 1);
  const current = sh.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function(value) {
      return cleanText_(value).toUpperCase();
    });

  const hasHeader = current.some(function(value) {
    return Boolean(value);
  });

  if (!hasHeader) {
    sh.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return;
  }

  requiredHeaders.forEach(function(header) {
    const key = String(header).toUpperCase();
    if (current.indexOf(key) >= 0) return;

    const col = sh.getLastColumn() + 1;
    sh.getRange(1, col).setValue(header);
    current.push(key);
  });
}

function formatLinkSheet_(sh) {
  const headers = getHeaderMap_(sh);
  const rowCount = Math.max(sh.getLastRow() - 1, 0);
  const lastCol = Math.max(sh.getLastColumn(), CONFIG.LINK_HEADERS.length, 1);

  trySheet_("format header LINK_APJ", function() {
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, lastCol)
      .setFontWeight("bold")
      .setBackground("#5e1411")
      .setFontColor("#ffffff");
  });

  trySheet_("checkbox ACTIVE LINK_APJ", function() {
    if (rowCount > 0 && headers["ACTIVE"]) {
      sh.getRange(2, headers["ACTIVE"], rowCount, 1).insertCheckboxes();
    }
  });

  trySheet_("lebar kolom LINK_APJ", function() {
    sh.autoResizeColumns(1, lastCol);
    if (headers["KEY"]) sh.setColumnWidth(headers["KEY"], 160);
    if (headers["LABEL"]) sh.setColumnWidth(headers["LABEL"], 180);
    if (headers["URL"]) sh.setColumnWidth(headers["URL"], 560);
    if (headers["KETERANGAN"]) sh.setColumnWidth(headers["KETERANGAN"], 420);
    if (headers["UPDATED_AT"]) sh.setColumnWidth(headers["UPDATED_AT"], 180);
  });
}

function formatMenuSheet_(sh) {
  const headers = getHeaderMap_(sh);
  const lastRow = Math.max(sh.getLastRow(), 1);
  const lastCol = Math.max(sh.getLastColumn(), CONFIG.MENU_HEADERS.length, 1);

  trySheet_("format header MENU_APJ", function() {
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, lastCol)
      .setFontWeight("bold")
      .setBackground("#5e1411")
      .setFontColor("#ffffff");
  });

  trySheet_("checkbox MENU_APJ", function() {
    if (lastRow > 1 && headers["TERSEDIA"]) {
      sh.getRange(2, headers["TERSEDIA"], lastRow - 1, 1).insertCheckboxes();
    }
    if (lastRow > 1 && headers["ACTIVE"]) {
      sh.getRange(2, headers["ACTIVE"], lastRow - 1, 1).insertCheckboxes();
    }
  });

  trySheet_("lebar kolom MENU_APJ", function() {
    sh.autoResizeColumns(1, lastCol);
    if (headers["KODE"]) sh.setColumnWidth(headers["KODE"], 110);
    if (headers["KATEGORI"]) sh.setColumnWidth(headers["KATEGORI"], 150);
    if (headers["NAMA_MENU"]) sh.setColumnWidth(headers["NAMA_MENU"], 240);
    if (headers["DESKRIPSI"]) sh.setColumnWidth(headers["DESKRIPSI"], 460);
    if (headers["FOTO"]) sh.setColumnWidth(headers["FOTO"], 320);
    if (headers["UPDATED_AT"]) sh.setColumnWidth(headers["UPDATED_AT"], 190);
  });
}

function getHeaderMap_(sh) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const values = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  return getHeaderMapFromValues_(values);
}

function getHeaderMapFromValues_(values) {
  const map = {};

  values.forEach(function(value, index) {
    const key = cleanText_(value).toUpperCase();
    if (key) map[key] = index + 1;
  });

  return map;
}

function findMissingHeaders_(headers, requiredHeaders) {
  return requiredHeaders.filter(function(header) {
    return !headers[String(header).toUpperCase()];
  });
}

function getNextMenuMeta_(sh, headers) {
  const lastRow = sh.getLastRow();
  let nextNumber = 1;
  let nextOrder = 1;

  if (lastRow > 1) {
    const values = sh.getRange(2, 1, lastRow - 1, Math.max(sh.getLastColumn(), 1)).getValues();

    values.forEach(function(row) {
      const code = cell_(row, headers, "KODE").toUpperCase();
      const match = code.match(/^MNU(\d+)$/);
      if (match) nextNumber = Math.max(nextNumber, Number(match[1]) + 1);

      const order = Number(cellRaw_(row, headers, "URUTAN")) || 0;
      if (order >= nextOrder) nextOrder = order + 1;
    });
  }

  return {
    kode: "MNU" + String(nextNumber).padStart(3, "0"),
    urutan: nextOrder
  };
}

function findMenuRowByCode_(sh, headers, kode) {
  const target = cleanText_(kode).toUpperCase();
  if (!target || !headers["KODE"]) return -1;

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;

  const values = sh.getRange(2, headers["KODE"], lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (cleanText_(values[i][0]).toUpperCase() === target) {
      return i + 2;
    }
  }

  return -1;
}

function findLinkRowByKey_(sh, headers, key) {
  const target = cleanText_(key).toLowerCase();
  if (!target || !headers["KEY"]) return -1;

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;

  const values = sh.getRange(2, headers["KEY"], lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (cleanText_(values[i][0]).toLowerCase() === target) {
      return i + 2;
    }
  }

  return -1;
}

function setCell_(sh, headers, rowIndex, header, value) {
  const col = headers[String(header).toUpperCase()];
  if (!col) return;
  sh.getRange(rowIndex, col).setValue(value);
}

function cell_(row, headers, header) {
  return cleanText_(cellRaw_(row, headers, header));
}

function cellRaw_(row, headers, header) {
  const col = headers[String(header).toUpperCase()];
  if (!col) return "";
  return row[col - 1];
}

function parseHarga_(value) {
  if (typeof value === "number") return value || 0;

  let text = cleanText_(value);
  if (!text) return 0;

  text = text.replace(/[^0-9,.-]/g, "");

  if (text.indexOf(",") >= 0 && text.lastIndexOf(",") > text.lastIndexOf(".")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    text = text.replace(/\./g, "").replace(/,/g, "");
  }

  return Number(text) || 0;
}

function formatRupiah_(value) {
  const number = parseHarga_(value);
  return "Rp " + number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function toBoolean_(value, fallback) {
  if (value === true) return true;
  if (value === false) return false;

  const text = cleanText_(value).toLowerCase();
  if (!text) return fallback;

  if (["true", "1", "yes", "ya", "y", "aktif", "active", "tersedia"].indexOf(text) >= 0) {
    return true;
  }

  if (["false", "0", "no", "tidak", "n", "nonaktif", "inactive", "habis"].indexOf(text) >= 0) {
    return false;
  }

  return fallback;
}

function cleanText_(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function firstValue_() {
  for (let i = 0; i < arguments.length; i += 1) {
    if (arguments[i] !== undefined && arguments[i] !== null && cleanText_(arguments[i]) !== "") {
      return arguments[i];
    }
  }
  return "";
}

function hasParam_(params, key) {
  return Object.prototype.hasOwnProperty.call(params || {}, key);
}

function toIsoText_(value) {
  if (value instanceof Date) return value.toISOString();
  return cleanText_(value);
}

function normalizeAction_(value, fallback) {
  return cleanText_(value || fallback).toLowerCase();
}

function sanitizeCallback_(value) {
  return cleanText_(value).replace(/[^a-zA-Z0-9_.$]/g, "");
}

function getParams_(e) {
  const params = Object.assign({}, e && e.parameter ? e.parameter : {});

  if (e && e.postData && e.postData.contents) {
    const type = cleanText_(e.postData.type).toLowerCase();
    if (type.indexOf("application/json") >= 0) {
      try {
        Object.assign(params, JSON.parse(e.postData.contents));
      } catch (err) {
        Logger.log("APJ: Body JSON tidak valid: " + getErrorMessage_(err));
      }
    }
  }

  return params;
}

function output_(result, callback) {
  const payload = result || error_("Respons kosong.");
  const json = JSON.stringify(payload);

  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function postMessageOutput_(result, requestId) {
  const payload = result || error_("Respons kosong.");
  payload.source = "APJ_ADMIN_UPLOAD";
  payload.requestId = cleanText_(requestId);

  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const html = "<!doctype html><html><body><script>" +
    "var payload=" + json + ";" +
    "function send(){" +
      "try{window.parent.postMessage(payload,'*');}catch(e){}" +
      "try{window.top.postMessage(payload,'*');}catch(e){}" +
      "try{window.parent.postMessage(JSON.stringify(payload),'*');}catch(e){}" +
    "}" +
    "send();" +
    "var n=0;" +
    "var t=setInterval(function(){send();n++;if(n>12)clearInterval(t);},400);" +
    "</script></body></html>";

  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function withWriteLock_(operation) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    return operation();
  } finally {
    lock.releaseLock();
  }
}

function trySheet_(label, operation) {
  try {
    return operation();
  } catch (err) {
    Logger.log("APJ: " + label + " dilewati: " + getErrorMessage_(err));
    return null;
  }
}

function error_(message) {
  return {
    ok: false,
    message: message || "Terjadi kesalahan."
  };
}

function getErrorMessage_(err) {
  return err && err.message ? err.message : String(err || "");
}

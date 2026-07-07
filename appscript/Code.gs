const CONFIG = {
  SPREADSHEET_ID: "1g0aYmdYNYUeJ4xMMjEiW5ej2K0TUFGU5p8d0wCfX3jk",
  SHEET_LINK: "LINK_APJ",
  SHEET_MENU: "MENU_APJ",
  PHOTO_FOLDER_ID: "1iUwa9K0jVP3HdgiQLsb46c03Lsdrr_T5",
  PHOTO_FOLDER_NAME: "APJ_MENU_PHOTOS",
  // Ganti PIN ini sebelum dipakai operasional.
  ADMIN_PIN: "123456"
};

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action ? String(params.action).trim().toLowerCase() : "links";
  const callback = params.callback ? String(params.callback).trim() : "";

  let result;

  try {
    if (action === "setup") {
      result = setupLinkApj();
    } else if (action === "setup_menu") {
      result = setupMenuApj();
    } else if (action === "menu") {
      result = getMenuApjData_(false);
    } else if (action === "admin_menu") {
      result = requirePin_(params) || getMenuApjData_(true);
    } else if (action === "update_availability") {
      result = updateMenuAvailability_(params);
    } else if (action === "add_menu_item") {
      result = addMenuItem_(params);
    } else if (action === "update_menu_item") {
      result = updateMenuItem_(params);
    } else {
      // Realtime di server: setiap request baca langsung dari Google Sheet.
      // Cache link hanya dilakukan di browser selama 2 menit oleh main.js.
      result = getLinkApjData_();
    }
  } catch (err) {
    result = {
      ok: false,
      message: err && err.message ? err.message : String(err)
    };
  }

  if (callback) {
    const safeCallback = callback.replace(/[^a-zA-Z0-9_.$]/g, "");
    return ContentService
      .createTextOutput(safeCallback + "(" + JSON.stringify(result) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}


function doPost(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action ? String(params.action).trim().toLowerCase() : "";
  let result;

  try {
    if (action === "add_menu_item_upload") {
      result = addMenuItemWithUpload_(params);
    } else if (action === "update_menu_item_upload") {
      result = updateMenuItemWithUpload_(params);
    } else {
      result = {
        ok: false,
        message: "Action POST tidak dikenali."
      };
    }
  } catch (err) {
    result = {
      ok: false,
      message: err && err.message ? err.message : String(err)
    };
  }

  return postMessageOutput_(result, params.requestId || "");
}

function postMessageOutput_(result, requestId) {
  result = result || { ok: false, message: "Respons kosong." };
  result.source = "APJ_ADMIN_UPLOAD";
  result.requestId = String(requestId || "");
  const json = JSON.stringify(result).replace(/</g, "\\u003c");
  const html = "<!doctype html><html><body><script>" +
    "var payload=" + json + ";" +
    "function send(){" +
      "try{window.parent.postMessage(payload,'*');}catch(e){}" +
      "try{window.top.postMessage(payload,'*');}catch(e){}" +
      "try{window.parent.postMessage(JSON.stringify(payload),'*');}catch(e){}" +
    "}" +
    "send();var n=0;var t=setInterval(function(){send();n++;if(n>12)clearInterval(t);},400);" +
    "</script></body></html>";
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function requirePin_(params) {
  const pin = params && params.pin ? String(params.pin).trim() : "";
  if (pin !== String(CONFIG.ADMIN_PIN)) {
    return {
      ok: false,
      message: "PIN admin salah atau belum diisi."
    };
  }
  return null;
}

function setupLinkApj() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sh = ss.getSheetByName(CONFIG.SHEET_LINK);

  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_LINK);

  sh.clear();

  const headers = ["KEY", "LABEL", "URL", "ACTIVE", "KETERANGAN", "UPDATED_AT"];
  const now = new Date();
  const rows = [
    ["outlet", "Lokasi Outlet", "#outlet", true, "Tombol menuju section outlet di website", now],
    ["menu", "Lihat Menu", "menu.html", true, "Tombol menuju halaman menu online website", now],
    ["checkout_online", "Checkout Online", "https://wa.me/6280000000000?text=Halo%20Admin%20APJ%2C%20saya%20mau%20pesan%20dari%20website.", true, "Link WhatsApp untuk checkout pesanan dari menu website", now],
    ["whatsapp", "WhatsApp", "https://wa.me/6280000000000?text=Halo%20APJ%2C%20saya%20mau%20pesan.", true, "Link pemesanan WhatsApp utama", now],
    ["gofood", "GoFood", "https://wa.me/6280000000000?text=Halo%20APJ%2C%20saya%20mau%20tanya%20pesanan%20GoFood.", true, "Ganti dengan link GoFood asli jika sudah ada", now],
    ["shopeefood", "ShopeeFood", "https://wa.me/6280000000000?text=Halo%20APJ%2C%20saya%20mau%20tanya%20pesanan%20ShopeeFood.", true, "Ganti dengan link ShopeeFood asli jika sudah ada", now],
    ["grabfood", "GrabFood", "https://wa.me/6280000000000?text=Halo%20APJ%2C%20saya%20mau%20tanya%20pesanan%20GrabFood.", true, "Ganti dengan link GrabFood asli jika sudah ada", now],
    ["floating_whatsapp", "WhatsApp", "https://wa.me/6280000000000?text=Halo%20APJ%2C%20saya%20mau%20pesan.", true, "Link tombol WhatsApp mengambang kanan bawah", now]
  ];

  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);

  formatLinkSheet_(sh, rows.length);

  return {
    ok: true,
    message: "Sheet LINK_APJ berhasil dibuat / diperbarui.",
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    sheetName: CONFIG.SHEET_LINK
  };
}

function setupMenuApj() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sh = ss.getSheetByName(CONFIG.SHEET_MENU);
  const isNew = !sh;

  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_MENU);

  const headers = ["KODE", "KATEGORI", "NAMA_MENU", "DESKRIPSI", "HARGA_ONLINE", "FOTO", "TERSEDIA", "ACTIVE", "URUTAN", "UPDATED_AT"];
  const now = new Date();

  if (isNew || sh.getLastRow() === 0) {
    const rows = [
      ["MNU001", "Paket Nasi", "Nasi Rendang Daging", "Nasi hangat, rendang daging, sayur, sambal, dan kuah khas Padang.", 25000, "assets/img/signature-dish.jpg", true, true, 1, now],
      ["MNU002", "Paket Nasi", "Nasi Ayam Goreng", "Ayam goreng berbumbu, nasi, sayur, sambal, dan kuah pilihan.", 18000, "assets/img/signature-dish.jpg", true, true, 2, now],
      ["MNU003", "Paket Nasi", "Nasi Gulai Kikil", "Kikil empuk dengan kuah gulai gurih untuk santapan yang lebih mantap.", 25000, "assets/img/signature-dish.jpg", true, true, 3, now],
      ["MNU004", "Lauk", "Perkedel Kentang", "Tambahan sederhana yang kecil-kecil tapi sering dicari pelanggan.", 5000, "assets/img/signature-dish.jpg", true, true, 4, now],
      ["MNU005", "Minuman", "Es Teh", "Minuman segar pendamping makan.", 5000, "assets/img/signature-dish.jpg", true, true, 5, now],
      ["MNU006", "Nasi Kotak", "Nasi Kotak APJ", "Paket praktis untuk acara kantor, keluarga, pengajian, dan rombongan.", 25000, "assets/img/signature-dish.jpg", true, true, 6, now]
    ];

    sh.clear();
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  } else {
    ensureHeaders_(sh, headers);
  }

  formatMenuSheet_(sh);
  ensureWebsiteLinkRows_();

  return {
    ok: true,
    message: "Sheet MENU_APJ siap dipakai. Link menu dan checkout_online juga sudah dicek.",
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    sheetName: CONFIG.SHEET_MENU,
    adminPinDefault: CONFIG.ADMIN_PIN
  };
}

function ensureHeaders_(sh, headers) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const current = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v).trim().toUpperCase()).filter(Boolean);

  if (current.length === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  headers.forEach(header => {
    if (current.indexOf(header) < 0) {
      const col = sh.getLastColumn() + 1;
      sh.getRange(1, col).setValue(header);
      current.push(header);
    }
  });
}

function formatLinkSheet_(sh, rowCount) {
  sh.setFrozenRows(1);
  sh.getRange("A1:F1")
    .setFontWeight("bold")
    .setBackground("#5e1411")
    .setFontColor("#ffffff");
  if (rowCount > 0) sh.getRange(2, 4, rowCount, 1).insertCheckboxes();
  sh.autoResizeColumns(1, 6);
  sh.setColumnWidth(1, 160);
  sh.setColumnWidth(2, 180);
  sh.setColumnWidth(3, 560);
  sh.setColumnWidth(5, 380);
  sh.setColumnWidth(6, 180);
  SpreadsheetApp.flush();
}

function formatMenuSheet_(sh) {
  const headers = getHeaderMap_(sh);
  const lastRow = Math.max(sh.getLastRow(), 1);
  const lastCol = sh.getLastColumn();

  // Jangan biarkan proses simpan menu gagal hanya karena format tampilan Google Sheet.
  // Error yang pernah muncul: "Anda tidak dapat menetapkan format nomor sel...".
  // Itu berasal dari setNumberFormat pada Google Sheet Table, bukan dari upload foto.
  try {
    sh.setFrozenRows(1);
  } catch (err) {
    Logger.log("APJ: setFrozenRows dilewati: " + getErrorMessage_(err));
  }

  try {
    sh.getRange(1, 1, 1, lastCol)
      .setFontWeight("bold")
      .setBackground("#5e1411")
      .setFontColor("#ffffff");
  } catch (err) {
    Logger.log("APJ: format header dilewati: " + getErrorMessage_(err));
  }

  if (lastRow > 1) {
    try {
      if (headers["TERSEDIA"]) sh.getRange(2, headers["TERSEDIA"], lastRow - 1, 1).insertCheckboxes();
    } catch (err) {
      Logger.log("APJ: checkbox TERSEDIA dilewati: " + getErrorMessage_(err));
    }

    try {
      if (headers["ACTIVE"]) sh.getRange(2, headers["ACTIVE"], lastRow - 1, 1).insertCheckboxes();
    } catch (err) {
      Logger.log("APJ: checkbox ACTIVE dilewati: " + getErrorMessage_(err));
    }

    // Sengaja tidak memakai setNumberFormat saat simpan/edit dari web.
    // Pada Google Sheets Table, setNumberFormat bisa ditolak dan membuat simpan gagal,
    // padahal data menu dan foto sebenarnya sudah berhasil diproses.
  }

  try {
    sh.autoResizeColumns(1, lastCol);
  } catch (err) {
    Logger.log("APJ: autoResizeColumns dilewati: " + getErrorMessage_(err));
  }

  try {
    if (headers["KODE"]) sh.setColumnWidth(headers["KODE"], 110);
    if (headers["KATEGORI"]) sh.setColumnWidth(headers["KATEGORI"], 150);
    if (headers["NAMA_MENU"]) sh.setColumnWidth(headers["NAMA_MENU"], 220);
    if (headers["DESKRIPSI"]) sh.setColumnWidth(headers["DESKRIPSI"], 420);
    if (headers["FOTO"]) sh.setColumnWidth(headers["FOTO"], 260);
    if (headers["UPDATED_AT"]) sh.setColumnWidth(headers["UPDATED_AT"], 180);
  } catch (err) {
    Logger.log("APJ: setColumnWidth dilewati: " + getErrorMessage_(err));
  }

  try {
    SpreadsheetApp.flush();
  } catch (err) {
    Logger.log("APJ: flush format dilewati: " + getErrorMessage_(err));
  }
}

function ensureWebsiteLinkRows_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sh = ss.getSheetByName(CONFIG.SHEET_LINK);
  if (!sh) {
    setupLinkApj();
    return;
  }

  const requiredHeaders = ["KEY", "LABEL", "URL", "ACTIVE", "KETERANGAN", "UPDATED_AT"];
  ensureHeaders_(sh, requiredHeaders);
  const headers = getHeaderMap_(sh);
  const values = sh.getDataRange().getValues();
  const now = new Date();

  upsertLinkRow_(sh, values, headers, "menu", "Lihat Menu", "menu.html", true, "Tombol menuju halaman menu online website", now, true);
  upsertLinkRow_(sh, values, headers, "checkout_online", "Checkout Online", "https://wa.me/6280000000000?text=Halo%20Admin%20APJ%2C%20saya%20mau%20pesan%20dari%20website.", true, "Link WhatsApp untuk checkout pesanan dari menu website", now, false);

  formatLinkSheet_(sh, Math.max(sh.getLastRow() - 1, 0));
}

function upsertLinkRow_(sh, values, headers, key, label, url, active, note, now, updateUrlIfOld) {
  const keyCol = headers["KEY"];
  let rowIndex = -1;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][keyCol - 1] || "").trim().toLowerCase() === key.toLowerCase()) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex < 0) {
    rowIndex = sh.getLastRow() + 1;
    sh.getRange(rowIndex, headers["KEY"]).setValue(key);
    sh.getRange(rowIndex, headers["LABEL"]).setValue(label);
    sh.getRange(rowIndex, headers["URL"]).setValue(url);
    sh.getRange(rowIndex, headers["ACTIVE"]).setValue(active);
    sh.getRange(rowIndex, headers["KETERANGAN"]).setValue(note);
    sh.getRange(rowIndex, headers["UPDATED_AT"]).setValue(now);
    return;
  }

  const currentUrl = String(sh.getRange(rowIndex, headers["URL"]).getValue() || "").trim();
  sh.getRange(rowIndex, headers["LABEL"]).setValue(label);
  if (updateUrlIfOld && (!currentUrl || currentUrl === "#menu")) {
    sh.getRange(rowIndex, headers["URL"]).setValue(url);
  }
  sh.getRange(rowIndex, headers["ACTIVE"]).setValue(true);
  sh.getRange(rowIndex, headers["KETERANGAN"]).setValue(note);
  sh.getRange(rowIndex, headers["UPDATED_AT"]).setValue(now);
}

function getLinkApjData_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CONFIG.SHEET_LINK);

  if (!sh) {
    return {
      ok: false,
      message: "Sheet LINK_APJ belum ada. Jalankan setupLinkApj() dulu."
    };
  }

  const values = sh.getDataRange().getValues();
  if (values.length < 2) {
    return {
      ok: false,
      message: "Sheet LINK_APJ masih kosong."
    };
  }

  const headers = values[0].map(h => String(h).trim().toUpperCase());
  const keyIndex = headers.indexOf("KEY");
  const labelIndex = headers.indexOf("LABEL");
  const urlIndex = headers.indexOf("URL");
  const activeIndex = headers.indexOf("ACTIVE");
  const updatedAtIndex = headers.indexOf("UPDATED_AT");

  if ([keyIndex, labelIndex, urlIndex, activeIndex].some(i => i < 0)) {
    return {
      ok: false,
      message: "Header wajib tidak lengkap. Pakai KEY, LABEL, URL, ACTIVE."
    };
  }

  const links = {};
  const inactiveKeys = [];

  values.slice(1).forEach(row => {
    const key = String(row[keyIndex] || "").trim();
    const label = String(row[labelIndex] || "").trim();
    const url = String(row[urlIndex] || "").trim();
    const active = row[activeIndex] === true || String(row[activeIndex]).toUpperCase() === "TRUE";
    const updatedAt = updatedAtIndex >= 0 ? row[updatedAtIndex] : "";

    if (!key) return;
    if (!active || !url) {
      inactiveKeys.push(key);
      return;
    }

    links[key] = {
      label: label || key,
      url,
      updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt || "")
    };
  });

  return {
    ok: true,
    source: "APJ_LINK_SHEET",
    cache: "SERVER_REALTIME_BROWSER_CACHE_2_MINUTES",
    links,
    inactiveKeys,
    updatedAt: new Date().toISOString()
  };
}

function getMenuApjData_(includeInactive) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CONFIG.SHEET_MENU);

  if (!sh) {
    return {
      ok: false,
      message: "Sheet MENU_APJ belum ada. Jalankan setupMenuApj() dulu."
    };
  }

  const values = sh.getDataRange().getValues();
  if (values.length < 2) {
    return {
      ok: true,
      items: [],
      categories: [],
      message: "Belum ada data menu."
    };
  }

  const headers = values[0].map(h => String(h).trim().toUpperCase());
  const idx = {
    kode: headers.indexOf("KODE"),
    kategori: headers.indexOf("KATEGORI"),
    nama: headers.indexOf("NAMA_MENU"),
    deskripsi: headers.indexOf("DESKRIPSI"),
    harga: headers.indexOf("HARGA_ONLINE"),
    foto: headers.indexOf("FOTO"),
    tersedia: headers.indexOf("TERSEDIA"),
    active: headers.indexOf("ACTIVE"),
    urutan: headers.indexOf("URUTAN"),
    updatedAt: headers.indexOf("UPDATED_AT")
  };

  if ([idx.kode, idx.kategori, idx.nama, idx.harga, idx.tersedia, idx.active].some(i => i < 0)) {
    return {
      ok: false,
      message: "Header MENU_APJ wajib: KODE, KATEGORI, NAMA_MENU, HARGA_ONLINE, TERSEDIA, ACTIVE."
    };
  }

  const items = [];
  const categoryMap = {};

  values.slice(1).forEach(row => {
    const kode = String(row[idx.kode] || "").trim();
    const kategori = String(row[idx.kategori] || "Lainnya").trim() || "Lainnya";
    const nama = String(row[idx.nama] || "").trim();
    const active = row[idx.active] === true || String(row[idx.active]).toUpperCase() === "TRUE";

    if (!kode || !nama) return;
    if (!includeInactive && !active) return;

    const harga = parseHarga_(row[idx.harga]);
    const tersedia = row[idx.tersedia] === true || String(row[idx.tersedia]).toUpperCase() === "TRUE";
    const foto = idx.foto >= 0 ? String(row[idx.foto] || "").trim() : "";
    const updatedAt = idx.updatedAt >= 0 ? row[idx.updatedAt] : "";
    const urutan = idx.urutan >= 0 ? Number(row[idx.urutan]) || 9999 : 9999;

    categoryMap[kategori] = true;

    items.push({
      kode,
      kategori,
      nama,
      deskripsi: idx.deskripsi >= 0 ? String(row[idx.deskripsi] || "").trim() : "",
      harga,
      hargaText: formatRupiah_(harga),
      foto: foto || "assets/img/signature-dish.jpg",
      tersedia,
      active,
      urutan,
      updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt || "")
    });
  });

  items.sort((a, b) => {
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

  const kode = params.kode ? String(params.kode).trim() : "";
  const tersediaRaw = params.tersedia !== undefined ? String(params.tersedia).trim().toLowerCase() : "";
  const tersedia = ["true", "1", "yes", "ya", "tersedia"].indexOf(tersediaRaw) >= 0;

  if (!kode) {
    return { ok: false, message: "Kode menu wajib diisi." };
  }

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CONFIG.SHEET_MENU);
  if (!sh) {
    return { ok: false, message: "Sheet MENU_APJ belum ada." };
  }

  const headers = getHeaderMap_(sh);
  if (!headers["KODE"] || !headers["TERSEDIA"]) {
    return { ok: false, message: "Header KODE atau TERSEDIA belum ada." };
  }

  const lastRow = sh.getLastRow();
  if (lastRow < 2) {
    return { ok: false, message: "Data menu masih kosong." };
  }

  const codes = sh.getRange(2, headers["KODE"], lastRow - 1, 1).getValues();
  let targetRow = -1;

  for (let i = 0; i < codes.length; i++) {
    if (String(codes[i][0] || "").trim() === kode) {
      targetRow = i + 2;
      break;
    }
  }

  if (targetRow < 0) {
    return { ok: false, message: "Menu dengan kode " + kode + " tidak ditemukan." };
  }

  const now = new Date();
  sh.getRange(targetRow, headers["TERSEDIA"]).setValue(tersedia);
  if (headers["UPDATED_AT"]) sh.getRange(targetRow, headers["UPDATED_AT"]).setValue(now);
  SpreadsheetApp.flush();

  return {
    ok: true,
    message: tersedia ? "Menu ditandai tersedia." : "Menu ditandai habis.",
    kode,
    tersedia,
    updatedAt: now.toISOString()
  };
}

function addMenuItem_(params) {
  const authError = requirePin_(params);
  if (authError) return authError;

  const nama = params.nama ? String(params.nama).trim() : "";
  const kategori = params.kategori ? String(params.kategori).trim() : "";
  const harga = parseHarga_(params.harga);
  const foto = params.foto ? String(params.foto).trim() : "";
  const deskripsi = params.deskripsi ? String(params.deskripsi).trim() : "";

  if (!nama) return { ok: false, message: "Nama menu wajib diisi." };
  if (!kategori) return { ok: false, message: "Kategori wajib diisi." };
  if (harga <= 0) return { ok: false, message: "Harga harus lebih dari 0." };

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CONFIG.SHEET_MENU);
  if (!sh) return { ok: false, message: "Sheet MENU_APJ belum ada." };

  const headers = getHeaderMap_(sh);
  const required = ["KODE", "KATEGORI", "NAMA_MENU", "DESKRIPSI", "HARGA_ONLINE", "FOTO", "TERSEDIA", "ACTIVE", "URUTAN", "UPDATED_AT"];
  for (let i = 0; i < required.length; i++) {
    if (!headers[required[i]]) return { ok: false, message: "Header MENU_APJ belum lengkap. Jalankan setupMenuApj()." };
  }

  const lastRow = sh.getLastRow();
  const now = new Date();
  let nextNumber = 1;
  let nextOrder = 1;

  if (lastRow > 1) {
    const values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
    values.forEach(row => {
      const code = String(row[headers["KODE"] - 1] || "").trim().toUpperCase();
      const match = code.match(/^MNU(\d+)$/);
      if (match) nextNumber = Math.max(nextNumber, Number(match[1]) + 1);
      const order = Number(row[headers["URUTAN"] - 1]) || 0;
      if (order >= nextOrder) nextOrder = order + 1;
    });
  }

  const kode = "MNU" + String(nextNumber).padStart(3, "0");
  const rowIndex = lastRow + 1;

  sh.getRange(rowIndex, headers["KODE"]).setValue(kode);
  sh.getRange(rowIndex, headers["KATEGORI"]).setValue(kategori);
  sh.getRange(rowIndex, headers["NAMA_MENU"]).setValue(nama);
  sh.getRange(rowIndex, headers["DESKRIPSI"]).setValue(deskripsi);
  sh.getRange(rowIndex, headers["HARGA_ONLINE"]).setValue(harga);
  sh.getRange(rowIndex, headers["FOTO"]).setValue(foto || "assets/img/signature-dish.jpg");
  sh.getRange(rowIndex, headers["TERSEDIA"]).setValue(true);
  sh.getRange(rowIndex, headers["ACTIVE"]).setValue(true);
  sh.getRange(rowIndex, headers["URUTAN"]).setValue(nextOrder);
  sh.getRange(rowIndex, headers["UPDATED_AT"]).setValue(now);

  formatMenuSheet_(sh);
  SpreadsheetApp.flush();

  return {
    ok: true,
    message: "Item " + nama + " berhasil ditambahkan.",
    kode,
    item: {
      kode,
      kategori,
      nama,
      deskripsi,
      harga,
      hargaText: formatRupiah_(harga),
      foto: foto || "assets/img/signature-dish.jpg",
      tersedia: true,
      active: true,
      urutan: nextOrder,
      updatedAt: now.toISOString()
    }
  };
}


function updateMenuItem_(params) {
  const authError = requirePin_(params);
  if (authError) return authError;

  const kode = params.kode ? String(params.kode).trim() : "";
  const nama = params.nama ? String(params.nama).trim() : "";
  const kategori = params.kategori ? String(params.kategori).trim() : "";
  const harga = parseHarga_(params.harga);
  const deskripsi = params.deskripsi !== undefined ? String(params.deskripsi).trim() : "";
  const foto = params.foto ? String(params.foto).trim() : "";

  if (!kode) return { ok: false, message: "Kode menu wajib diisi." };
  if (!nama) return { ok: false, message: "Nama menu wajib diisi." };
  if (!kategori) return { ok: false, message: "Kategori wajib diisi." };
  if (harga <= 0) return { ok: false, message: "Harga harus lebih dari 0." };

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CONFIG.SHEET_MENU);
  if (!sh) return { ok: false, message: "Sheet MENU_APJ belum ada." };

  const headers = getHeaderMap_(sh);
  const required = ["KODE", "KATEGORI", "NAMA_MENU", "DESKRIPSI", "HARGA_ONLINE", "FOTO", "UPDATED_AT"];
  for (let i = 0; i < required.length; i++) {
    if (!headers[required[i]]) return { ok: false, message: "Header MENU_APJ belum lengkap. Jalankan setupMenuApj()." };
  }

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: false, message: "Data menu masih kosong." };

  const codes = sh.getRange(2, headers["KODE"], lastRow - 1, 1).getValues();
  let targetRow = -1;
  for (let i = 0; i < codes.length; i++) {
    if (String(codes[i][0] || "").trim() === kode) {
      targetRow = i + 2;
      break;
    }
  }

  if (targetRow < 0) return { ok: false, message: "Menu dengan kode " + kode + " tidak ditemukan." };

  const now = new Date();
  sh.getRange(targetRow, headers["KATEGORI"]).setValue(kategori);
  sh.getRange(targetRow, headers["NAMA_MENU"]).setValue(nama);
  sh.getRange(targetRow, headers["DESKRIPSI"]).setValue(deskripsi);
  sh.getRange(targetRow, headers["HARGA_ONLINE"]).setValue(harga);
  if (foto) sh.getRange(targetRow, headers["FOTO"]).setValue(foto);
  sh.getRange(targetRow, headers["UPDATED_AT"]).setValue(now);

  formatMenuSheet_(sh);
  SpreadsheetApp.flush();

  const currentFoto = String(sh.getRange(targetRow, headers["FOTO"]).getValue() || "").trim() || "assets/img/signature-dish.jpg";
  const tersedia = headers["TERSEDIA"] ? (sh.getRange(targetRow, headers["TERSEDIA"]).getValue() === true || String(sh.getRange(targetRow, headers["TERSEDIA"]).getValue()).toUpperCase() === "TRUE") : true;
  const active = headers["ACTIVE"] ? (sh.getRange(targetRow, headers["ACTIVE"]).getValue() === true || String(sh.getRange(targetRow, headers["ACTIVE"]).getValue()).toUpperCase() === "TRUE") : true;
  const urutan = headers["URUTAN"] ? Number(sh.getRange(targetRow, headers["URUTAN"]).getValue()) || 9999 : 9999;

  return {
    ok: true,
    message: "Item " + nama + " berhasil diperbarui.",
    kode,
    item: {
      kode,
      kategori,
      nama,
      deskripsi,
      harga,
      hargaText: formatRupiah_(harga),
      foto: currentFoto,
      tersedia,
      active,
      urutan,
      updatedAt: now.toISOString()
    }
  };
}


function addMenuItemWithUpload_(params) {
  const authError = requirePin_(params);
  if (authError) return authError;

  let fotoUrl = "";
  if (params.fotoBase64) {
    fotoUrl = saveMenuPhoto_(params);
  }

  const result = addMenuItem_({
    pin: params.pin,
    nama: params.nama,
    kategori: params.kategori,
    harga: params.harga,
    deskripsi: params.deskripsi,
    foto: fotoUrl
  });

  if (result && result.ok && fotoUrl) {
    result.fotoUrl = fotoUrl;
    if (result.item) result.item.foto = fotoUrl;
  }

  return result;
}


function updateMenuItemWithUpload_(params) {
  const authError = requirePin_(params);
  if (authError) return authError;

  let fotoUrl = "";
  if (params.fotoBase64) {
    fotoUrl = saveMenuPhoto_(params);
  }

  const result = updateMenuItem_({
    pin: params.pin,
    kode: params.kode,
    nama: params.nama,
    kategori: params.kategori,
    harga: params.harga,
    deskripsi: params.deskripsi,
    foto: fotoUrl
  });

  if (result && result.ok && fotoUrl) {
    result.fotoUrl = fotoUrl;
    if (result.item) result.item.foto = fotoUrl;
  }

  return result;
}

function saveMenuPhoto_(params) {
  const raw = String(params.fotoBase64 || "").replace(/^data:[^,]+,/, "").trim();
  if (!raw) return "";

  const mime = String(params.fotoMime || "image/jpeg").split(";")[0].trim() || "image/jpeg";
  if (mime.indexOf("image/") !== 0) {
    throw new Error("File foto harus berupa gambar.");
  }

  const safeName = String(params.fotoName || "menu-apj.jpg")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80) || "menu-apj.jpg";

  const bytes = Utilities.base64Decode(raw);
  const blob = Utilities.newBlob(bytes, mime, "APJ_" + new Date().getTime() + "_" + safeName);
  const folder = getOrCreatePhotoFolder_();
  const file = folder.createFile(blob);

  // Jangan gagalkan proses simpan menu hanya karena Google menolak setSharing.
  // Pada beberapa akun/folder, file berhasil ter-upload tetapi setSharing bisa ditolak.
  // Solusinya: folder APJ - FOTO PRODUK cukup dibuat "Anyone with the link - Viewer" sekali dari Drive.
  safeSetAnyoneWithLink_(file);

  return "https://drive.google.com/uc?export=view&id=" + file.getId();
}

function getOrCreatePhotoFolder_() {
  const folderId = String(CONFIG.PHOTO_FOLDER_ID || "").trim();

  if (folderId) {
    // Foto menu APJ disimpan ke folder Drive yang sudah ditentukan.
    // Pastikan akun yang deploy Apps Script punya akses editor ke folder ini.
    return DriveApp.getFolderById(folderId);
  }

  const folderName = CONFIG.PHOTO_FOLDER_NAME || "APJ_MENU_PHOTOS";
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
    Logger.log("APJ: setSharing dilewati karena ditolak Google Drive: " + (err && err.message ? err.message : err));
    return false;
  }
}

function getHeaderMap_(sh) {
  const values = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  const map = {};
  values.forEach((value, index) => {
    const key = String(value || "").trim().toUpperCase();
    if (key) map[key] = index + 1;
  });
  return map;
}

function parseHarga_(value) {
  if (typeof value === "number") return value || 0;

  let text = String(value || "").trim();
  if (!text) return 0;

  text = text.replace(/[^0-9,.-]/g, "");

  // Format Indonesia: Rp25.000 / Rp.25.000 / 25.000 => 25000.
  // Kalau ada koma sebagai desimal, tetap aman.
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

function getErrorMessage_(err) {
  return err && err.message ? err.message : String(err || "");
}

const CONFIG = {
  SPREADSHEET_ID: "1g0aYmdYNYUeJ4xMMjEiW5ej2K0TUFGU5p8d0wCfX3jk",
  SHEET_LINK: "LINK_APJ"
};

function setupLinkApj() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sh = ss.getSheetByName(CONFIG.SHEET_LINK);

  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_LINK);

  sh.clear();

  const headers = ["KEY", "LABEL", "URL", "ACTIVE", "KETERANGAN", "UPDATED_AT"];
  const now = new Date();
  const rows = [
    ["outlet", "Lokasi Outlet", "#outlet", true, "Tombol menuju section outlet di website", now],
    ["menu", "Lihat Menu", "#menu", true, "Tombol menuju section menu di website", now],
    ["whatsapp", "WhatsApp", "https://wa.me/6280000000000?text=Halo%20APJ%2C%20saya%20mau%20pesan.", true, "Link pemesanan WhatsApp utama", now],
    ["gofood", "GoFood", "https://wa.me/6280000000000?text=Halo%20APJ%2C%20saya%20mau%20tanya%20pesanan%20GoFood.", true, "Ganti dengan link GoFood asli jika sudah ada", now],
    ["shopeefood", "ShopeeFood", "https://wa.me/6280000000000?text=Halo%20APJ%2C%20saya%20mau%20tanya%20pesanan%20ShopeeFood.", true, "Ganti dengan link ShopeeFood asli jika sudah ada", now],
    ["grabfood", "GrabFood", "https://wa.me/6280000000000?text=Halo%20APJ%2C%20saya%20mau%20tanya%20pesanan%20GrabFood.", true, "Ganti dengan link GrabFood asli jika sudah ada", now],
    ["floating_whatsapp", "WhatsApp", "https://wa.me/6280000000000?text=Halo%20APJ%2C%20saya%20mau%20pesan.", true, "Link tombol WhatsApp mengambang kanan bawah", now]
  ];

  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);

  sh.setFrozenRows(1);
  sh.getRange("A1:F1")
    .setFontWeight("bold")
    .setBackground("#5e1411")
    .setFontColor("#ffffff");
  sh.getRange(2, 4, rows.length, 1).insertCheckboxes();
  sh.autoResizeColumns(1, headers.length);
  sh.setColumnWidth(1, 150);
  sh.setColumnWidth(2, 180);
  sh.setColumnWidth(3, 520);
  sh.setColumnWidth(5, 360);
  sh.setColumnWidth(6, 180);

  SpreadsheetApp.flush();

  return {
    ok: true,
    message: "Sheet LINK_APJ berhasil dibuat / diperbarui.",
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    sheetName: CONFIG.SHEET_LINK
  };
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action ? String(params.action).trim().toLowerCase() : "links";
  const callback = params.callback ? String(params.callback).trim() : "";

  let result;
  if (action === "setup") {
    result = setupLinkApj();
  } else {
    // Realtime di server: setiap request baca langsung dari Google Sheet.
    // Cache hanya dilakukan di browser oleh main.js selama 2 menit.
    result = getLinkApjData_();
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

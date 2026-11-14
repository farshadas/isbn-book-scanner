const GRADE_TABS = Object.freeze({
  K: "Kinder",
  1: "Grade 1",
  2: "Grade 2",
  3: "Grade 3",
  4: "Grade 4",
  5: "Grade 5",
  6: "Grade 6",
  7: "Grade 7",
  8: "Grade 8",
});

const HEADERS = [
  "First Name",
  "Last Name",
  "Grade",
  "Book 1",
  "Book 2",
  "Book 3",
  "Book 4",
  "Book 5",
  "Timestamp",
];

const GRADE_SPREADSHEET_IDS = Object.freeze({
  K: "1BxiNLWOLx8dNzlSLWfqVIdpCwoSqrC-Jpg39NsyXXIk",
  1: "1Bj2kNajhuezTNEBWau_l617LOiHcwNy5By85qrogET0",
  2: "1H0BR4db0jZCn_kxbCr1IxIYNmu22tCmJ9TSrNXV8eRo",
  3: "1yvMcxSQ4mtwvwXupHKfC97CANBsOP_YwEMZYz4p98mI",
  4: "1d7hefxzYBNyaZkugbRDhOonfYnxZnCsq1uW4QrXUIp0",
  5: "1hdXwiNdQvx31PxIPNfsLuking3WEn8df4UwpH4W_nP0",
  6: "1pibZ13mUyojwRiPUGdVpESjol422qosYnVOlGIWTXJQ",
  7: "1Eh48xSPhyup6WT1zijD94oCjKXyLn-D-kYUnQKc1e-8",
  8: "116L2XfKzHF5XQBLyb26BmJhz9oIwbOjpX-6Nf7jO2Eg",
});

function doPost(event) {
  try {
    const payload = event?.parameter || {};
    const grade = String(payload.grade || "").trim();
    const values = {
      "first name": cleanCell_(payload.firstName),
      "last name": cleanCell_(payload.lastName),
      grade: grade,
      timestamp: new Date(),
    };
    [1, 2, 3, 4, 5].forEach((number) => {
      values[`book ${number}`] = cleanCell_(payload[`book${number}`]);
    });

    if (
      values["first name"].length < 2 ||
      values["last name"].length !== 1 ||
      !GRADE_TABS[grade]
    ) {
      return jsonResponse_({ ok: false, error: "Missing or invalid student information." });
    }
    if (![1, 2, 3, 4, 5].some((number) => values[`book ${number}`])) {
      return jsonResponse_({ ok: false, error: "At least one book is required." });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const spreadsheet = SpreadsheetApp.openById(GRADE_SPREADSHEET_IDS[grade]);
      insertSorted_(prepareSheet_(spreadsheet.getSheets()[0]), values);
    } finally {
      lock.releaseLock();
    }

    return jsonResponse_({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, error: "The submission could not be saved." });
  }
}

function insertSorted_(sheet, values) {
  const width = Math.max(sheet.getLastColumn(), HEADERS.length);
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0].map(headerKey_);
  const row = headers.map((header) => (header in values ? values[header] : ""));
  const firstCol = headers.indexOf("first name") + 1;
  const lastCol = headers.indexOf("last name") + 1;
  const newKey = sortKey_(values["first name"], values["last name"]);

  let targetRow = sheet.getLastRow() + 1;
  if (firstCol > 0 && sheet.getLastRow() > 1) {
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
    const index = data.findIndex(
      (existing) =>
        sortKey_(existing[firstCol - 1], lastCol > 0 ? existing[lastCol - 1] : "").localeCompare(newKey) > 0
    );
    if (index >= 0) {
      targetRow = index + 2;
      sheet.insertRowBefore(targetRow);
    }
  }
  sheet.getRange(targetRow, 1, 1, width).setValues([row]);
}

function headerKey_(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^student(?:'s)? /, "")
    .replace(/ initial$/, "");
}

function sortKey_(firstName, lastName) {
  return `${String(firstName || "").trim().toLowerCase()}\u0000${String(lastName || "").trim().toLowerCase()}`;
}

function prepareSheet_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#dce9df");
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, HEADERS.length);
  }
  return sheet;
}

function cleanCell_(value) {
  const cleaned = String(value || "").trim();
  return /^[=+\-@]/.test(cleaned) ? `'${cleaned}` : cleaned;
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

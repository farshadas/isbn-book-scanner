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

function setupGradeSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", spreadsheet.getId());
  Object.values(GRADE_TABS).forEach((tabName) => getOrCreateSheet_(spreadsheet, tabName));
}

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
      values["last name"].length !== 2 ||
      !GRADE_TABS[grade]
    ) {
      return jsonResponse_({ ok: false, error: "Missing or invalid student information." });
    }
    if (![1, 2, 3, 4, 5].some((number) => values[`book ${number}`])) {
      return jsonResponse_({ ok: false, error: "At least one book is required." });
    }

    const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    if (!spreadsheetId) throw new Error("Run setupGradeSheets before accepting submissions.");

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      insertSorted_(getOrCreateSheet_(spreadsheet, GRADE_TABS[grade]), values);
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
    .replace(/^student(?:'s)? /, "");
}

function sortKey_(firstName, lastName) {
  return `${String(firstName || "").trim().toLowerCase()}\u0000${String(lastName || "").trim().toLowerCase()}`;
}

function getOrCreateSheet_(spreadsheet, tabName) {
  const sheet = spreadsheet.getSheetByName(tabName) || spreadsheet.insertSheet(tabName);
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

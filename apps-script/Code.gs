const GRADE_TABS = Object.freeze({
  K: "K",
  1: "1",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
});

const HEADERS = [
  "Timestamp",
  "Student first name",
  "Student last name",
  "Grade",
  "Book 1",
  "Book 2",
  "Book 3",
  "Book 4",
  "Book 5",
];

function setupGradeSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", spreadsheet.getId());
  Object.values(GRADE_TABS).forEach((tabName) => getOrCreateSheet_(spreadsheet, tabName));
}

function doPost(event) {
  try {
    const payload = event?.parameter || {};
    const firstName = cleanCell_(payload.firstName);
    const lastName = cleanCell_(payload.lastName);
    const grade = String(payload.grade || "").trim();
    const books = [1, 2, 3, 4, 5].map((number) => cleanCell_(payload[`book${number}`]));

    if (!firstName || !lastName || !GRADE_TABS[grade]) {
      return jsonResponse_({ ok: false, error: "Missing or invalid student information." });
    }
    if (!books.some(Boolean)) {
      return jsonResponse_({ ok: false, error: "At least one book is required." });
    }

    const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    if (!spreadsheetId) throw new Error("Run setupGradeSheets before accepting submissions.");

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const sheet = getOrCreateSheet_(spreadsheet, GRADE_TABS[grade]);
      sheet.appendRow([new Date(), firstName, lastName, grade, ...books]);
    } finally {
      lock.releaseLock();
    }

    return jsonResponse_({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, error: "The submission could not be saved." });
  }
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

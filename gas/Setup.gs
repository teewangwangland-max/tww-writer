/**
 * Setup.gs — idempotent, non-destructive project setup.
 * Safe to run any number of times. Never deletes or overwrites existing data,
 * except the guarded removal of the brand-new default "Sheet1"/"แผ่น1" tab
 * created in THIS run (see step 4).
 */

function setup() {
  var props = PropertiesService.getScriptProperties();
  var report = {
    sheetId: null,
    sheetUrl: null,
    docsFolderId: null,
    created: [],
    ok: [],
    warnings: []
  };

  // 1-2. Spreadsheet
  var existingSheetId = props.getProperty(PROP_SHEET_ID);
  var ss;
  var createdNewSpreadsheet = false;
  if (existingSheetId) {
    ss = SpreadsheetApp.openById(existingSheetId);
  } else {
    ss = SpreadsheetApp.create(DB_NAME);
    props.setProperty(PROP_SHEET_ID, ss.getId());
    createdNewSpreadsheet = true;
  }
  report.sheetId = ss.getId();
  report.sheetUrl = ss.getUrl();

  // 3. Tabs from SCHEMA, in order
  var tabNames = Object.keys(SCHEMA);
  for (var i = 0; i < tabNames.length; i++) {
    var tabName = tabNames[i];
    var headers = SCHEMA[tabName];
    var sheet = ss.getSheetByName(tabName);

    if (!sheet) {
      sheet = ss.insertSheet(tabName);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      report.created.push(tabName);
      continue;
    }

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      report.created.push(tabName);
      continue;
    }

    var width = Math.max(sheet.getLastColumn(), headers.length);
    var existingHeaders = sheet.getRange(1, 1, 1, width).getValues()[0];
    if (headersMatch_(existingHeaders, headers)) {
      report.ok.push(tabName);
    } else {
      report.warnings.push(
        tabName + ': header mismatch, expected [' + headers.join(', ') +
        '] got [' + existingHeaders.join(', ') + ']'
      );
    }
  }

  // 4. Remove empty default tab, only if the spreadsheet was created THIS run
  if (createdNewSpreadsheet) {
    var defaultNames = ['Sheet1', 'แผ่น1'];
    for (var d = 0; d < defaultNames.length; d++) {
      var defaultSheet = ss.getSheetByName(defaultNames[d]);
      if (defaultSheet && defaultSheet.getLastRow() === 0) {
        ss.deleteSheet(defaultSheet);
      }
    }
  }

  // 5. Drive folder
  var existingFolderId = props.getProperty(PROP_DOCS_FOLDER_ID);
  if (existingFolderId) {
    try {
      var folder = DriveApp.getFolderById(existingFolderId);
      report.docsFolderId = folder.getId();
    } catch (e) {
      report.warnings.push('Docs folder id ' + existingFolderId + ' could not be opened: ' + e);
    }
  } else {
    var newFolder = DriveApp.createFolder(DOCS_FOLDER_NAME);
    props.setProperty(PROP_DOCS_FOLDER_ID, newFolder.getId());
    report.docsFolderId = newFolder.getId();
  }

  Logger.log(report);
  return report;
}

function headersMatch_(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

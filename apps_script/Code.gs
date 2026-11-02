/**
 * MMFetUS demo — survey collector.
 *
 * Deploy as a Web App (Deploy > New deployment > Web app):
 *   - Execute as: Me
 *   - Who has access: Anyone
 * Then paste the /exec URL into the Flutter app (lib/config.dart or
 * --dart-define=APPS_SCRIPT_URL=...).
 *
 * Each POST (JSON body) is appended as a row to the active sheet. New fields
 * are added as columns automatically, so the questionnaire can evolve without
 * editing this script.
 */
var SHEET_NAME = 'respostas';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = _sheet();
    var headers = _headers(sheet);

    // add any new keys as columns
    Object.keys(data).forEach(function (k) {
      if (headers.indexOf(k) === -1) {
        headers.push(k);
        sheet.getRange(1, headers.length).setValue(k);
      }
    });

    var row = headers.map(function (h) {
      var v = data[h];
      return v === undefined || v === null ? '' : v;
    });
    sheet.appendRow(row);

    return _json({ status: 'ok' });
  } catch (err) {
    return _json({ status: 'error', message: String(err) });
  }
}

function doGet() {
  return _json({ status: 'ready', sheet: SHEET_NAME });
}

function _sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function _headers(sheet) {
  if (sheet.getLastRow() === 0) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .filter(function (h) { return h !== ''; });
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

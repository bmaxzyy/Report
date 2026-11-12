/**
 * Report intake — Google Apps Script backend
 * Receives a report file from the web page and files it in Google Drive:
 *
 *   <Root folder>/
 *     Ama Mensah (ama@company.com)/
 *       Weekly/   Week ending 2026-11-06 - Ama Mensah - report.pdf
 *       Monthly/  2026-11 November - Ama Mensah - report.pdf
 */

// ====== SETTINGS ======
const ROOT_FOLDER_ID = '12plgBmWuvSTrMGIFJxST69MUjRh5vaDA'; // the long ID at the end of the folder's URL
const ACCESS_CODE    = 'TADT-Report@aliska';                // colleagues must enter this on the page
const ALLOWED_DOMAIN = '';                                  // e.g. 'company.com' - leave '' to allow any email
const NOTIFY_EMAIL   = '';                                  // optional: get an email for each submission
// ======================

// ====== SETTINGS ======
const ROOT_FOLDER_ID = ''; // the long ID at the end of the folder's URL
const ACCESS_CODE    = '';                // colleagues must enter this on the page
const ALLOWED_DOMAIN = '';                                  // e.g. 'company.com' - leave '' to allow any email
const NOTIFY_EMAIL   = '';                                  // optional: get an email for each submission
// ======================

const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB per submission

function doGet() {
  return json_({ ok: true, message: 'Report endpoint is running.' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const data = JSON.parse(e.postData.contents);
    validate_(data);

    lock.waitLock(20000); // stops two people creating the same folder at once

    const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
    const personFolder = getOrCreatePersonFolder_(root, data.name, data.email);
    const typeFolder = getOrCreateChild_(personFolder, data.type === 'monthly' ? 'Monthly' : 'Weekly');

    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    const base = clean_(data.period) + ' - ' + clean_(data.name);

    // Save each uploaded file straight into the folder (no extra Doc is created)
    data.files.forEach(function (f) {
      const fileName = clean_(f.name);
      let name = base + ' - ' + fileName;
      if (typeFolder.getFilesByName(name).hasNext()) {
        name = base + ' (resubmitted ' + stamp + ') - ' + fileName;
      }
      typeFolder.createFile(
        Utilities.newBlob(Utilities.base64Decode(f.data), f.mime || 'application/octet-stream', name)
      );
    });

    if (NOTIFY_EMAIL) {
      MailApp.sendEmail(NOTIFY_EMAIL, 'New ' + data.type + ' report from ' + data.name,
        data.period + '\n\nSaved in: ' + typeFolder.getUrl());
    }

    return json_({ ok: true, path: personFolder.getName() + ' / ' + typeFolder.getName() });
  } catch (err) {
    return json_({ ok: false, error: err.message });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// ---------- helpers ----------

function validate_(d) {
  if (d.code !== ACCESS_CODE) throw new Error('The access code is not correct.');
  if (!d.name || !d.email || !d.period) throw new Error('Name, email and period are required.');
  if (d.type !== 'weekly' && d.type !== 'monthly') throw new Error('Choose weekly or monthly.');
  if (!/^[^@\s'"]+@[^@\s'"]+\.[^@\s'"]+$/.test(d.email)) throw new Error('Enter a valid email address.');
  if (ALLOWED_DOMAIN && d.email.toLowerCase().split('@')[1] !== ALLOWED_DOMAIN.toLowerCase()) {
    throw new Error('Use your @' + ALLOWED_DOMAIN + ' email address.');
  }
  if (!d.files || !d.files.length) throw new Error('Attach your report file.');
  const total = d.files.reduce(function (n, f) { return n + (f.data || '').length * 0.75; }, 0);
  if (total > MAX_TOTAL_BYTES) throw new Error('Files are over 10 MB in total.');
}

// One folder per colleague, matched by email so a spelling change in the name does not create a duplicate.
function getOrCreatePersonFolder_(root, name, email) {
  const emailKey = email.toLowerCase();
  const found = root.searchFolders("title contains '" + emailKey + "'");
  if (found.hasNext()) return found.next();
  return root.createFolder(clean_(name) + ' (' + emailKey + ')');
}

function getOrCreateChild_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function clean_(s) {
  return String(s).replace(/[\\\/:*?"<>|']/g, '').trim().slice(0, 120);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
/**
 * Report intake — Google Apps Script backend
 * Receives a report from the web page and files it in Google Drive:
 *
 *   <Root folder>/
 *     Ama Mensah (ama@company.com)/
 *       Weekly/   Week ending 2026-11-06 – Ama Mensah  (Google Doc + attachments)
 *       Monthly/  2026-11 November – Ama Mensah        (Google Doc + attachments)
 */

// ====== SETTINGS — edit these three, then deploy ======
const ROOT_FOLDER_ID = 'PASTE_YOUR_DRIVE_FOLDER_ID_HERE'; // the long ID at the end of the folder's URL
const ACCESS_CODE    = 'TADT-Reports@aliska';                 // colleagues must enter this on the page
const ALLOWED_DOMAIN = '';                                 // e.g. 'company.com' — leave '' to allow any email
const NOTIFY_EMAIL   = '';                                 // optional: get an email for each submission
// ======================================================

const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB of attachments per report

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
    let baseName = clean_(data.period) + ' – ' + clean_(data.name);
    if (typeFolder.getFilesByName(baseName).hasNext()) {
      baseName += ' (resubmitted ' + stamp + ')';
    }

    // 1) The written report as a Google Doc
    const doc = DocumentApp.create(baseName);
    const body = doc.getBody();
    body.appendParagraph(clean_(data.type === 'monthly' ? 'Monthly report' : 'Weekly report'))
        .setHeading(DocumentApp.ParagraphHeading.TITLE);
    body.appendParagraph(data.name + ' · ' + data.email + ' · ' + data.period);
    body.appendParagraph('Submitted ' + stamp).setItalic(true);
    section_(body, 'What I completed', data.completed);
    section_(body, 'Challenges and blockers', data.blockers);
    section_(body, 'Plans for next ' + (data.type === 'monthly' ? 'month' : 'week'), data.next);
    doc.saveAndClose();
    DriveApp.getFileById(doc.getId()).moveTo(typeFolder);

    // 2) Attachments, saved beside the Doc
    (data.files || []).forEach(function (f) {
      const blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.mime || 'application/octet-stream',
        baseName + ' – ' + clean_(f.name));
      typeFolder.createFile(blob);
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
  if (!d.completed || !String(d.completed).trim()) throw new Error('Describe what you completed.');
  const total = (d.files || []).reduce(function (n, f) { return n + (f.data || '').length * 0.75; }, 0);
  if (total > MAX_TOTAL_BYTES) throw new Error('Attachments are over 10 MB in total.');
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

function section_(body, heading, text) {
  body.appendParagraph(heading).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(text && String(text).trim() ? String(text) : '—');
}

function clean_(s) {
  return String(s).replace(/[\\\/:*?"<>|']/g, '').trim().slice(0, 120);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

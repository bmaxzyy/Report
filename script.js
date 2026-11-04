// ====== SETTINGS ======
// Paste the Web app URL you get after deploying Code.gs (ends in /exec)
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbx6lcccNpLVeSWoTH7jHQrH6QY23kn6Ugduts8xO_0n_N9YcwG5MDGwitPx1jK3LfFe/exec';
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
// ======================

const $ = (id) => document.getElementById(id);
const form = $('report-form');
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ---------- set up period inputs ----------
MONTHS.forEach((m, i) => {
  const opt = document.createElement('option');
  opt.value = String(i + 1).padStart(2, '0');
  opt.textContent = m;
  $('month').appendChild(opt);
});

const today = new Date();
$('year').value = today.getFullYear();
$('month').value = String(today.getMonth() + 1).padStart(2, '0');
$('week-ending').value = upcomingFriday(today);

function upcomingFriday(d) {
  const x = new Date(d);
  x.setDate(x.getDate() + ((5 - x.getDay() + 7) % 7));
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}

// ---------- current values ----------
function reportType() {
  return form.elements.type.value; // 'weekly' | 'monthly'
}

function periodLabel() {
  if (reportType() === 'weekly') {
    return $('week-ending').value ? 'Week ending ' + $('week-ending').value : '';
  }
  const m = $('month').value;
  return $('year').value ? $('year').value + '-' + m + ' ' + MONTHS[Number(m) - 1] : '';
}

// ---------- live "will be saved to" preview ----------
function updatePreview() {
  const monthly = reportType() === 'monthly';
  document.body.dataset.type = reportType();
  $('period-weekly').hidden = monthly;
  $('period-monthly').hidden = !monthly;

  const who = $('name').value.trim() || 'Your name';
  $('path-preview').textContent =
    who + ' / ' + (monthly ? 'Monthly' : 'Weekly') + ' / ' + (periodLabel() || 'Choose a period');
}

form.addEventListener('input', updatePreview);
form.addEventListener('change', updatePreview);

// ---------- remember name and email on this device ----------
try {
  $('name').value = localStorage.getItem('rp_name') || '';
  $('email').value = localStorage.getItem('rp_email') || '';
} catch (e) {}
updatePreview();

// ---------- attachments ----------
$('files').addEventListener('change', () => {
  const files = Array.from($('files').files);
  const total = files.reduce((n, f) => n + f.size, 0);
  $('file-list').innerHTML = '';
  files.forEach((f) => {
    const li = document.createElement('li');
    li.textContent = f.name + ' (' + (f.size / 1024 / 1024).toFixed(1) + ' MB)';
    $('file-list').appendChild(li);
  });
  if (total > MAX_TOTAL_BYTES) showError('Files are over 10 MB in total. Remove some or compress them.');
  else hideError();
});

function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, mime: file.type, data: String(r.result).split(',')[1] });
    r.onerror = () => reject(new Error('Could not read ' + file.name + '.'));
    r.readAsDataURL(file);
  });
}

// ---------- errors ----------
function showError(msg) { $('error').textContent = msg; $('error').hidden = false; }
function hideError() { $('error').hidden = true; }

// ---------- submit ----------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const name = $('name').value.trim();
  const email = $('email').value.trim();
  const period = periodLabel();
  const code = $('code').value;
  const files = Array.from($('files').files);

  if (!name) return showError('Enter your full name.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showError('Enter a valid work email.');
  if (!period) return showError('Choose the period this report covers.');
  if (!files.length) return showError('Attach your report file.');
  if (!code) return showError('Enter the access code.');
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) return showError('Files are over 10 MB in total.');
  if (ENDPOINT.startsWith('PASTE_')) return showError('This page is not connected yet. Add the Web app URL in script.js.');

  const btn = $('submit');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const payload = {
      type: reportType(),
      name, email, period, code,
      files: await Promise.all(files.map(readFile))
    };

    // text/plain avoids a CORS preflight, which Apps Script cannot answer
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!result.ok) throw new Error(result.error || 'The report could not be saved.');

    try { localStorage.setItem('rp_name', name); localStorage.setItem('rp_email', email); } catch (e) {}
    $('done-path').textContent = result.path + ' / ' + period;
    form.hidden = true;
    $('done').hidden = false;
  } catch (err) {
    showError(err.message || 'Something went wrong. Check your connection and try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save report';
  }
});

// ---------- start over ----------
$('again').addEventListener('click', () => {
  ['code'].forEach((id) => { $(id).value = ''; });
  $('files').value = '';
  $('file-list').innerHTML = '';
  $('done').hidden = true;
  form.hidden = false;
  updatePreview();
});
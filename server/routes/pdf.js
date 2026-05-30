/**
 * pdf.js
 *
 * Routes for generating PDF documents.
 * Uses pdfkit to build and stream PDFs directly to the HTTP response.
 * Business info is sourced from config/business.json.
 *
 * Fonts: Rubik (Regular + Bold) embedded from server/fonts/.
 * Rubik covers Hebrew, Latin, and the ₪ glyph (U+20AA), making it suitable
 * for invoices that mix Hebrew text with English names and numeric amounts.
 *
 * Layout: full RTL, modelled on the reference חשבון עסקה format:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │                                     חשבון עסקה  (large) │
 *   │                            תאריך: DD/MM/YYYY  מספר: N   │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  עבור: [client]          │  מאת: [business]             │
 *   │                          │  ע.פ: [number]               │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  סה"כ │ מחיר לשעה │ שעות │ זמן │ תאריך  ← column order │
 *   │  ...  │     ...   │ ...  │ ... │  ...                   │
 *   ├──────────────────────────────────────────────────────────┤
 *   │                    סה"כ פטור ממע"מ   ₪X,XXX.XX          │
 *   │                          מע"מ XX%    ₪X,XXX.XX          │
 *   │                    סה"כ לתשלום       ₪X,XXX.XX  (bold)  │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Endpoints:
 *   GET  /api/pdf/invoice  — Stream a PDF invoice for a client's completed
 *                            sessions between two dates.
 *
 * API routes used:
 *   (internal)  SELECT on clients + sessions tables via shared db instance
 */

const path        = require('path');
const { Router }  = require('express');
const PDFDocument = require('pdfkit');
const { db, autoCompleteSessions } = require('../db/database');
const business = require('../config/business.json');

const FONT_REGULAR = path.join(__dirname, '../fonts/Rubik-Regular.ttf');
const FONT_BOLD    = path.join(__dirname, '../fonts/Rubik-Bold.ttf');

const router = Router();

const RTL = '\u200F';  // Right-to-left mark — see he() helper below

// ─── Layout constants ─────────────────────────────────────────────────────────

const LEFT  = 50;
const RIGHT = 545;   // A4 (595pt) minus 50pt right margin
const WIDTH = RIGHT - LEFT;  // 495pt

// Table columns in RTL order (rightmost column = first in reading direction).
// Reading starts at date (right) and ends at amount (left).
const COL = {
  date:     { x: 450, w: 95  },  // תאריך   — rightmost
  time:     { x: 385, w: 65  },  // זמן
  duration: { x: 310, w: 75  },  // שעות
  rate:     { x: 160, w: 150 },  // מחיר לשעה
  amount:   { x: 50,  w: 110 },  // סה"כ    — leftmost
};

const ROW_H       = 22;
const PAGE_BOTTOM = 750;

// Totals block sits in the left portion of the page (RTL end-of-reading).
// Label is right-aligned in the label column; amount is right-aligned in the amount column.
const TOT_AMT_X   = 50;
const TOT_AMT_W   = 75;
const TOT_LABEL_X = 50;
const TOT_LABEL_W = 200;  // right edge at 370

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats duration minutes as "Xh Ym".
 * @param {number} minutes
 * @returns {string}
 */
function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Formats a number as ₪X,XXX.XX.
 * @param {number} n
 * @returns {string}
 */
function formatNIS(n) {
  return `₪${n.toLocaleString('en-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Converts YYYY-MM-DD → DD/MM/YYYY for display.
 * @param {string} iso
 * @returns {string}
 */
function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Draws a horizontal rule across the full page width.
 * @param {PDFDocument} doc
 * @param {number}      y
 */
function rule(doc, y) {
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#cccccc').lineWidth(0.75).stroke();
}

/**
 * Draws the RTL table header row. Returns y of the first data row.
 * @param {PDFDocument} doc
 * @param {number}      y
 * @returns {number}
 */
function drawTableHeader(doc, y) {
  doc.rect(LEFT, y, WIDTH, ROW_H).fill('#1a2744');
  doc.fillColor('#ffffff').fontSize(9).font('Rubik-Bold');
  const ty = y + 7;
  doc.text('תאריך',     COL.date.x,     ty, { width: COL.date.w,     align: 'center' });
  doc.text('זמן',       COL.time.x,     ty, { width: COL.time.w,     align: 'center' });
  doc.text('שעות',      COL.duration.x, ty, { width: COL.duration.w, align: 'center' });
  doc.text(`${reverseWords('מחיר לשעה')} `, COL.rate.x,     ty, { width: COL.rate.w,     align: 'center' });
  doc.text('סה"כ',      COL.amount.x,   ty, { width: COL.amount.w,   align: 'center' });
  return y + ROW_H;
}

/**
 * Reverses the order of words in a space-separated string.
 * @param {string} text
 * @returns {string}
 */
function reverseWords(text) {
  return text.split(' ').reverse().join(' ');
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/pdf/invoice
 *
 * Generates and streams a Hebrew RTL PDF invoice (חשבון עסקה) for all
 * Completed sessions of the given client within the specified date range.
 *
 * Query params:
 *   client_id     {integer}  — Client's database ID. Required.
 *   from          {string}   — Start date (YYYY-MM-DD), inclusive. Required.
 *   to            {string}   — End date (YYYY-MM-DD), inclusive. Required.
 *   billing_name  {string}   — Override the client's stored billing name on the
 *                              invoice. Optional; falls back to client.billing_name
 *                              then client.name.
 *
 * Example request:
 *   GET /api/pdf/invoice?client_id=1&from=2025-01-01&to=2025-03-31
 *
 * Example response (200):
 *   Binary PDF stream — Content-Type: application/pdf
 *
 * Errors:
 *   400  { "error": "client_id, from, and to are required" }
 *   404  { "error": "Client not found" }
 *   404  { "error": "No completed sessions found for this client in the given date range" }
 */
router.get('/invoice', (req, res) => {
  const { client_id, from, to, billing_name } = req.query;

  if (!client_id || !from || !to)
    return res.status(400).json({ error: 'client_id, from, and to are required' });

  autoCompleteSessions();

  const client = db.prepare(`
    SELECT id, name, billing_name
    FROM clients WHERE id = ?
  `).get(client_id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const sessions = db.prepare(`
    SELECT id, date, time, duration, rate
    FROM sessions
    WHERE client_id = ?
      AND date >= ? AND date <= ?
    ORDER BY date, time
  `).all(client_id, from, to);

  if (sessions.length === 0)
    return res.status(404).json({ error: 'No completed sessions found for this client in the given date range' });

  const taxPercent = business.tax || 0;
  const subtotal   = sessions.reduce((sum, s) => sum + (s.duration * s.rate / 60), 0);
  const taxAmount  = subtotal * taxPercent / 100;
  const total      = subtotal + taxAmount;
  const today      = new Date().toISOString().slice(0, 10);
  const clientName = billing_name || client.billing_name || client.name;
  const invoice_number = `3${String(sessions[0].id).padStart(4, '0')}-${sessions.length}`;
  // ─── Build PDF ─────────────────────────────────────────────────────────────

  const doc = new PDFDocument({ margin: LEFT, size: 'A4' });
  doc.registerFont('Rubik',         FONT_REGULAR);
  doc.registerFont('Rubik-Bold',    FONT_BOLD);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice_number}.pdf"`);
  doc.pipe(res);

  // y tracks the current vertical position. All elements are placed with
  // explicit coordinates so the PDFKit cursor does not interfere with layout.
  let y = LEFT;

  // ─── Title ─────────────────────────────────────────────────────────────────

  doc.fontSize(28).font('Rubik-Bold').fillColor('#000000')
    .text(`${reverseWords('חשבון עסקה')} `, LEFT, y, { width: WIDTH, align: 'right' });
  y += 36;

  doc.fontSize(10).font('Rubik').fillColor('#444444')
    .text(`${invoice_number} מספר:`, LEFT, y, { width: WIDTH, align: 'right' });
  y += 16;
  doc.text(`${formatDate(today)} תאריך:`, LEFT, y, { width: WIDTH, align: 'right' });
  y += 22;

  // ─── Divider ───────────────────────────────────────────────────────────────

  rule(doc, y);
  y += 18;

  // ─── Info block: מאת (right column) | עבור (left column) ──────────────────

  const MID     = LEFT + Math.floor(WIDTH / 2);
  const R_COL_X = MID + 8;
  const R_COL_W = RIGHT - R_COL_X;
  const L_COL_X = LEFT;
  const L_COL_W = MID - LEFT - 8;

  // Business — right column
  doc.fontSize(10).font('Rubik-Bold').fillColor('#000000')
    .text(`${reverseWords(business.nameHe)} מאת: `, R_COL_X, y, { width: R_COL_W, align: 'right' });
  doc.fontSize(10).font('Rubik').fillColor('#333333')
    .text(`${business.businessNumber} ע.פ:`, R_COL_X, y + 18, { width: R_COL_W, align: 'right' });
  doc.fontSize(10).font('Rubik').fillColor('#333333')
    .text(`${business.email} אימייל:`, R_COL_X, y + 36, { width: R_COL_W, align: 'right' });
  doc.fontSize(10).font('Rubik').fillColor('#333333')
    .text(`${business.phone} טלפון:`, R_COL_X, y + 54, { width: R_COL_W, align: 'right' });

  // Client — left column (same top y)
  doc.fontSize(10).font('Rubik-Bold').fillColor('#000000')
    .text(`${clientName} עבור:`, L_COL_X, y, { width: L_COL_W, align: 'right' });

  y += 80;

  // ─── Divider ───────────────────────────────────────────────────────────────

  rule(doc, y);
  y += 14;

  // ─── Sessions table ────────────────────────────────────────────────────────

  let rowY = drawTableHeader(doc, y);

  sessions.forEach((s, i) => {
    if (rowY + ROW_H > PAGE_BOTTOM) {
      doc.addPage();
      rowY = drawTableHeader(doc, LEFT);
    }
    const amount = s.duration * s.rate / 60;
    const bg     = i % 2 === 0 ? '#f5f7fa' : '#ffffff';

    doc.rect(LEFT, rowY, WIDTH, ROW_H).fill(bg);
    doc.fillColor('#000000').fontSize(9).font('Rubik');
    const ty = rowY + 7;
    doc.text(formatDate(s.date),         COL.date.x,     ty, { width: COL.date.w,     align: 'center' });
    doc.text(s.time,                     COL.time.x,     ty, { width: COL.time.w,     align: 'center' });
    doc.text(formatDuration(s.duration), COL.duration.x, ty, { width: COL.duration.w, align: 'center' });
    doc.text(`₪${s.rate}`,               COL.rate.x,     ty, { width: COL.rate.w,     align: 'center' });
    doc.text(formatNIS(amount),          COL.amount.x,   ty, { width: COL.amount.w,   align: 'center' });
    rowY += ROW_H;
  });

  // Bottom border of table
  doc.moveTo(LEFT, rowY).lineTo(RIGHT, rowY).strokeColor('#cccccc').lineWidth(0.5).stroke();
  y = rowY + 18;

  // ─── Totals ────────────────────────────────────────────────────────────────

  doc.fontSize(10).font('Rubik').fillColor('#000000');

  // סה"כ פטור ממע"מ
  doc.text(`${reverseWords('סה"כ פטור ממע"מ')} `, TOT_LABEL_X, y, { width: TOT_LABEL_W, align: 'right' });
  doc.text(formatNIS(subtotal),   TOT_AMT_X,   y, { width: TOT_AMT_W,   align: 'right' });
  y += 20;

  // מע"מ
  doc.text(`מע"מ`, TOT_LABEL_X, y, { width: TOT_LABEL_W, align: 'right' });
  doc.text(formatNIS(taxAmount),      TOT_AMT_X,   y, { width: TOT_AMT_W,   align: 'right' });
  y += 16;

  // סה"כ לתשלום — highlighted
  const totRowW = TOT_LABEL_X + TOT_LABEL_W - LEFT+15;
  doc.rect(LEFT, y, totRowW, 26).fill('#ebebeb');
  doc.fontSize(11).font('Rubik-Bold').fillColor('#000000')
    .text(`${reverseWords('סה"כ לתשלום')} `, TOT_LABEL_X, y + 7, { width: TOT_LABEL_W, align: 'right' });
  doc.text(formatNIS(total), TOT_AMT_X, y + 7, { width: TOT_AMT_W, align: 'right' });

  doc.end();
});

module.exports = router;

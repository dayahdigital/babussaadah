// =====================================================================
//  Laporan PDF & Excel: kop dayah, judul huruf kapital, tabel bergaris,
//  nomor urut, total, tanda tangan, nomor halaman. Slip mukafaah islami.
//  Pustaka (jsPDF, AutoTable, ExcelJS) ada di js/vendor — tetap jalan tanpa CDN.
// =====================================================================
import { ambilTampilan, LOGO_BAWAAN, rupiah, tglPanjang, today, namaBulan, teksVersi, ISTILAH } from "./common.js";
import { HAK_CIPTA } from "./pengaturan.js";

const _muat = {};
function muatScript(src) {
  return _muat[src] ??= new Promise((ok, gagal) => {
    const s = document.createElement("script");
    s.src = src; s.onload = ok;
    s.onerror = () => { delete _muat[src]; gagal(new Error("Gagal memuat pustaka laporan. Periksa internet lalu coba lagi.")); };
    document.head.appendChild(s);
  });
}
async function siapPdf() {
  await muatScript("js/vendor/jspdf.umd.min.js");
  await muatScript("js/vendor/jspdf.plugin.autotable.min.js");
  return window.jspdf.jsPDF;
}
async function siapExcel() {
  await muatScript("js/vendor/exceljs.min.js");
  return window.ExcelJS;
}

export function unduhBlob(blob, nama) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nama;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

const sel = (v) => (v && typeof v === "object" && "uang" in v) ? rupiah(v.uang) : String(v ?? "");
const bersih = (s) => String(s ?? "").replace(/[−–—]/g, "-").replace(/[^\x00-\xFF]/g, "");   // font PDF standar

// Logo bawaan (icons/logo-dayah.png) dipakai bila pengelola belum mengunggah logo
async function tampilanPdf() {
  const t = await ambilTampilan();
  if (!t.logo) {
    try {
      const b = await (await fetch(LOGO_BAWAAN)).blob();
      t.logo = await new Promise((ok, gagal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = gagal; r.readAsDataURL(b); });
    } catch { /* tanpa logo */ }
  }
  return t;
}

// ---------- Kop surat ----------
function kop(pdf, t, lebar) {
  const kiri = 14;
  let x = kiri;
  if (t.logo) {
    try { pdf.addImage(t.logo, t.logo.startsWith("data:image/png") ? "PNG" : "JPEG", kiri, 9, 18, 18); x = kiri + 22; } catch { /* abaikan logo rusak */ }
  }
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); pdf.setTextColor(15, 81, 50);
  pdf.text(bersih(t.nama).toUpperCase(), x, 16);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(60);
  if (t.alamat) pdf.text(bersih(t.alamat), x, 21);
  if (t.tagline) pdf.text(bersih(t.tagline), x, 25.5);
  pdf.setDrawColor(15, 81, 50); pdf.setLineWidth(0.8); pdf.line(kiri, 30, lebar - kiri, 30);
  pdf.setLineWidth(0.2); pdf.line(kiri, 31.2, lebar - kiri, 31.2);
  pdf.setTextColor(0);
  return 38;
}
function kakiHalaman(pdf) {
  const n = pdf.getNumberOfPages();
  const w = pdf.internal.pageSize.getWidth(), h = pdf.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8); pdf.setTextColor(120);
    pdf.text(`Halaman ${i} dari ${n}`, w - 14, h - 8, { align: "right" });
    pdf.text(bersih(`Dicetak ${tglPanjang(today())} · ${teksVersi()} · ${HAK_CIPTA.replace("©", "(c)")}`), 14, h - 8);
  }
  pdf.setTextColor(0);
}
function tandaTangan(pdf, t, y, kiriLabel = "Mengetahui,\nPimpinan Dayah", kiriNama = t.pimpinan, kananLabel = "Bendahara", kananNama = t.bendahara) {
  const w = pdf.internal.pageSize.getWidth(), h = pdf.internal.pageSize.getHeight();
  if (y > h - 45) { pdf.addPage(); y = 20; }
  pdf.setFontSize(10); pdf.setFont("helvetica", "normal");
  pdf.text(bersih(tglPanjang(today())), w - 50, y, { align: "center" });
  const baris = (teks, x, yy) => teks.split("\n").forEach((s, i) => pdf.text(bersih(s), x, yy + i * 5, { align: "center" }));
  baris(kiriLabel, 50, y + 6);
  baris(kananLabel, w - 50, y + 6 + (kiriLabel.includes("\n") ? 5 : 0));
  pdf.setFont("helvetica", "bold");
  pdf.text(bersih(kiriNama || "...................."), 50, y + 32, { align: "center" });
  pdf.text(bersih(kananNama || "...................."), w - 50, y + 32, { align: "center" });
  pdf.setFont("helvetica", "normal");
}

// ---------- PDF tabel umum ----------
// data: { judul, sub, kolom:[], baris:[[...]], total?:[...], lanskap?, namaFile, ttd? }  sel uang: {uang:n}
export async function pdfTabel(data, { blob = false } = {}) {
  const jsPDF = await siapPdf();
  const t = await tampilanPdf();
  const pdf = new jsPDF({ orientation: data.lanskap ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const w = pdf.internal.pageSize.getWidth();
  let y = kop(pdf, t, w);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(13);
  pdf.text(bersih(data.judul).toUpperCase(), w / 2, y, { align: "center" });
  if (data.sub) { pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.text(bersih(data.sub), w / 2, y + 5.5, { align: "center" }); }
  const kolomUang = new Set();
  data.baris.forEach(r => r.forEach((v, i) => { if (v && typeof v === "object" && "uang" in v) kolomUang.add(i); }));
  pdf.autoTable({
    startY: y + 10,
    head: [data.kolom.map(k => bersih(k).toUpperCase())],
    body: data.baris.map(r => r.map(v => bersih(sel(v)))),
    foot: data.total ? [data.total.map(v => bersih(sel(v)))] : undefined,
    theme: "grid",
    styles: { fontSize: data.lanskap ? 8 : 8.5, cellPadding: 1.8, lineColor: [80, 80, 80], lineWidth: 0.2, textColor: 20, valign: "middle" },
    headStyles: { fillColor: [15, 81, 50], textColor: 255, fontStyle: "bold", halign: "center", lineColor: [80, 80, 80], lineWidth: 0.2 },
    footStyles: { fillColor: [232, 245, 236], textColor: 20, fontStyle: "bold", lineColor: [80, 80, 80], lineWidth: 0.2 },
    columnStyles: Object.fromEntries([[0, { halign: "center", cellWidth: 9 }], ...[...kolomUang].map(i => [i, { halign: "right" }])]),
    didParseCell: (c) => { if (c.section === "foot" && kolomUang.has(c.column.index)) c.cell.styles.halign = "right"; },
    margin: { left: 14, right: 14, bottom: 16 }
  });
  if (data.ttd) tandaTangan(pdf, t, pdf.lastAutoTable.finalY + 12);
  kakiHalaman(pdf);
  if (blob) return pdf.output("blob");
  pdf.save(`${data.namaFile || "laporan"}.pdf`);
}

// ---------- Excel bergaris ----------
const GARIS = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
function lembarExcel(wb, data, t) {
  const ws = wb.addWorksheet(bersih(data.judul).slice(0, 28) || "Laporan", { pageSetup: { orientation: data.lanskap ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  const n = data.kolom.length;
  const judulBaris = (teks, opsi) => {
    const r = ws.addRow([teks]);
    ws.mergeCells(r.number, 1, r.number, n);
    r.getCell(1).alignment = { horizontal: "center" };
    r.getCell(1).font = opsi;
  };
  judulBaris(t.nama.toUpperCase(), { bold: true, size: 14, color: { argb: "FF0F5132" } });
  if (t.alamat) judulBaris(t.alamat, { size: 10 });
  ws.addRow([]);
  judulBaris(data.judul.toUpperCase(), { bold: true, size: 13 });
  if (data.sub) judulBaris(data.sub, { size: 11 });
  ws.addRow([]);
  const head = ws.addRow(data.kolom.map(k => k.toUpperCase()));
  head.eachCell(c => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F5132" } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = GARIS;
  });
  const tulis = (r, tebal) => {
    const row = ws.addRow(r.map(v => (v && typeof v === "object" && "uang" in v) ? Number(v.uang) || 0 : v));
    r.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.border = GARIS;
      c.alignment = { vertical: "middle", wrapText: true, horizontal: i === 0 ? "center" : undefined };
      if (v && typeof v === "object" && "uang" in v) { c.numFmt = '"Rp" #,##0'; c.alignment = { horizontal: "right", vertical: "middle" }; }
      if (tebal) { c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5EC" } }; }
    });
  };
  data.baris.forEach(r => tulis(r, false));
  if (data.total) tulis(data.total, true);
  // lebar kolom otomatis
  data.kolom.forEach((k, i) => {
    const panjang = Math.max(k.length, ...data.baris.map(r => sel(r[i]).length));
    ws.getColumn(i + 1).width = i === 0 ? 6 : Math.min(45, Math.max(10, panjang + 2));
  });
  if (data.ttd) {
    ws.addRow([]);
    const r1 = ws.addRow([]); r1.getCell(Math.max(2, n - 1)).value = tglPanjang(today());
    const r2 = ws.addRow([]); r2.getCell(2).value = "Pimpinan Dayah"; r2.getCell(Math.max(2, n - 1)).value = "Bendahara";
    ws.addRow([]); ws.addRow([]);
    const r3 = ws.addRow([]); r3.getCell(2).value = t.pimpinan || ""; r3.getCell(Math.max(2, n - 1)).value = t.bendahara || "";
    r3.font = { bold: true };
  }
  ws.views = [{ state: "frozen", ySplit: head.number }];
}
export async function excelBuku(namaFile, daftarData) {
  const ExcelJS = await siapExcel();
  const t = await ambilTampilan();
  const wb = new ExcelJS.Workbook();
  wb.creator = t.nama;
  daftarData.forEach(d => lembarExcel(wb, d, t));
  const buf = await wb.xlsx.writeBuffer();
  unduhBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${namaFile}.xlsx`);
}
export const excelTabel = (data) => excelBuku(data.namaFile || "laporan", [data]);

// ---------- Terbilang ----------
const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
export function terbilang(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n < 12) return SATUAN[n];
  if (n < 20) return terbilang(n - 10) + " belas";
  if (n < 100) return terbilang(Math.floor(n / 10)) + " puluh" + (n % 10 ? " " + terbilang(n % 10) : "");
  if (n < 200) return "seratus" + (n - 100 ? " " + terbilang(n - 100) : "");
  if (n < 1000) return terbilang(Math.floor(n / 100)) + " ratus" + (n % 100 ? " " + terbilang(n % 100) : "");
  if (n < 2000) return "seribu" + (n - 1000 ? " " + terbilang(n - 1000) : "");
  if (n < 1e6) return terbilang(Math.floor(n / 1000)) + " ribu" + (n % 1000 ? " " + terbilang(n % 1000) : "");
  if (n < 1e9) return terbilang(Math.floor(n / 1e6)) + " juta" + (n % 1e6 ? " " + terbilang(n % 1e6) : "");
  return terbilang(Math.floor(n / 1e9)) + " miliar" + (n % 1e9 ? " " + terbilang(n % 1e9) : "");
}

// ---------- Slip mukafaah bertemplate islami ----------
export async function slipMukafaah(g, { unduh = false, blob = false } = {}) {
  const jsPDF = await siapPdf();
  const t = await tampilanPdf();
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = pdf.internal.pageSize.getWidth();
  const N = (v) => Number(v) || 0;
  const kehadiran = g.insentif != null ? N(g.insentif) : N(g.honorHadir) * N(g.hadir);
  let y = kop(pdf, t, w);

  pdf.setFont("helvetica", "italic"); pdf.setFontSize(10); pdf.setTextColor(15, 81, 50);
  pdf.text("Bismillahirrahmanirrahim", w / 2, y, { align: "center" });
  pdf.setTextColor(0); pdf.setFont("helvetica", "bold"); pdf.setFontSize(12.5);
  pdf.text("SLIP MUKAFAAH TEUNGKU", w / 2, y + 7, { align: "center" });
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9.5);
  pdf.text(bersih(`Bulan ${namaBulan(g.periode)}`), w / 2, y + 12, { align: "center" });

  pdf.autoTable({
    startY: y + 16, theme: "plain", styles: { fontSize: 9, cellPadding: 1 },
    body: [["Nama", ": " + bersih(g.nama)], ["Jabatan", ": " + bersih(g.jabatan || "-")],
      ["No. slip", `: MKF/${g.periode.replace("-", "/")}/${String(g.guruId).slice(0, 5).toUpperCase()}`],
      ["Diserahkan", ": " + (g.tglBayar ? bersih(tglPanjang(g.tglBayar)) : "-")]],
    columnStyles: { 0: { cellWidth: 26 } }, margin: { left: 14, right: 14 }
  });
  const rinci = [
    ["1", ISTILAH.pokok, rupiah(g.gajiPokok)],
    ["2", ISTILAH.tunjangan, rupiah(g.tunjangan)],
    ["3", `${ISTILAH.kehadiran} (${N(g.hadir)} sesi)`, rupiah(kehadiran)],
    ["4", "Bonus / tambahan", rupiah(g.bonus)],
    ["5", `Potongan alpa (${N(g.alpa)} x ${rupiah(g.potonganAlpa)})`, "- " + rupiah(N(g.potonganAlpa) * N(g.alpa))],
    ["6", "Potongan lain", "- " + rupiah(g.potonganLain)]
  ];
  pdf.autoTable({
    startY: pdf.lastAutoTable.finalY + 3, theme: "grid",
    head: [["NO", "RINCIAN", "JUMLAH"]], body: rinci, foot: [["", "JUMLAH DITERIMA", rupiah(g.total)]],
    styles: { fontSize: 9, cellPadding: 1.8, lineColor: [80, 80, 80], lineWidth: 0.2 },
    headStyles: { fillColor: [15, 81, 50], textColor: 255, halign: "center" },
    footStyles: { fillColor: [232, 245, 236], textColor: 20, fontStyle: "bold" },
    columnStyles: { 0: { halign: "center", cellWidth: 9 }, 2: { halign: "right", cellWidth: 34 } },
    didParseCell: (c) => { if (c.section === "foot" && c.column.index === 2) c.cell.styles.halign = "right"; },
    margin: { left: 14, right: 14 }
  });
  y = pdf.lastAutoTable.finalY + 5;
  pdf.setFont("helvetica", "italic"); pdf.setFontSize(8.5);
  const tb = pdf.splitTextToSize(`Terbilang: ${terbilang(g.total)} rupiah`.replace(/^(Terbilang: )(.)/, (m, a, b) => a + b.toUpperCase()), w - 28);
  pdf.text(tb, 14, y);
  y += tb.length * 4 + 3;

  // Kotak nasihat
  pdf.setDrawColor(201, 162, 39); pdf.setFillColor(253, 249, 236); pdf.setLineWidth(0.4);
  const kutip = pdf.splitTextToSize('"Sebaik-baik kalian adalah orang yang mempelajari Al-Qur\'an dan mengajarkannya." (HR. Bukhari)', w - 36);
  const doa = pdf.splitTextToSize("Jazakumullahu khairan katsiran atas pengabdian Teungku dalam mendidik santri. Semoga Allah SWT memberkahi ilmu, rezeki, dan keluarga Teungku. Aamiin.", w - 36);
  const tinggi = (kutip.length + doa.length) * 4 + 8;
  pdf.roundedRect(14, y, w - 28, tinggi, 2, 2, "FD");
  pdf.setTextColor(90, 70, 0); pdf.setFont("helvetica", "italic"); pdf.setFontSize(8.5);
  pdf.text(kutip, w / 2, y + 5, { align: "center" });
  pdf.setFont("helvetica", "normal"); pdf.setTextColor(40);
  pdf.text(doa, w / 2, y + 7 + kutip.length * 4, { align: "center" });
  pdf.setTextColor(0);
  y += tinggi + 8;

  // Tanda tangan: penerima & bendahara
  pdf.setFontSize(9);
  if (y > pdf.internal.pageSize.getHeight() - 40) { pdf.addPage(); y = 20; }
  pdf.text("Penerima,", 38, y, { align: "center" });
  pdf.text("Bendahara,", w - 38, y, { align: "center" });
  pdf.setFont("helvetica", "bold");
  pdf.text(bersih(g.nama), 38, y + 22, { align: "center" });
  pdf.text(bersih(t.bendahara || "...................."), w - 38, y + 22, { align: "center" });
  pdf.setFont("helvetica", "normal");
  kakiHalaman(pdf);

  if (blob) return pdf.output("blob");
  if (unduh) pdf.save(`slip-mukafaah-${g.periode}-${String(g.nama).replace(/\W+/g, "-")}.pdf`);
  return pdf.output("blob");
}

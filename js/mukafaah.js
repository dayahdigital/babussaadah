// Mukafaah teungku: hitung dari absensi, bonus/potongan, serahkan (tercatat di kas), slip PDF & WhatsApp.
// Setelah diserahkan terkunci; hanya Super Admin yang bisa mengubah atau membatalkan.
import { db, collection, getDocs, doc, query, where, serverTimestamp, writeBatch, increment } from "./firebase.js";
import {
  requireAuth, AKSES, ISTILAH, rupiah, thisMonth, namaBulan, today, toast, esc, aksi, tampilError, catatLog, kirimNotif,
  ambilConfigAbsensi, ambilJadwal, ambilRiwayatJadwal, buatPeriode, jadwalPada, hitungJadwalBulan, nilaiUang, setUang, nomorWA, jamSiap, tglIndo
} from "./common.js";

const { profil } = await requireAuth(AKSES.mukafaah);
const isSA = profil.role === "superadmin";
await jamSiap;
const inPeriode = document.getElementById("periode");
const tb = document.getElementById("tbGaji");
const modal = document.getElementById("modal");
const formAdj = document.getElementById("formAdj");
inPeriode.value = thisMonth();
let daftar = [], guruMap = {}, adjId = null;

const N = (v) => Number(v) || 0;
const kehadiranDari = (g) => g.insentif != null ? N(g.insentif) : N(g.honorHadir) * N(g.hadir);
const potongan = (g) => N(g.potonganAlpa) * N(g.alpa) + N(g.potonganLain);
const hitungTotal = (g) => Math.max(0, N(g.gajiPokok) + N(g.tunjangan) + kehadiranDari(g) + N(g.bonus) - potongan(g));
const L = () => import("./laporan.js");

async function muat() {
  try {
    const [gs, gr] = await Promise.all([
      getDocs(query(collection(db, "gaji"), where("periode", "==", inPeriode.value))),
      getDocs(collection(db, "guru"))
    ]);
    guruMap = Object.fromEntries(gr.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    daftar = gs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nama.localeCompare(b.nama));
    tampil();
  } catch (ex) { tampilError(ex, "Gagal memuat mukafaah"); }
}

function tampil() {
  tb.innerHTML = daftar.length ? daftar.map(g => `<tr>
      <td class="utama">${esc(g.nama)}${g.jabatan ? ` <small class="muted">· ${esc(g.jabatan)}</small>` : ""}</td>
      <td class="num">${g.hadir}</td><td class="num">${g.alpa}${g.alpaOtomatis ? ` <small class="muted">(${g.alpaOtomatis} tak diabsen)</small>` : ""}</td>
      <td class="num">${rupiah(g.gajiPokok)}</td><td class="num">${rupiah(g.tunjangan)}</td><td class="num">${rupiah(kehadiranDari(g))}</td>
      <td class="num">${rupiah(g.bonus)}</td><td class="num">− ${rupiah(potongan(g))}</td><td class="num"><b>${rupiah(g.total)}</b></td>
      <td><span class="badge ${g.dibayar ? "b-lunas" : "b-belum"}">${g.dibayar ? "✔ Diserahkan " + tglIndo(g.tglBayar) : "⏳ Belum"}</span></td>
      <td class="aksi-sel"><div class="aksi">
        ${g.dibayar
          ? `<button class="btn btn-sm btn-sec" data-slip="${g.id}">📄 Slip</button>
             <button class="btn btn-sm btn-wa" data-wa="${g.id}">WhatsApp</button>
             ${isSA ? `<button class="btn btn-sm btn-sec" data-adj="${g.id}">Ubah</button><button class="btn btn-sm btn-red" data-batal="${g.id}">Batalkan</button>` : `<span class="kunci">🔒 terkunci</span>`}`
          : `<button class="btn btn-sm btn-sec" data-adj="${g.id}">Bonus/Pot.</button><button class="btn btn-sm" data-bayar="${g.id}">Serahkan</button>`}
      </div></td></tr>`).join("")
    : `<tr><td colspan="11" class="empty">Belum dihitung untuk ${namaBulan(inPeriode.value)}. Tekan "Hitung dari Absensi".</td></tr>`;
  const total = daftar.reduce((s, g) => s + N(g.total), 0);
  const lunas = daftar.filter(g => g.dibayar).reduce((s, g) => s + N(g.total), 0);
  document.getElementById("sTotal").textContent = rupiah(total);
  document.getElementById("sLunas").textContent = rupiah(lunas);
  document.getElementById("sBelum").textContent = rupiah(total - lunas);
}

// Hitung dari data teungku + absensi (yang sudah diserahkan tidak diubah)
document.getElementById("btnHitung").onclick = (e) => aksi(e.target, async () => {
  const per = inPeriode.value;
  const alpaOto = document.getElementById("alpaOtomatis").checked;
  const [absen, cfg, jdw, riw] = await Promise.all([
    getDocs(query(collection(db, "absensi"), where("bulan", "==", per))), ambilConfigAbsensi(), ambilJadwal(), ambilRiwayatJadwal()
  ]);
  const periodeJadwal = buatPeriode(jdw, riw);
  const rekap = {};
  absen.docs.forEach(d => {
    const a = d.data();
    const r = rekap[a.guruId] ??= { H: 0, A: 0, insentif: 0, tercatat: 0 };
    if (a.status === "H") r.H++;
    if (a.status === "A") r.A++;
    r.insentif += N(a.insentif);
    const s = cfg.sesi.find(x => x.id === a.sesi);
    if (s && jadwalPada(periodeJadwal, a.guruId, s, a.tanggal)) r.tercatat++;
  });
  const lama = Object.fromEntries(daftar.map(g => [g.guruId, g]));
  const b = writeBatch(db);
  let n = 0;
  for (const gr of Object.values(guruMap).filter(g => g.aktif)) {
    if (lama[gr.id]?.dibayar) continue;
    const r = rekap[gr.id] || { H: 0, A: 0, insentif: 0, tercatat: 0 };
    const tak = alpaOto ? Math.max(0, hitungJadwalBulan(cfg, periodeJadwal, gr.id, per) - r.tercatat) : 0;
    const g = {
      periode: per, guruId: gr.id, nama: gr.nama, jabatan: gr.jabatan || "",
      gajiPokok: N(gr.gajiPokok), tunjangan: N(gr.tunjangan), honorHadir: N(gr.honorHadir), potonganAlpa: N(gr.potonganAlpa),
      hadir: r.H, alpa: r.A + tak, alpaOtomatis: tak, insentif: r.insentif,
      bonus: N(lama[gr.id]?.bonus), potonganLain: N(lama[gr.id]?.potonganLain), catatan: lama[gr.id]?.catatan || "",
      dibayar: false, diubah: serverTimestamp()
    };
    g.total = hitungTotal(g);
    b.set(doc(db, "gaji", `${per}_${gr.id}`), g);
    n++;
  }
  await b.commit();
  catatLog("Mukafaah", "Hitung", `${namaBulan(per)} · ${n} teungku${alpaOto ? " · alpa otomatis" : ""}`);
  toast(`Mukafaah ${n} teungku dihitung`);
  muat();
}, "Menghitung...");

// Serahkan: kas + tanda diserahkan dalam satu transaksi
function serahkan(g, tombol) {
  if (!confirm(`Serahkan mukafaah ${g.nama} sebesar ${rupiah(g.total)}?\nAkan dicatat sebagai pengeluaran kas dan dikunci.`)) return;
  aksi(tombol, async () => {
    const kasRef = doc(collection(db, "kas"));
    const tgl = today();
    const b = writeBatch(db);
    b.set(kasRef, {
      tanggal: tgl, jenis: "keluar", kategori: ISTILAH.kategoriKas, keterangan: `Mukafaah ${g.nama} — ${namaBulan(g.periode)}`,
      jumlah: N(g.total), sumber: "penggajian", gajiId: g.id, dicatatOleh: profil.username, waktu: serverTimestamp()
    });
    b.set(doc(db, "ringkasan", "kas"), { keluar: increment(N(g.total)) }, { merge: true });
    b.update(doc(db, "gaji", g.id), { dibayar: true, tglBayar: tgl, kasId: kasRef.id, diserahkanOleh: profil.nama });
    await b.commit();
    catatLog("Mukafaah", "Serahkan", `${g.nama} ${namaBulan(g.periode)} ${rupiah(g.total)}`);
    const uid = guruMap[g.guruId]?.uidAkun;
    if (uid) kirimNotif({ untukUid: uid, judul: "Mukafaah telah diserahkan", isi: `${namaBulan(g.periode)}: ${rupiah(g.total)}. Barakallahu fiikum.`, tautan: "absen-saya.html" });
    toast("Mukafaah diserahkan & tercatat di kas");
    muat();
  }, "Memproses...");
}

function batalkan(g, tombol) {
  if (!confirm(`Batalkan penyerahan mukafaah ${g.nama}? Catatan kas terkait dihapus.`)) return;
  aksi(tombol, async () => {
    const b = writeBatch(db);
    if (g.kasId) { b.delete(doc(db, "kas", g.kasId)); b.set(doc(db, "ringkasan", "kas"), { keluar: increment(-N(g.total)) }, { merge: true }); }
    b.update(doc(db, "gaji", g.id), { dibayar: false, tglBayar: null, kasId: null });
    await b.commit();
    catatLog("Mukafaah", "Batalkan penyerahan", `${g.nama} ${namaBulan(g.periode)} ${rupiah(g.total)}`);
    toast("Penyerahan dibatalkan");
    muat();
  }, "Membatalkan...");
}

// Kirim slip via WhatsApp: bagikan file PDF (HP) atau buka WA dengan pesan + unduh PDF
async function kirimWA(g, tombol) {
  aksi(tombol, async () => {
    const lap = await L();
    const t = await (await import("./common.js")).ambilTampilan();
    const pesan = `Assalamu'alaikum warahmatullahi wabarakatuh.\n\nYth. ${g.nama},\nBerikut slip mukafaah bulan ${namaBulan(g.periode)} dari ${t.nama}:\n\n`
      + `Mukafaah pokok: ${rupiah(g.gajiPokok)}\nTunjangan: ${rupiah(g.tunjangan)}\nMukafaah kehadiran (${g.hadir} sesi): ${rupiah(kehadiranDari(g))}\n`
      + (N(g.bonus) ? `Bonus: ${rupiah(g.bonus)}\n` : "") + (potongan(g) ? `Potongan: − ${rupiah(potongan(g))}\n` : "")
      + `*Jumlah diterima: ${rupiah(g.total)}*\n\nJazakumullahu khairan katsiran atas pengabdian dalam mengajar. Barakallahu fiikum.`;
    const blob = await lap.slipMukafaah(g, { blob: true });
    const file = new File([blob], `slip-mukafaah-${g.periode}-${g.nama.replace(/\W+/g, "-")}.pdf`, { type: "application/pdf" });
    let terbagi = false;
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Slip Mukafaah", text: pesan }); terbagi = true; }
      catch (ex) { if (ex.name === "AbortError") terbagi = true; }   // dibatalkan pengguna
    }
    if (!terbagi) {
      lap.unduhBlob(blob, file.name);
      const hp = nomorWA(guruMap[g.guruId]?.hp);
      window.open(`https://wa.me/${hp}?text=${encodeURIComponent(pesan + "\n\n(Slip PDF terlampir)")}`, "_blank");
      if (!hp) toast("Nomor HP teungku belum diisi di Data Teungku — pilih kontak secara manual di WhatsApp.", "info");
    }
    catatLog("Mukafaah", "Kirim slip WhatsApp", `${g.nama} ${namaBulan(g.periode)}`);
  }, "Menyiapkan...");
}

tb.addEventListener("click", (e) => {
  const ds = e.target.dataset;
  const id = ds.bayar || ds.batal || ds.adj || ds.slip || ds.wa;
  const g = daftar.find(x => x.id === id);
  if (!g) return;
  if (ds.bayar) serahkan(g, e.target);
  if (ds.batal) batalkan(g, e.target);
  if (ds.slip) aksi(e.target, async () => (await L()).slipMukafaah(g, { unduh: true }), "Membuat PDF...");
  if (ds.wa) kirimWA(g, e.target);
  if (ds.adj) {
    adjId = g.id;
    document.getElementById("adjJudul").textContent = "Bonus & potongan — " + g.nama;
    document.getElementById("adjInfo").hidden = !g.dibayar;
    setUang(formAdj.bonus, g.bonus || 0);
    setUang(formAdj.potonganLain, g.potonganLain || 0);
    formAdj.catatan.value = g.catatan || "";
    modal.classList.add("open");
  }
});

formAdj.addEventListener("submit", (e) => {
  e.preventDefault();
  const lama = daftar.find(x => x.id === adjId);
  const g = { ...lama, bonus: nilaiUang(formAdj.bonus), potonganLain: nilaiUang(formAdj.potonganLain) };
  g.total = hitungTotal(g);
  aksi(document.getElementById("btnSimpanAdj"), async () => {
    const b = writeBatch(db);
    b.update(doc(db, "gaji", adjId), { bonus: g.bonus, potonganLain: g.potonganLain, catatan: formAdj.catatan.value.trim(), total: g.total });
    if (lama.dibayar && lama.kasId) {           // Super Admin mengubah yang sudah diserahkan
      b.update(doc(db, "kas", lama.kasId), { jumlah: g.total });
      b.set(doc(db, "ringkasan", "kas"), { keluar: increment(g.total - N(lama.total)) }, { merge: true });
    }
    await b.commit();
    catatLog("Mukafaah", lama.dibayar ? "Ubah (sudah diserahkan)" : "Bonus/potongan",
      `${lama.nama}: bonus ${rupiah(lama.bonus)}→${rupiah(g.bonus)}, potongan lain ${rupiah(lama.potonganLain)}→${rupiah(g.potonganLain)}, total ${rupiah(lama.total)}→${rupiah(g.total)}`);
    modal.classList.remove("open");
    toast("Tersimpan");
    muat();
  });
});
document.getElementById("btnBatal").onclick = () => modal.classList.remove("open");
inPeriode.onchange = muat;

const dataLap = () => ({
  judul: "DAFTAR MUKAFAAH TEUNGKU", sub: `Periode ${namaBulan(inPeriode.value)}`, lanskap: true,
  kolom: ["No", "Nama Teungku", "Hadir", "Alpa", "Mukafaah Pokok", "Tunjangan", "Mukafaah Kehadiran", "Bonus", "Potongan", "Jumlah Diterima", "Status", "Tanda Tangan"],
  baris: daftar.map((g, i) => [i + 1, g.nama, g.hadir, g.alpa, { uang: g.gajiPokok }, { uang: g.tunjangan }, { uang: kehadiranDari(g) },
    { uang: N(g.bonus) }, { uang: potongan(g) }, { uang: g.total }, g.dibayar ? "Diserahkan" : "Belum", ""]),
  total: ["", "JUMLAH", daftar.reduce((s, g) => s + N(g.hadir), 0), daftar.reduce((s, g) => s + N(g.alpa), 0),
    ...[g => g.gajiPokok, g => g.tunjangan, kehadiranDari, g => g.bonus, potongan, g => g.total].map(f => ({ uang: daftar.reduce((s, g) => s + N(f(g)), 0) })), "", ""],
  namaFile: `mukafaah-${inPeriode.value}`, ttd: true
});
document.getElementById("btnPdf").onclick = (e) => aksi(e.target, async () => (await L()).pdfTabel(dataLap()), "Membuat PDF...");
document.getElementById("btnExcel").onclick = (e) => aksi(e.target, async () => (await L()).excelTabel(dataLap()), "Membuat Excel...");

muat();

import { db, collection, getDocs, query, where } from "./firebase.js?v=2.0.1";
import { requireAuth, AKSES, rupiah, today, thisMonth, namaBulan, tglIndo, esc } from "./common.js?v=2.0.1";

const { profil } = await requireAuth(AKSES.dashboard);

const bulan = thisMonth();
document.getElementById("nama").textContent = profil.nama;
document.getElementById("periode").textContent = "· " + namaBulan(bulan);

// Semua peran: data guru & kehadiran
const [guruSnap, absenSnap] = await Promise.all([
  getDocs(query(collection(db, "guru"), where("aktif", "==", true))),
  getDocs(query(collection(db, "absensi"), where("tanggal", "==", today())))
]);
document.getElementById("sGuru").textContent = guruSnap.size;
document.getElementById("sHadir").textContent =
  new Set(absenSnap.docs.filter(d => d.data().status === "H").map(d => d.data().guruId)).size
  + " / " + guruSnap.size;

// Hanya peran keuangan: kas & gaji
if (AKSES.kas.includes(profil.role)) {
  const [kasSnap, gajiSnap] = await Promise.all([
    getDocs(collection(db, "kas")),
    getDocs(query(collection(db, "gaji"), where("periode", "==", bulan)))
  ]);

  let masuk = 0, keluar = 0, saldo = 0;
  const kas = kasSnap.docs.map(d => d.data());
  kas.forEach(k => {
    const n = Number(k.jumlah) || 0;
    saldo += k.jenis === "masuk" ? n : -n;
    if (k.tanggal?.startsWith(bulan)) k.jenis === "masuk" ? masuk += n : keluar += n;
  });
  document.getElementById("sMasuk").textContent = rupiah(masuk);
  document.getElementById("sKeluar").textContent = rupiah(keluar);
  document.getElementById("sSaldo").textContent = rupiah(saldo);
  document.getElementById("sGaji").textContent =
    rupiah(gajiSnap.docs.reduce((s, d) => s + (Number(d.data().total) || 0), 0));

  const terakhir = kas.sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || "")).slice(0, 8);
  document.getElementById("tbKas").innerHTML = terakhir.length
    ? terakhir.map(k => `<tr>
        <td>${tglIndo(k.tanggal)}</td><td>${esc(k.keterangan)}</td><td>${esc(k.kategori)}</td>
        <td><span class="badge ${k.jenis === "masuk" ? "b-in" : "b-out"}">${k.jenis === "masuk" ? "Masuk" : "Keluar"}</span></td>
        <td class="num">${rupiah(k.jumlah)}</td></tr>`).join("")
    : `<tr><td colspan="5" class="empty">Belum ada transaksi.</td></tr>`;
}

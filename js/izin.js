// Persetujuan izin & sakit oleh Pimpinan Dayah.
// Disetujui → absensi sesi terjadwal pada tanggal tsb. dicatat Izin/Sakit (mukafaah kehadiran 0).
import { db, collection, getDocs, doc, query, where, writeBatch, serverTimestamp } from "./firebase.js";
import {
  requireAuth, AKSES, toast, esc, tglIndo, thisMonth, waktuIndo, aksi, tampilError, catatLog, kirimNotif,
  STATUS, ambilConfigAbsensi, ambilJadwal, indeksJadwal, terjadwal, hariDari, tambahHari
} from "./common.js";

const { profil } = await requireAuth(AKSES.izin);
const bisaPutus = profil.role === "pimpinan";      // Super Admin hanya melihat
const cfg = await ambilConfigAbsensi();
let daftar = [];

const modalGambar = document.getElementById("modalGambar");
modalGambar.onclick = () => modalGambar.classList.remove("open");

function kartu(z, menunggu) {
  const j = STATUS[z.jenis] || {};
  const lama = Math.round((Date.parse(z.sampai) - Date.parse(z.dari)) / 86400000) + 1;
  return `<div class="izin-kartu">
    <div class="kepala"><b>${j.ikon || ""} ${j.label || z.jenis} · ${esc(z.nama)}</b>
      ${menunggu ? `<span class="badge b-belum">⏳ Menunggu</span>`
        : `<span class="badge ${z.status === "disetujui" ? "b-in" : "b-out"}">${z.status === "disetujui" ? "✔ Disetujui" : "✖ Ditolak"}</span>`}</div>
    <div class="kecil">📅 ${tglIndo(z.dari)}${z.sampai !== z.dari ? " – " + tglIndo(z.sampai) : ""} (${lama} hari) ·
      Sesi: ${(z.sesi || []).map(x => cfg.sesi.find(s => s.id === x)?.nama || x).join(", ")}</div>
    <div style="margin:6px 0">${esc(z.alasan)}</div>
    ${z.lampiran ? `<img src="${z.lampiran}" alt="Lampiran" data-gambar>` : ""}
    <div class="kecil muted">Diajukan ${waktuIndo(z.waktu)}</div>
    ${!menunggu ? `<div class="kecil">${z.catatanPimpinan ? "Catatan: " + esc(z.catatanPimpinan) + " · " : ""}oleh ${esc(z.diputusNama || "")}</div>` : ""}
    ${menunggu && bisaPutus ? `
      <div class="field" style="margin-top:8px"><input placeholder="Catatan (opsional)" data-catatan="${z.id}"></div>
      <div class="aksi"><button class="btn" data-setuju="${z.id}">✔ Setujui</button>
        <button class="btn btn-red" data-tolak="${z.id}">✖ Tolak</button></div>` : ""}
  </div>`;
}

async function muat() {
  try {
    const s = await getDocs(collection(db, "izin"));
    daftar = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.waktu?.toMillis?.() || 0) - (a.waktu?.toMillis?.() || 0));
    const menunggu = daftar.filter(z => z.status === "menunggu");
    const bln = thisMonth();
    const bulanIni = daftar.filter(z => (z.dari || "").startsWith(bln));
    document.getElementById("sMenunggu").textContent = menunggu.length;
    document.getElementById("sSetuju").textContent = bulanIni.filter(z => z.status === "disetujui").length;
    document.getElementById("sTolak").textContent = bulanIni.filter(z => z.status === "ditolak").length;
    document.getElementById("daftarMenunggu").innerHTML = menunggu.length ? menunggu.map(z => kartu(z, true)).join("") : `<p class="empty">Tidak ada pengajuan yang menunggu. Alhamdulillah.</p>`;
    const sudah = daftar.filter(z => z.status !== "menunggu").slice(0, 40);
    document.getElementById("daftarRiwayat").innerHTML = sudah.length ? sudah.map(z => kartu(z, false)).join("") : `<p class="empty">Belum ada.</p>`;
  } catch (ex) { tampilError(ex, "Gagal memuat pengajuan"); }
}

async function putuskan(z, setuju, tombol) {
  const catatan = document.querySelector(`[data-catatan="${z.id}"]`)?.value.trim() || "";
  if (!setuju && !catatan && !confirm("Tolak tanpa catatan alasan?")) return;
  aksi(tombol, async () => {
    const b = writeBatch(db);
    let n = 0;
    if (setuju) {
      const idx = indeksJadwal(await ambilJadwal(z.guruId));
      // sesi yang sudah tercatat Hadir tidak ditimpa
      const sudahHadir = new Set((await getDocs(query(collection(db, "absensi"), where("guruId", "==", z.guruId))))
        .docs.filter(d => d.data().status === "H").map(d => d.id));
      for (let t = z.dari; t <= z.sampai; t = tambahHari(t, 1)) {
        for (const sid of z.sesi || []) {
          const s = cfg.sesi.find(x => x.id === sid);
          if (!s || !terjadwal(idx, z.guruId, s, hariDari(t)) || sudahHadir.has(`${t}_${sid}_${z.guruId}`)) continue;
          b.set(doc(db, "absensi", `${t}_${sid}_${z.guruId}`), {
            tanggal: t, bulan: t.slice(0, 7), hari: hariDari(t), sesi: sid, sesiNama: s.nama,
            guruId: z.guruId, nama: z.nama, status: z.jenis, insentif: 0,
            keterangan: `${STATUS[z.jenis]?.label}: ${z.alasan}`.slice(0, 200), izinId: z.id,
            sumber: "izin", dicatatOleh: profil.username, waktu: serverTimestamp()
          });
          n++;
          if (n > 400) break;
        }
      }
    }
    b.update(doc(db, "izin", z.id), {
      status: setuju ? "disetujui" : "ditolak", catatanPimpinan: catatan,
      diputusOleh: profil.uid, diputusNama: profil.nama, diputusPada: serverTimestamp()
    });
    await b.commit();
    const jenis = STATUS[z.jenis]?.label || "Izin";
    catatLog("Izin", setuju ? `Setujui ${jenis}` : `Tolak ${jenis}`, `${z.nama} ${z.dari}–${z.sampai}${catatan ? " · " + catatan : ""}`);
    kirimNotif({
      untukUid: z.uid,
      judul: `Pengajuan ${jenis.toLowerCase()} ${setuju ? "disetujui" : "ditolak"}`,
      isi: `${tglIndo(z.dari)}${z.sampai !== z.dari ? " – " + tglIndo(z.sampai) : ""}${catatan ? " · " + catatan : ""}`,
      tautan: "absen-saya.html"
    });
    toast(setuju ? `Disetujui · ${n} sesi dicatat ${jenis}` : "Pengajuan ditolak");
    muat();
  }, "Memproses...");
}

document.querySelector("main").addEventListener("click", (e) => {
  const t = e.target;
  if (t.dataset.gambar !== undefined && t.tagName === "IMG") { document.getElementById("gambarBesar").src = t.src; modalGambar.classList.add("open"); }
  const id = t.dataset.setuju || t.dataset.tolak;
  if (id) putuskan(daftar.find(z => z.id === id), !!t.dataset.setuju, t);
});
muat();

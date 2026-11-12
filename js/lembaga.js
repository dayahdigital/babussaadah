// Profil Dayah (Super Admin): nama, alamat, pejabat penanda tangan, logo & foto.
// Gambar diperkecil di browser lalu disimpan di Firestore (config/tampilan).
import { db, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, serverTimestamp, collection } from "./firebase.js";
import { hitungSholat, jamDariMenit, NAMA_WAKTU, LOKASI_BAWAAN } from "./sholat.js";
import { MODEL } from "./jadwal-tampil.js";
import { requireAuth, AKSES, ambilTampilan, simpan, toast, aksi, catatLog, gambarKecil, tampilError, logoDayah, pasangTema, ambilLokasi, today, unitIdAktif } from "./common.js";
import { backfillUnitInduk } from "./migrasi-v4.js";

await requireAuth(AKSES.lembaga);
const form = document.getElementById("formLembaga");
let data = await ambilTampilan();
const TEKS = ["nama", "namaArab", "alamat", "tagline", "pimpinan", "bendahara"];

function pratinjau() {
  document.getElementById("pvLogo").innerHTML = `<img src="${logoDayah(data)}" alt="">`;
  document.getElementById("pvFoto").style.backgroundImage = data.foto ? `url("${data.foto}")` : "";
}
TEKS.forEach(k => form[k].value = data[k] || "");
form.modelJadwal.innerHTML = MODEL.map(m => `<option value="${m.id}">${m.label}</option>`).join("");
form.modelJadwal.value = data.modelJadwal || "roster";
pratinjau();
(form.querySelector(`input[name=tema][value="${data.tema || "hijau"}"]`) || form.tema[0]).checked = true;
form.querySelectorAll("input[name=tema]").forEach(r => r.onchange = () => pasangTema(r.value));

// ---- Jadwal sholat ----
const $ = (id) => document.getElementById(id);
const sh = data.sholat || {};
$("shKota").value = sh.kota || "";
$("shLat").value = Number.isFinite(sh.lat) ? sh.lat : "";
$("shLng").value = Number.isFinite(sh.lng) ? sh.lng : "";
$("shLampu").value = Number.isFinite(sh.lampu) ? sh.lampu : 15;
$("shKoreksi").innerHTML = NAMA_WAKTU.map(w => `<div class="field"><label>${w.nama} (± menit)</label><input type="number" min="-30" max="30" data-koreksi="${w.id}" value="${Number(sh.koreksi?.[w.id]) || 0}"></div>`).join("");
const angka = (id) => parseFloat(String($(id).value).replace(",", "."));
function bacaSholat() {
  const lat = angka("shLat"), lng = angka("shLng");
  const ada = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const koreksi = {};
  document.querySelectorAll("[data-koreksi]").forEach(i => { const v = Math.max(-30, Math.min(30, parseInt(i.value) || 0)); if (v) koreksi[i.dataset.koreksi] = v; });
  return { kota: $("shKota").value.trim(), ...(ada ? { lat, lng } : {}), lampu: Math.max(1, Math.min(60, parseInt($("shLampu").value) || 15)), koreksi };
}
function pratinjauSholat() {
  const s = bacaSholat();
  const j = hitungSholat(today(), { lat: s.lat ?? LOKASI_BAWAAN.lat, lng: s.lng ?? LOKASI_BAWAAN.lng, koreksi: s.koreksi });
  $("shPratinjau").innerHTML = `<small class="muted" style="width:100%">Hari ini${s.lat == null ? " (lokasi bawaan Banda Aceh)" : ""}:</small>` + NAMA_WAKTU.map(w => `<span>${w.nama} <b>${jamDariMenit(j[w.id])}</b></span>`).join("");
}
["shLat", "shLng"].forEach(id => $(id).addEventListener("change", pratinjauSholat));
$("shKoreksi").addEventListener("change", pratinjauSholat);
pratinjauSholat();
$("shLokasiSaya").onclick = (e) => aksi(e.target, async () => {
  const p = await ambilLokasi();
  $("shLat").value = p.lat; $("shLng").value = p.lng;
  $("shInfo").textContent = `Akurasi ±${p.akurasi} m`;
  pratinjauSholat();
}, "Mencari lokasi...");
$("shSamakan").onclick = (e) => aksi(e.target, async () => {
  const c = await getDoc(doc(db, "config", "absensi"));
  const L = c.exists() ? c.data().lokasi : null;
  if (!L || !Number.isFinite(L.lat)) throw new Error("Lokasi GPS absen belum diatur (menu Absensi → Pengaturan sesi).");
  $("shLat").value = L.lat; $("shLng").value = L.lng;
  pratinjauSholat();
}, "Mengambil...");

document.getElementById("fileLogo").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { data.logo = await gambarKecil(f, 256, 150000, "image/png").catch(() => gambarKecil(f, 256, 150000)); pratinjau(); }
  catch (ex) { tampilError(ex); }
};
document.getElementById("fileFoto").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { data.foto = await gambarKecil(f, 1600, 700000); pratinjau(); } catch (ex) { tampilError(ex); }
};
document.getElementById("hapusLogo").onclick = () => { data.logo = ""; pratinjau(); };
document.getElementById("hapusFoto").onclick = () => { data.foto = ""; pratinjau(); };

form.addEventListener("submit", (e) => {
  e.preventDefault();
  TEKS.forEach(k => data[k] = form[k].value.trim());
  data.modelJadwal = form.modelJadwal.value;
  data.sholat = bacaSholat();
  data.tema = form.querySelector("input[name=tema]:checked")?.value || "hijau";
  aksi(document.getElementById("btnSimpan"), async () => {
    await setDoc(doc(db, "config", "tampilan"), { ...data, diubah: serverTimestamp() });
    simpan.set("tampilan", data);
    catatLog("Pengaturan", "Ubah profil dayah", `${data.nama} · pimpinan ${data.pimpinan} · bendahara ${data.bendahara}`);
    toast("Profil dayah tersimpan");
    setTimeout(() => location.reload(), 700);
  });
});


// UI Unit Dayah: hanya Super Admin yang dapat membuat/mengubah status unit.
const tbodyUnit = document.getElementById("daftarUnit");
async function muatUnit() {
  if (!tbodyUnit) return;
  const snap = await getDocs(collection(db, "units")).catch(() => ({ docs: [] }));
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (!rows.some(x => x.id === "unit-induk")) rows.unshift({ id: "unit-induk", nama: "Unit Induk (data lama)", aktif: true });
  tbodyUnit.innerHTML = rows.map(u => `<tr><td>${u.nama || u.id}</td><td><code>${u.id}</code></td><td>${u.aktif !== false ? "Aktif" : "Nonaktif"}</td><td>${u.id === "unit-induk" ? "—" : `<button class="btn btn-sm btn-sec" data-unit="${u.id}" data-aktif="${u.aktif !== false}">${u.aktif !== false ? "Nonaktifkan" : "Aktifkan"}</button>`}</td></tr>`).join("");
  tbodyUnit.querySelectorAll("button[data-unit]").forEach(b => b.onclick = async () => { await updateDoc(doc(db, "units", b.dataset.unit), { aktif: b.dataset.aktif !== "true", diubah: serverTimestamp() }); await muatUnit(); });
}
await muatUnit();
document.getElementById("btnTambahUnit")?.addEventListener("click", () => { const f = document.getElementById("formUnit"); f.hidden = !f.hidden; });
document.getElementById("btnSimpanUnit")?.addEventListener("click", () => aksi(document.getElementById("btnSimpanUnit"), async () => {
  const id = document.getElementById("unitId").value.trim().toLowerCase(); const nama = document.getElementById("unitNama").value.trim();
  if (!/^[a-z0-9-]{2,40}$/.test(id) || !nama) throw new Error("Nama dan ID unit wajib diisi; ID hanya huruf kecil, angka, dan tanda hubung.");
  await setDoc(doc(db, "units", id), { unitId: id, nama, aktif: true, dibuat: serverTimestamp() });
  toast("Unit ditambahkan"); document.getElementById("formUnit").hidden = true; await muatUnit();
}));
document.getElementById("btnMigrasiV4")?.addEventListener("click", () => aksi(document.getElementById("btnMigrasiV4"), async () => {
  const r = await backfillUnitInduk({ onProgress: x => console.info("Backfill", x) });
  toast(`Backfill selesai: ${r.diubah} dokumen ditandai unit-induk`);
}, "Memigrasikan..."));

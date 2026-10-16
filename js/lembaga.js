// Profil Dayah (Super Admin): nama, alamat, pejabat penanda tangan, logo & foto.
// Gambar diperkecil di browser lalu disimpan di Firestore (config/tampilan).
import { db, doc, setDoc, getDoc, serverTimestamp } from "./firebase.js";
import { hitungSholat, jamDariMenit, NAMA_WAKTU, LOKASI_BAWAAN } from "./sholat.js";
import { MODEL } from "./jadwal-tampil.js";
import { requireAuth, AKSES, ambilTampilan, simpan, toast, aksi, catatLog, gambarKecil, tampilError, logoDayah, pasangTema, ambilLokasi, today } from "./common.js";

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

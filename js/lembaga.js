// Profil Dayah (Super Admin): nama, alamat, pejabat penanda tangan, logo & foto.
// Gambar diperkecil di browser lalu disimpan di Firestore (config/tampilan).
import { db, doc, setDoc, serverTimestamp } from "./firebase.js";
import { requireAuth, AKSES, ambilTampilan, simpan, toast, aksi, catatLog, gambarKecil, tampilError, esc } from "./common.js";

await requireAuth(AKSES.lembaga);
const form = document.getElementById("formLembaga");
let data = await ambilTampilan();
const TEKS = ["nama", "alamat", "tagline", "pimpinan", "bendahara"];

function pratinjau() {
  document.getElementById("pvLogo").innerHTML = data.logo ? `<img src="${data.logo}" alt="">` : `<span>☪</span>`;
  document.getElementById("pvFoto").style.backgroundImage = data.foto ? `url("${data.foto}")` : "";
}
TEKS.forEach(k => form[k].value = data[k] || "");
pratinjau();

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
  aksi(document.getElementById("btnSimpan"), async () => {
    await setDoc(doc(db, "config", "tampilan"), { ...data, diubah: serverTimestamp() });
    simpan.set("tampilan", data);
    catatLog("Pengaturan", "Ubah profil dayah", `${data.nama} · pimpinan ${data.pimpinan} · bendahara ${data.bendahara}`);
    toast("Profil dayah tersimpan");
    setTimeout(() => location.reload(), 700);
  });
});

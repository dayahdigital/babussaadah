// Profil Dayah (Super Admin): nama, alamat, logo & foto untuk halaman login, header, dan slip gaji.
// Gambar diperkecil di browser lalu disimpan di Firestore (config/tampilan), jadi tidak perlu Firebase Storage.
import { db, doc, setDoc, serverTimestamp } from "./firebase.js?v=2.0.2";
import { requireAuth, AKSES, ambilTampilan, simpan, toast, perkecilGambar } from "./common.js?v=2.0.2";

const { profil } = await requireAuth(AKSES.lembaga);

const form = document.getElementById("formLembaga");
let data = await ambilTampilan();

const BATAS_FOTO = 700 * 1024;   // dokumen Firestore maksimal 1 MB
const BATAS_LOGO = 150 * 1024;

function isi() {
  form.nama.value = data.nama || "";
  form.alamat.value = data.alamat || "";
  form.tagline.value = data.tagline || "";
  form.bendahara.value = data.bendahara || "";
  pratinjau();
}

function pratinjau() {
  const logoHtml = data.logo ? `<img src="${data.logo}" alt="">` : `<span>☪</span>`;
  document.getElementById("pvLogo").innerHTML = logoHtml;
  document.getElementById("pvLogo2").innerHTML = logoHtml;
  document.getElementById("pvFoto").style.backgroundImage = data.foto ? `url("${data.foto}")` : "";
  document.getElementById("pvNama").textContent = form.nama.value || "Nama dayah";
  document.getElementById("pvAlamat").textContent = form.alamat.value;
  document.getElementById("pvTagline").textContent = form.tagline.value;
}
form.addEventListener("input", pratinjau);

// Perkecil sampai ukurannya di bawah batas
async function olah(file, maxSisi, batas, tipe) {
  for (const [sisi, q] of [[maxSisi, 0.82], [maxSisi * 0.8, 0.72], [maxSisi * 0.6, 0.65], [maxSisi * 0.45, 0.6]]) {
    const url = await perkecilGambar(file, Math.round(sisi), q, tipe);
    if (url.length <= batas) return url;
  }
  throw new Error("Gambar terlalu besar, coba gambar lain.");
}

document.getElementById("fileLogo").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    // PNG agar latar transparan logo tetap terjaga
    data.logo = await olah(f, 256, BATAS_LOGO, "image/png").catch(() => olah(f, 256, BATAS_LOGO, "image/jpeg"));
    pratinjau();
  } catch (ex) { toast(ex.message, "err"); }
};
document.getElementById("fileFoto").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { data.foto = await olah(f, 1600, BATAS_FOTO, "image/jpeg"); pratinjau(); }
  catch (ex) { toast(ex.message, "err"); }
};
document.getElementById("hapusLogo").onclick = () => { data.logo = ""; document.getElementById("fileLogo").value = ""; pratinjau(); };
document.getElementById("hapusFoto").onclick = () => { data.foto = ""; document.getElementById("fileFoto").value = ""; pratinjau(); };

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("btnSimpan");
  btn.disabled = true; btn.textContent = "Menyimpan...";
  data = {
    ...data,
    nama: form.nama.value.trim(), alamat: form.alamat.value.trim(),
    tagline: form.tagline.value.trim(), bendahara: form.bendahara.value.trim()
  };
  try {
    await setDoc(doc(db, "config", "tampilan"), { ...data, diubah: serverTimestamp(), oleh: profil.username });
    simpan.set("tampilan", data);
    toast("Profil dayah tersimpan");
    setTimeout(() => location.reload(), 800);   // muat ulang agar logo di header ikut berganti
  } catch (ex) {
    toast("Gagal menyimpan: " + (ex.code || ex.message), "err");
  } finally { btn.disabled = false; btn.textContent = "Simpan"; }
});

isi();

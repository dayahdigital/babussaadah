// Membuat Super Admin pertama. Aturan Firestore hanya mengizinkan ini selama config/setup belum ada.
import { auth, db, createUserWithEmailAndPassword, signOut, doc, getDoc, writeBatch, serverTimestamp } from "./firebase.js";
import { normUsername, usernameValid, buatEmail, pasangFooter, pesanError, siapkanHalamanPublik, tampilanCache, simpan } from "./common.js";

siapkanHalamanPublik();
pasangFooter();
const t = tampilanCache();
if (t.logo) document.getElementById("logo").innerHTML = `<img src="${t.logo}" alt="">`;

const form = document.getElementById("formSetup");
const err = document.getElementById("err");
const btn = document.getElementById("btnBuat");

const setup = await getDoc(doc(db, "config", "setup")).catch(() => null);
if (setup?.exists()) document.getElementById("sudah").hidden = false;
else form.hidden = false;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.textContent = "";
  const u = normUsername(form.username.value);
  if (!usernameValid(u)) return err.textContent = "Username tidak valid.";
  if (form.password.value !== form.password2.value) return err.textContent = "Kata sandi tidak sama.";

  btn.disabled = true; btn.textContent = "Membuat...";
  let akun = null;
  try {
    const email = buatEmail(u);
    akun = (await createUserWithEmailAndPassword(auth, email, form.password.value)).user;
    const b = writeBatch(db);
    const profil = { uid: akun.uid, username: u, nama: form.nama.value.trim(), role: "superadmin", aktif: true, email };
    b.set(doc(db, "users", akun.uid), { ...profil, dibuat: serverTimestamp(), dibuatOleh: "setup" });
    b.set(doc(db, "usernames", u), { uid: akun.uid, email });
    b.set(doc(db, "config", "setup"), { selesai: true, waktu: serverTimestamp() });
    await b.commit();
    simpan.set("profil", profil, true);
    form.hidden = true;
    document.getElementById("selesai").hidden = false;
    document.getElementById("l2").classList.add("aktif");
  } catch (ex) {
    if (akun) { await akun.delete().catch(() => {}); await signOut(auth).catch(() => {}); }
    err.textContent = ex.code === "permission-denied" ? "Setup sudah pernah dilakukan." : pesanError(ex);
    btn.disabled = false; btn.textContent = "Buat Super Admin";
  }
});

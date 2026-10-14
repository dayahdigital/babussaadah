// Membuat Super Admin pertama. Aturan Firestore hanya mengizinkan ini selama config/setup belum ada.
import {
  auth, db, createUserWithEmailAndPassword, signOut, doc, getDoc, writeBatch, serverTimestamp
} from "./firebase.js?v=2.0.2";
import { normUsername, usernameValid, buatEmail, pasangFooter } from "./common.js?v=2.0.2";

pasangFooter();

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
    b.set(doc(db, "users", akun.uid), {
      uid: akun.uid, username: u, nama: form.nama.value.trim(), role: "superadmin",
      aktif: true, email, dibuat: serverTimestamp(), dibuatOleh: "setup"
    });
    b.set(doc(db, "usernames", u), {
      uid: akun.uid, email, nama: form.nama.value.trim(), role: "superadmin", aktif: true
    });
    b.set(doc(db, "config", "setup"), { selesai: true, oleh: u, waktu: serverTimestamp() });
    await b.commit();
    location.replace("dashboard.html");
  } catch (ex) {
    // Gagal menulis profil (mis. setup sudah dilakukan orang lain) → hapus akun yang terlanjur dibuat
    if (akun) { await akun.delete().catch(() => {}); await signOut(auth).catch(() => {}); }
    err.textContent = ex.code === "permission-denied"
      ? "Setup sudah pernah dilakukan."
      : "Gagal: " + (ex.code || ex.message);
    btn.disabled = false; btn.textContent = "Buat Super Admin";
  }
});

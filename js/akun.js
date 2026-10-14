import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "./firebase.js?v=2.0.2";
import { requireAuth, PERAN, toast } from "./common.js?v=2.0.2";

const { user, profil } = await requireAuth();

document.getElementById("aNama").textContent = profil.nama;
document.getElementById("aUser").textContent = profil.username;
document.getElementById("aPeran").textContent = PERAN[profil.role] || profil.role;

const form = document.getElementById("formSandi");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (form.baru.value !== form.baru2.value) return toast("Kata sandi baru tidak sama.", "err");
  const btn = form.querySelector("button");
  btn.disabled = true;
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, form.lama.value));
    await updatePassword(user, form.baru.value);
    form.reset();
    toast("Kata sandi berhasil diganti");
  } catch (ex) {
    toast(ex.code === "auth/invalid-credential" || ex.code === "auth/wrong-password"
      ? "Kata sandi lama salah."
      : ex.code === "auth/weak-password" ? "Kata sandi minimal 6 karakter." : "Gagal: " + ex.code, "err");
  } finally { btn.disabled = false; }
});

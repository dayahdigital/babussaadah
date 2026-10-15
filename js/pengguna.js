// Kelola pengguna — khusus Super Admin.
// Akun teungku ditautkan dua arah: users.guruId ↔ guru.uidAkun/usernameAkun.
// Hapus & reset: akun lama ditutup dan disembunyikan dari daftar.
import { db, buatAkunAuth, collection, doc, getDoc, getDocs, updateDoc, setDoc, writeBatch, serverTimestamp, deleteField } from "./firebase.js";
import { requireAuth, AKSES, PERAN, normUsername, usernameValid, buatEmail, toast, esc, aksi, tampilError, catatLog } from "./common.js";

const { profil: saya } = await requireAuth(AKSES.pengguna);
const tb = document.getElementById("tbUser");
const mUser = document.getElementById("modalUser");
const mReset = document.getElementById("modalReset");
const fUser = document.getElementById("formUser");
const fReset = document.getElementById("formReset");
let daftar = [], dataGuru = [], editUid = null, resetUid = null;

const superAktif = () => daftar.filter(u => u.role === "superadmin" && u.aktif).length;
const namaGuru = (id) => dataGuru.find(g => g.id === id)?.nama;

async function muat() {
  try {
    const [snap, gSnap, uSnap] = await Promise.all([getDocs(collection(db, "users")), getDocs(collection(db, "guru")), getDocs(collection(db, "usernames"))]);
    daftar = snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => !u.dihapus).sort((a, b) => (a.nama || "").localeCompare(b.nama || ""));
    dataGuru = gSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nama.localeCompare(b.nama));
    tampil();
    // Rapikan data lama: koleksi usernames hanya boleh berisi uid & email (tanpa nama/peran)
    const kotor = uSnap.docs.filter(d => Object.keys(d.data()).some(k => !["uid", "email"].includes(k)));
    if (kotor.length) { const b = writeBatch(db); kotor.forEach(d => b.set(d.ref, { uid: d.data().uid, email: d.data().email })); await b.commit(); }
  } catch (ex) { tampilError(ex, "Gagal memuat pengguna"); }
}

function isiPilihanGuru(saatIni = "") {
  const terpakai = new Set(daftar.filter(u => u.role === "guru" && u.guruId && u.guruId !== saatIni).map(u => u.guruId));
  fUser.guruId.innerHTML = `<option value="">— pilih teungku —</option>` +
    dataGuru.filter(g => !terpakai.has(g.id)).map(g => `<option value="${g.id}">${esc(g.nama)}${g.jabatan ? " · " + esc(g.jabatan) : ""}</option>`).join("");
  fUser.guruId.value = saatIni;
}
const aturBoxGuru = () => {
  const isGuru = fUser.role.value === "guru";
  document.getElementById("boxGuru").hidden = !isGuru;
  fUser.guruId.required = isGuru;
};
fUser.role.addEventListener("change", aturBoxGuru);
fUser.guruId.addEventListener("change", () => { if (!fUser.nama.value.trim()) fUser.nama.value = namaGuru(fUser.guruId.value) || ""; });

function tampil() {
  const q = document.getElementById("cari").value.toLowerCase();
  const rows = daftar.filter(u => `${u.nama} ${u.username}`.toLowerCase().includes(q));
  tb.innerHTML = rows.length ? rows.map(u => {
    const saya_ = u.uid === saya.uid;
    return `<tr>
      <td class="utama">${esc(u.nama)}${saya_ ? ' <small class="muted">(Anda)</small>' : ""}</td>
      <td>@${esc(u.username)}</td>
      <td>${PERAN[u.role] || u.role}${u.role === "guru" ? `<br><small class="muted">${u.guruId && namaGuru(u.guruId) ? "→ " + esc(namaGuru(u.guruId)) : "⚠ belum ditautkan"}</small>` : ""}</td>
      <td><span class="badge ${u.aktif ? "b-in" : "b-out"}">${u.aktif ? "✔ Aktif" : "✖ Nonaktif"}</span></td>
      <td class="aksi-sel"><div class="aksi"><button class="btn btn-sm btn-sec" data-ubah="${u.uid}">Ubah</button>
        ${saya_ ? "" : `<button class="btn btn-sm btn-sec" data-reset="${u.uid}">Reset sandi</button>
          <button class="btn btn-sm btn-sec" data-toggle="${u.uid}">${u.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
          <button class="btn btn-sm btn-red" data-hapus="${u.uid}">Hapus</button>`}</div></td></tr>`;
  }).join("") : `<tr><td colspan="5" class="empty">Tidak ada pengguna.</td></tr>`;
}

function bukaForm(u = null) {
  editUid = u?.uid || null;
  fUser.reset();
  document.getElementById("judulUser").textContent = u ? "Ubah Pengguna" : "Tambah Pengguna";
  document.getElementById("boxSandi").hidden = !!u;
  fUser.password.required = !u;
  fUser.username.disabled = !!u;
  if (u) { fUser.nama.value = u.nama; fUser.username.value = u.username; fUser.role.value = u.role; }
  isiPilihanGuru(u?.guruId || "");
  aturBoxGuru();
  fUser.role.disabled = u?.uid === saya.uid;
  mUser.classList.add("open");
}

// Tautan dua arah dengan data teungku
function tautkan(b, uid, username, guruBaru, guruLama) {
  if (guruLama && guruLama !== guruBaru && dataGuru.some(g => g.id === guruLama))
    b.update(doc(db, "guru", guruLama), { uidAkun: deleteField(), usernameAkun: deleteField() });
  if (guruBaru && dataGuru.some(g => g.id === guruBaru)) b.update(doc(db, "guru", guruBaru), { uidAkun: uid, usernameAkun: username });
}

fUser.addEventListener("submit", (e) => {
  e.preventDefault();
  const nama = fUser.nama.value.trim();
  const role = fUser.role.value;
  const guruId = role === "guru" ? fUser.guruId.value : null;
  aksi(document.getElementById("btnSimpanUser"), async () => {
    if (role === "guru" && !guruId) throw new Error("Pilih data teungku yang ditautkan.");
    if (editUid) {
      const lama = daftar.find(x => x.uid === editUid);
      if (lama.role === "superadmin" && role !== "superadmin" && superAktif() <= 1) throw new Error("Harus ada minimal satu Super Admin aktif.");
      const b = writeBatch(db);
      b.update(doc(db, "users", editUid), { nama, ...(editUid === saya.uid ? {} : { role, guruId }), diubah: serverTimestamp() });
      if (editUid !== saya.uid) tautkan(b, editUid, lama.username, guruId, lama.guruId);
      await b.commit();
      catatLog("Pengguna", "Ubah", `@${lama.username}: ${lama.nama}→${nama}, ${PERAN[lama.role]}→${PERAN[role]}`);
      toast("Pengguna diperbarui");
    } else {
      const u = normUsername(fUser.username.value);
      if (!usernameValid(u)) throw new Error("Username tidak valid (3–20 karakter: huruf kecil, angka, titik, garis bawah).");
      if ((await getDoc(doc(db, "usernames", u))).exists()) throw new Error("Username sudah dipakai.");
      const email = buatEmail(u);
      const uid = await buatAkunAuth(email, fUser.password.value);
      const b = writeBatch(db);
      b.set(doc(db, "users", uid), { uid, username: u, nama, role, guruId, aktif: true, email, dibuat: serverTimestamp(), dibuatOleh: saya.username });
      b.set(doc(db, "usernames", u), { uid, email });
      tautkan(b, uid, u, guruId, null);
      await b.commit();
      catatLog("Pengguna", "Tambah", `@${u} (${PERAN[role]}) ${nama}`);
      toast(`Pengguna @${u} dibuat`);
    }
    mUser.classList.remove("open");
    muat();
  });
});

// Reset sandi: akun baru untuk username yang sama; akun lama ditutup & disembunyikan
fReset.addEventListener("submit", (e) => {
  e.preventDefault();
  const lama = daftar.find(x => x.uid === resetUid);
  aksi(document.getElementById("btnReset"), async () => {
    const email = buatEmail(lama.username);
    const uidBaru = await buatAkunAuth(email, fReset.password.value);
    const { uid, ...data } = lama;
    const b = writeBatch(db);
    b.set(doc(db, "users", uidBaru), { ...data, uid: uidBaru, email, diubah: serverTimestamp() });
    b.update(doc(db, "users", uid), { aktif: false, dihapus: true, digantiOleh: uidBaru });
    b.set(doc(db, "usernames", lama.username), { uid: uidBaru, email });
    if (lama.guruId) tautkan(b, uidBaru, lama.username, lama.guruId, null);
    await b.commit();
    catatLog("Pengguna", "Reset sandi", `@${lama.username}`);
    mReset.classList.remove("open");
    toast(`Kata sandi @${lama.username} sudah direset`);
    muat();
  });
});

tb.addEventListener("click", (e) => {
  const ds = e.target.dataset;
  const u = daftar.find(x => x.uid === (ds.ubah || ds.reset || ds.toggle || ds.hapus));
  if (!u) return;
  if (ds.ubah) bukaForm(u);
  if (ds.reset) {
    resetUid = u.uid; fReset.reset();
    document.getElementById("judulReset").textContent = "Reset Kata Sandi — @" + u.username;
    mReset.classList.add("open");
  }
  if (ds.toggle) {
    if (u.aktif && u.role === "superadmin" && superAktif() <= 1) return toast("Harus ada minimal satu Super Admin aktif.", "err");
    aksi(e.target, async () => {
      await updateDoc(doc(db, "users", u.uid), { aktif: !u.aktif });
      catatLog("Pengguna", u.aktif ? "Nonaktifkan" : "Aktifkan", `@${u.username}`);
      toast(u.aktif ? "Pengguna dinonaktifkan" : "Pengguna diaktifkan");
      muat();
    });
  }
  if (ds.hapus) {
    if (u.role === "superadmin" && u.aktif && superAktif() <= 1) return toast("Harus ada minimal satu Super Admin aktif.", "err");
    if (!confirm(`Hapus pengguna @${u.username}? Ia tidak bisa login lagi dan username bisa dipakai ulang.`)) return;
    aksi(e.target, async () => {
      const b = writeBatch(db);
      b.update(doc(db, "users", u.uid), { aktif: false, dihapus: true });
      b.delete(doc(db, "usernames", u.username));
      if (u.guruId) tautkan(b, null, null, null, u.guruId);
      await b.commit();
      catatLog("Pengguna", "Hapus", `@${u.username} (${PERAN[u.role]})`);
      toast("Pengguna dihapus");
      muat();
    }, "Menghapus...");
  }
});

document.querySelectorAll("[data-tutup]").forEach(b => b.onclick = () => b.closest(".modal").classList.remove("open"));
document.getElementById("btnTambah").onclick = () => bukaForm();
document.getElementById("cari").oninput = tampil;
muat();

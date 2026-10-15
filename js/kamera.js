// Kamera selfie live (kamera depan). Mengembalikan foto JPEG kecil (data URL) atau null bila dibatalkan.
// Bila browser tidak mendukung kamera live, memakai kamera bawaan HP (input file dengan capture).

const UKURAN = 360;      // sisi terpanjang foto (px)
const KUALITAS = 0.6;    // ±15–30 KB

export function ambilSelfie({ judul = "Foto selfie", keterangan = "" } = {}) {
  return new Promise((resolve) => {
    const m = document.createElement("div");
    m.className = "modal open";
    m.innerHTML = `<div class="box" style="max-width:440px">
      <h2>📷 ${judul}</h2>
      ${keterangan ? `<p class="muted kecil" style="margin-top:0">${keterangan}</p>` : ""}
      <div class="kamera" id="kmWadah"><video id="kmVideo" autoplay playsinline muted></video><div class="bingkai"></div></div>
      <p class="error" id="kmErr"></p>
      <input type="file" id="kmFile" accept="image/*" capture="user" hidden>
      <div class="modal-actions">
        <button type="button" class="btn btn-sec" id="kmBatal">Batal</button>
        <button type="button" class="btn btn-sec" id="kmUlang" hidden>Ulangi</button>
        <button type="button" class="btn" id="kmAmbil">📸 Ambil foto</button>
        <button type="button" class="btn" id="kmPakai" hidden>Gunakan foto ini</button>
      </div></div>`;
    document.body.appendChild(m);
    const $ = (id) => m.querySelector("#" + id);
    const video = $("kmVideo");
    let stream = null, hasil = null;

    const selesai = (nilai) => { stream?.getTracks().forEach(t => t.stop()); m.remove(); resolve(nilai); };
    const tampilHasil = (url) => {
      hasil = url;
      $("kmWadah").innerHTML = `<img src="${url}" alt="Selfie">`;
      $("kmAmbil").hidden = true; $("kmUlang").hidden = false; $("kmPakai").hidden = false;
      stream?.getTracks().forEach(t => t.stop()); stream = null;
    };
    const dariSumber = (src, w, h, cermin) => {
      const s = Math.min(1, UKURAN / Math.max(w, h));
      const c = document.createElement("canvas");
      c.width = Math.round(w * s); c.height = Math.round(h * s);
      const ctx = c.getContext("2d");
      if (cermin) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(src, 0, 0, c.width, c.height);
      // cap waktu pada foto
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const teks = new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
      ctx.font = "bold 13px sans-serif";
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, c.height - 22, c.width, 22);
      ctx.fillStyle = "#fff"; ctx.fillText(teks, 8, c.height - 7);
      return c.toDataURL("image/jpeg", KUALITAS);
    };

    async function mulai() {
      $("kmErr").textContent = "";
      if (!navigator.mediaDevices?.getUserMedia) { $("kmFile").click(); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 } }, audio: false });
        if (!$("kmVideo")) $("kmWadah").innerHTML = `<video id="kmVideo" autoplay playsinline muted></video><div class="bingkai"></div>`;
        $("kmVideo").srcObject = stream;
      } catch (ex) {
        $("kmErr").textContent = ex.name === "NotAllowedError"
          ? "Izin kamera ditolak. Buka pengaturan browser → izinkan Kamera untuk situs ini, lalu coba lagi."
          : "Kamera tidak bisa dibuka (" + (ex.name || ex.message) + "). Memakai kamera bawaan HP…";
        if (ex.name !== "NotAllowedError") $("kmFile").click();
      }
    }

    $("kmAmbil").onclick = () => {
      const v = $("kmVideo");
      if (!v?.videoWidth) { $("kmErr").textContent = "Kamera belum siap, tunggu sebentar."; return; }
      tampilHasil(dariSumber(v, v.videoWidth, v.videoHeight, true));
    };
    $("kmFile").onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => { tampilHasil(dariSumber(img, img.width, img.height, false)); URL.revokeObjectURL(img.src); };
      img.src = URL.createObjectURL(f);
    };
    $("kmUlang").onclick = () => {
      $("kmAmbil").hidden = false; $("kmUlang").hidden = true; $("kmPakai").hidden = true;
      $("kmWadah").innerHTML = `<video id="kmVideo" autoplay playsinline muted></video><div class="bingkai"></div>`;
      mulai();
    };
    $("kmPakai").onclick = () => selesai(hasil);
    $("kmBatal").onclick = () => selesai(null);
    mulai();
  });
}

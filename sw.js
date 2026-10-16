// Service worker Dayah Babussa'adah
// - File aplikasi: ambil dari jaringan dulu (selalu terbaru), simpan cadangan untuk saat offline.
// - Pustaka (vendor, Firebase SDK): dari cache dulu (jarang berubah).
// Jadi setelah pembaruan, HP tidak tersangkut di file lama — tanpa perlu "?v=".
const VERSI = "__BUILD__";
const CACHE = "babussaadah-" + VERSI;
const INTI = [
  "./", "index.html", "dashboard.html", "absen-saya.html", "absensi.html", "jadwal-mengajar.html", "izin.html",
  "teungku.html", "mukafaah.html", "kas.html", "pengumuman.html", "pengguna.html", "lembaga.html", "log.html",
  "backup.html", "akun.html", "panduan.html", "css/style.css", "manifest.webmanifest", "icons/icon-192.png", "icons/logo-dayah.png", "icons/favicon-48.png", "icons/apple-touch-icon.png",
  "js/common.js", "js/firebase.js", "js/firebase-config.js", "js/pengaturan.js", "js/beranda.js", "js/jadwal-tampil.js", "js/jadwal-teungku.js", "js/sholat.js", "jadwal-teungku.html", "js/kamera.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(INTI.map(u => c.add(new Request(u, { cache: "reload" }))))));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("babussaadah-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sendiri = url.origin === self.location.origin;
  const pustaka = (sendiri && url.pathname.includes("/js/vendor/")) || url.hostname === "www.gstatic.com" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!sendiri && !pustaka) return;      // Firestore, Google API, dll. langsung ke jaringan

  if (pustaka) {
    e.respondWith(caches.match(req).then(c => c || fetch(req).then(r => {
      if (r.ok) { const salin = r.clone(); caches.open(CACHE).then(cc => cc.put(req, salin)); }
      return r;
    })));
    return;
  }
  // Jaringan dulu (dengan validasi ulang ke server), cadangan dari cache bila offline
  e.respondWith(fetch(req, { cache: "no-cache" }).then(r => {
    if (r.ok) { const salin = r.clone(); caches.open(CACHE).then(c => c.put(req, salin)); }
    return r;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(c => c || (req.mode === "navigate" ? caches.match("index.html") : undefined))));
});

// Klik notifikasi → buka halaman terkait
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const tujuan = e.notification.data || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
    const w = ws.find(x => x.url.includes(self.location.origin));
    if (w) { w.navigate(tujuan).catch(() => {}); return w.focus(); }
    return self.clients.openWindow(tujuan);
  }));
});

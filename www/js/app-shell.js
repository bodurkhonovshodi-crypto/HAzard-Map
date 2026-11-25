// App shell: makes the same pages work as an installable web app (PWA) and as the Android app.
// Load it after js/common.js and before the page script (home.js, data-page.js, …).
//
//  • In a browser:      registers the service worker (sw.js) so the app installs and works offline.
//  • In the Android app (Capacitor):
//      - alerts use real phone notifications (Local Notifications plugin) instead of the browser Notification API,
//      - "download" buttons save the file and open the Android share sheet (save to Files/Drive, send by Telegram …),
//      - links with a download attribute (map images) are saved the same way.
(function () {
  const Cap = window.Capacitor;
  const NATIVE = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  window.PHW_NATIVE = NATIVE;
  document.documentElement.classList.toggle("is-app", NATIVE);

  // ---------- web: service worker ----------
  if (!NATIVE && "serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(err => console.warn("Service worker not registered:", err));
    });
    return;
  }
  if (!NATIVE) return;

  const P = Cap.Plugins || {};

  // ---------- Android: notifications ----------
  // home.js uses: "Notification" in window, Notification.permission, Notification.requestPermission(), new Notification(title, {body})
  if (P.LocalNotifications) {
    const LN = P.LocalNotifications;
    let nextId = 1 + Math.floor(Date.now() / 1000) % 100000;
    const map = s => (s === "granted" ? "granted" : s === "denied" ? "denied" : "default");
    class AppNotification {
      constructor(title, opts = {}) {
        LN.schedule({ notifications: [{ id: nextId++, title: String(title), body: String(opts.body || ""), largeBody: String(opts.body || "") }] })
          .catch(err => console.warn("Notification failed:", err));
      }
      static async requestPermission() {
        try { AppNotification.permission = map((await LN.requestPermissions()).display); }
        catch (e) { AppNotification.permission = "denied"; }
        return AppNotification.permission;
      }
    }
    AppNotification.permission = "default";
    window.Notification = AppNotification;
    LN.checkPermissions().then(r => {
      AppNotification.permission = map(r.display);
      const nb = document.getElementById("notifyBtn");          // refresh the button label on the Map page
      if (nb && AppNotification.permission !== "default")
        nb.textContent = AppNotification.permission === "granted" ? "Phone alerts on" : "Phone alerts blocked";
    }).catch(() => {});
    document.addEventListener("DOMContentLoaded", () => {
      const nb = document.getElementById("notifyBtn");
      if (!nb) return;
      // Keep home.js labels, but say "Phone" instead of "Desktop" inside the app.
      new MutationObserver(() => {
        if (/Desktop/.test(nb.textContent)) nb.textContent = nb.textContent.replace("Desktop", "Phone");
      }).observe(nb, { childList: true, characterData: true, subtree: true });
      nb.textContent = nb.textContent.replace("Desktop", "Phone");
    });
  }

  // ---------- Android: saving files ----------
  const safeName = n => String(n || "download").replace(/[\\/:*?"<>|]+/g, "_");

  async function saveAndShare(filename, data, isBase64) {
    const { Filesystem, Share } = P;
    if (!Filesystem) throw new Error("Filesystem plugin missing");
    const opts = { path: safeName(filename), data, directory: "CACHE", recursive: true };
    if (!isBase64) opts.encoding = "utf8";
    const { uri } = await Filesystem.writeFile(opts);
    if (Share) {
      try { await Share.share({ title: filename, files: [uri], dialogTitle: "Save or send " + filename }); }
      catch (e) { if (!/cancel/i.test(String(e && e.message))) throw e; }
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  // Replace the download() helper from common.js.
  window.download = function (filename, text) {
    saveAndShare(filename, String(text), false).catch(err => alert("Could not save " + filename + ": " + (err.message || err)));
  };

  // Links like <a href="data/overlays/x.jpg" download="x.jpg">.
  document.addEventListener("click", async ev => {
    const a = ev.target.closest && ev.target.closest("a[download]");
    if (!a) return;
    ev.preventDefault();
    try {
      const res = await fetch(a.href);
      const b64 = await blobToBase64(await res.blob());
      await saveAndShare(a.getAttribute("download") || a.href.split("/").pop(), b64, true);
    } catch (err) { alert("Could not save the file: " + (err.message || err)); }
  }, true);
})();

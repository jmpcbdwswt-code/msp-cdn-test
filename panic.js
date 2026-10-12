/* ==========================================================
   panic.js  -  Panic Button
   Load this on EVERY page. Press the saved key anywhere on
   the site (even in a game) and it jumps to the saved URL.
   On index.html it also runs the settings dropdown.
   ========================================================== */
(function () {
  "use strict";
  if (window.__panicLoaded) return;
  window.__panicLoaded = true;

  var STORE = "panic:v1";
  var recording = false;

  /* ---------- saved settings (try/catch: some school browsers block storage) ---------- */

  function readCfg() {
    try {
      var c = JSON.parse(localStorage.getItem(STORE));
      return c && c.url && (c.code || c.key) ? c : null;
    } catch (e) {
      return null;
    }
  }

  function writeCfg(c) {
    try {
      if (c) localStorage.setItem(STORE, JSON.stringify(c));
      else localStorage.removeItem(STORE);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- the panic key itself ---------- */

  function go(url) {
    try {
      window.top.location.replace(url); // replace = Back button won't return to the game
    } catch (e) {
      window.location.replace(url);
    }
  }

  function onKey(e) {
    if (recording) return;
    if (e.target && e.target.closest && e.target.closest("#panic-panel")) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    var c = readCfg();
    if (!c) return;
    var hit = c.code ? e.code === c.code : e.key === c.key;
    if (!hit) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // the game never sees this key
    if (!e.repeat) go(c.url);
  }

  /* capture phase on window = runs before the game's own key handlers */
  function install() {
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("keydown", onKey, true);
  }
  install();

  /* same-origin iframes get the listener too (cross-origin ones can't be reached) */
  function hookFrames() {
    Array.prototype.forEach.call(document.querySelectorAll("iframe"), function (f) {
      function attach() {
        try {
          f.contentWindow.addEventListener("keydown", onKey, true);
        } catch (e) {}
      }
      attach();
      f.addEventListener("load", attach);
    });
  }

  /* pages that do document.open()/write() wipe listeners - put ours back */
  try {
    var origOpen = Document.prototype.open;
    Document.prototype.open = function () {
      var r = origOpen.apply(this, arguments);
      install();
      return r;
    };
  } catch (e) {}

  document.addEventListener("DOMContentLoaded", function () {
    hookFrames();
    if (window.MutationObserver) {
      new MutationObserver(hookFrames).observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
    initSettings();
    armCloak();
  });


  /* ==========================================================
     about:blank mode: opens the site inside an about:blank tab
     ========================================================== */

  var CLOAK = "cloak:v1";

  function cloakOn() {
    try { return localStorage.getItem(CLOAK) === "1"; } catch (e) { return false; }
  }
  function setCloak(on) {
    try { localStorage.setItem(CLOAK, on ? "1" : "0"); return true; } catch (e) { return false; }
  }

  function openCloak() {
    var w = null;
    try { w = window.open("about:blank", "_blank"); } catch (e) {}
    if (!w) return false;
    try {
      var d = w.document;
      d.body.style.cssText = "margin:0;height:100vh;overflow:hidden;background:#000";
      var f = d.createElement("iframe");
      f.src = location.href;
      f.allow = "fullscreen; autoplay; gamepad; clipboard-write";
      f.setAttribute("allowfullscreen", "");
      f.style.cssText = "border:0;width:100%;height:100%";
      d.body.appendChild(f);
    } catch (e) {
      try { w.close(); } catch (_) {}
      return false;
    }
    var c = readCfg();
    if (c && c.url) go(c.url); // original tab jumps to the panic link so only one copy stays open
    return true;
  }

  /* browsers only allow pop-ups after a click, so on a new visit we wait for the first click */
  function armCloak() {
    if (window.top !== window || !cloakOn() || !document.body) return;
    var bar = document.createElement("div");
    bar.textContent = "Click anywhere to open in about:blank";
    bar.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;padding:10px 16px;border-radius:999px;background:rgba(15,15,15,.9);color:#fff;font:600 14px system-ui,Arial,sans-serif;pointer-events:none";
    document.body.appendChild(bar);
    function fire(e) {
      if (e.target && e.target.closest && e.target.closest("#panic-panel,#panic-gear")) return;
      document.removeEventListener("pointerdown", fire, true);
      document.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); }, { capture: true, once: true });
      if (openCloak()) {
        bar.remove();
      } else {
        bar.textContent = "Pop-up blocked. Allow pop-ups for this site, then click again.";
        document.addEventListener("pointerdown", fire, true);
      }
    }
    document.addEventListener("pointerdown", fire, true);
  }

  /* ==========================================================
     Settings dropdown (only runs where #panic-panel exists)
     ========================================================== */

  function initSettings() {
    var gear = document.getElementById("panic-gear");
    var panel = document.getElementById("panic-panel");
    if (!gear || !panel) return;

    var closeBtn = document.getElementById("panic-close");
    var keyBtn = document.getElementById("panic-keybtn");
    var urlIn = document.getElementById("panic-url");
    var saveBtn = document.getElementById("panic-save");
    var clearBtn = document.getElementById("panic-clear");
    var msg = document.getElementById("panic-msg");

    var saved = readCfg();
    var pick = saved ? { code: saved.code, key: saved.key, label: saved.label } : null;

    function say(text, bad) {
      msg.textContent = text;
      msg.className = "panic-msg" + (bad ? " bad" : "");
    }

    function drawKey() {
      keyBtn.textContent = recording
        ? "Press any key..."
        : pick
        ? pick.label
        : "Click here, then press a key";
      keyBtn.classList.toggle("recording", recording);
    }

    function open() {
      panel.hidden = false;
      void panel.offsetWidth; // let the slide-in play
      panel.classList.add("open");
      gear.setAttribute("aria-expanded", "true");
      saved = readCfg();
      if (saved) {
        pick = { code: saved.code, key: saved.key, label: saved.label };
        urlIn.value = saved.url;
      }
      drawKey();
    }

    function close() {
      recording = false;
      drawKey();
      panel.classList.remove("open");
      gear.setAttribute("aria-expanded", "false");
      setTimeout(function () {
        if (!panel.classList.contains("open")) panel.hidden = true;
      }, 160);
    }

    gear.addEventListener("click", function () {
      panel.classList.contains("open") ? close() : open();
    });
    closeBtn.addEventListener("click", close);

    document.addEventListener("mousedown", function (e) {
      if (panel.classList.contains("open") && !panel.contains(e.target) && !gear.contains(e.target)) {
        close();
      }
    });

    /* ---------- choose the key ---------- */

    keyBtn.addEventListener("click", function () {
      recording = true;
      say("");
      drawKey();
    });

    function labelFor(e) {
      if (e.code === "Backquote") return "~  (the ` key)";
      if (e.key === " ") return "Space";
      return e.key.length === 1 ? e.key.toUpperCase() : e.key;
    }

    document.addEventListener(
      "keydown",
      function (e) {
        if (recording) {
          e.preventDefault();
          e.stopPropagation();
          if (/^(Shift|Control|Alt|Meta|CapsLock|Dead|Process)$/.test(e.key)) return;
          recording = false;
          if (e.key !== "Escape") {
            pick = { code: e.code, key: e.key, label: labelFor(e) };
          }
          keyBtn.blur();
          drawKey();
        } else if (e.key === "Escape" && panel.classList.contains("open")) {
          close();
        }
      },
      true
    );

    /* ---------- save / clear ---------- */

    function cleanUrl(text) {
      text = text.trim();
      if (!text) return null;
      if (!/^[a-z][a-z0-9+.\-]*:/i.test(text)) text = "https://" + text;
      try {
        var u = new URL(text);
        return /^https?:$/.test(u.protocol) && u.hostname.indexOf(".") > 0 ? u.href : null;
      } catch (e) {
        return null;
      }
    }

    saveBtn.addEventListener("click", function () {
      var url = cleanUrl(urlIn.value);
      if (!pick) return say("Pick a key first.", true);
      if (!url) return say("Paste a full link, like https://classroom.google.com", true);
      if (!writeCfg({ code: pick.code, key: pick.key, label: pick.label, url: url })) {
        return say("Your browser blocked saving. Try a normal (non-private) window.", true);
      }
      urlIn.value = url;
      say("Saved. Press " + pick.label.split("  ")[0] + " anywhere on the site to jump there.");
    });

    clearBtn.addEventListener("click", function () {
      writeCfg(null);
      pick = null;
      urlIn.value = "";
      drawKey();
      say("Panic button turned off.");
    });

    var tog = document.getElementById("cloak-toggle");
    var cmsg = document.getElementById("cloak-msg");
    if (tog) {
      tog.checked = cloakOn();
      tog.addEventListener("change", function () {
        cmsg.className = "panic-msg";
        if (tog.checked) {
          if (!setCloak(true)) {
            tog.checked = false;
            cmsg.className = "panic-msg bad";
            cmsg.textContent = "Your browser blocked saving. Try a normal (non-private) window.";
          } else if (openCloak()) {
            cmsg.textContent = "On. The site opened in a new about:blank tab.";
          } else {
            setCloak(false);
            tog.checked = false;
            cmsg.className = "panic-msg bad";
            cmsg.textContent = "Pop-up blocked. Allow pop-ups for this site, then turn this on again.";
          }
        } else {
          setCloak(false);
          cmsg.textContent = "Off. Close the about:blank tab to go back to the normal site.";
        }
      });
    }

    drawKey();
  }
})();
/* ==========================================================
   fx.js  -  shared by index.html, links.html and comments.html
   1. animated background (aurora, neon grid, floating icons, dot web, meteors, lightning, mouse effects)
   2. slide-in animation for things that scroll into view
   3. open/close menu for links.html and comments.html
   ========================================================== */
(function () {
  "use strict";

  var reduce =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------
     1. ANIMATED BACKGROUND
        - aurora ribbons that wave across the top
        - a glowing perspective grid that races toward you at the bottom
        - floating game icons that spin when your mouse gets close
        - a web of glowing dots that connects itself and runs away from your mouse
        - meteors with rainbow trails, pulse rings, sparkle bursts, and rare lightning
        - a rainbow sparkle trail behind your mouse, and a shockwave when you click
        It slows itself down automatically on weak computers.
     --------------------------------------------------------- */
  function toRGB(value) {
    value = String(value || "").trim();
    var m = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return parseInt(h.slice(0, 2), 16) + "," + parseInt(h.slice(2, 4), 16) + "," + parseInt(h.slice(4, 6), 16);
    }
    m = value.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    return m ? m[1] + "," + m[2] + "," + m[3] : null;
  }

  function hueRGB(deg) {
    var h = (((deg % 360) + 360) % 360) / 360, s = 0.95, l = 0.64;
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) {
      t = (t + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 0.5) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return Math.round(f(h + 1 / 3) * 255) + "," + Math.round(f(h) * 255) + "," + Math.round(f(h - 1 / 3) * 255);
  }

  function makeSprite(rgb) {
    var c = document.createElement("canvas");
    c.width = c.height = 64;
    var g = c.getContext("2d");
    var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(" + rgb + ",1)");
    grad.addColorStop(0.3, "rgba(" + rgb + ",0.6)");
    grad.addColorStop(1, "rgba(" + rgb + ",0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  /* game icons drawn once, then stamped around the page */
  function makeEmojiSprites() {
    var list = ["\uD83C\uDFAE", "\u2B50", "\uD83D\uDC7E", "\uD83D\uDD79\uFE0F", "\uD83C\uDFAF", "\uD83D\uDC8E", "\uD83C\uDFC6", "\uD83D\uDE80"];
    var out = [];
    list.forEach(function (ch) {
      var c = document.createElement("canvas");
      c.width = c.height = 64;
      var g = c.getContext("2d");
      g.font = "44px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(ch, 32, 35);
      out.push(c);
    });
    return out;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(n) { return Math.floor(Math.random() * n); }

  function startBackground() {
    if (!document.body) return;
    var host = document.querySelector(".neon-background");
    if (!host) {
      host = document.createElement("div");
      host.className = "fx-host";
      document.body.insertBefore(host, document.body.firstChild);
    }
    host.setAttribute("aria-hidden", "true");

    ["a", "b", "c"].forEach(function (k) {
      var blob = document.createElement("div");
      blob.className = "fx-blob fx-blob-" + k;
      host.appendChild(blob);
    });

    var canvas = document.createElement("canvas");
    canvas.className = "fx-canvas";
    host.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var W = 0, H = 0, quality = 2, i, j;
    var accent = "168,85,247";
    var accentSprite = makeSprite(accent);
    var whiteSprite = makeSprite("255,255,255");
    var rainbow = [], rainbowRGB = [];
    for (i = 0; i < 12; i++) {
      rainbowRGB.push(hueRGB(i * 30));
      rainbow.push(makeSprite(rainbowRGB[i]));
    }
    var emoji = makeEmojiSprites();

    var nodes = [], icons = [], rings = [], meteors = [], sparks = [], bolts = [];
    var flash = 0;
    var mouse = { x: -9999, y: -9999, on: false, last: 0 };
    var t = 0, nextMeteor = 0.8, nextRing = 1.5, nextBurst = 3, nextBolt = 9;

    function readAccent() {
      var rgb = toRGB(getComputedStyle(document.documentElement).getPropertyValue("--accent"));
      if (rgb && rgb !== accent) {
        accent = rgb;
        accentSprite = makeSprite(accent);
      }
    }

    function build() {
      var scale = quality >= 2 ? 1 : quality === 1 ? 0.6 : 0.35;
      var n = Math.round(Math.max(28, Math.min(95, (W * H) / 15000)) * scale);
      nodes = [];
      for (i = 0; i < n; i++) {
        nodes.push({
          x: rand(0, W), y: rand(0, H), vx: rand(-16, 16), vy: rand(-16, 16),
          r: rand(1.1, 2.6), ph: rand(0, 6.28), h: Math.random() < 0.4 ? pick(12) : -1
        });
      }
      var ni = quality >= 2 ? 14 : quality === 1 ? 9 : 5;
      icons = [];
      for (i = 0; i < ni; i++) {
        icons.push({
          x: rand(0, W), y: rand(0, H), size: rand(24, 50), vy: -rand(12, 30),
          sp: rand(0.3, 0.9), ph: rand(0, 6.28), rot: rand(0, 6.28), vr: rand(-0.7, 0.7),
          s: emoji[pick(emoji.length)]
        });
      }
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, quality >= 2 ? 1.25 : 1);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    /* ----- things that spawn ----- */
    function burst(x, y, n, speed, rainbowOn) {
      for (var k = 0; k < n && sparks.length < 380; k++) {
        var a = (k / n) * 6.283 + rand(-0.25, 0.25), v = rand(speed * 0.35, speed);
        sparks.push({
          x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: rand(0.8, 1.5),
          size: rand(9, 17), g: 60, h: rainbowOn ? pick(12) : (k % 2 ? -1 : -2)
        });
      }
    }
    function ring(x, y, max, life, h) {
      rings.push({ x: x, y: y, max: max, age: 0, life: life, h: h });
    }
    function makeMeteor(big) {
      meteors.push({
        x: rand(W * 0.3, W * 1.1), y: rand(-40, H * 0.3),
        vx: -rand(560, 900) * (big ? 1.2 : 1), vy: rand(260, 460) * (big ? 1.2 : 1),
        len: big ? rand(200, 320) : rand(100, 190), age: 0, life: rand(1, 1.6), h: pick(12), big: big
      });
    }
    function makeBolt() {
      var x = rand(W * 0.15, W * 0.85), y = -10, pts = [[x, y]], endY = H * rand(0.45, 0.8);
      while (y < endY) { y += rand(24, 60); x += rand(-42, 42); pts.push([x, y]); }
      var branches = [];
      for (i = 2; i < pts.length - 1; i++) {
        if (Math.random() < 0.3) {
          var b = [pts[i]], bx = pts[i][0], by = pts[i][1], n = 3 + pick(3);
          for (j = 0; j < n; j++) { bx += rand(-48, 48); by += rand(18, 42); b.push([bx, by]); }
          branches.push(b);
        }
      }
      bolts.push({ pts: pts, branches: branches, age: 0, life: 0.55 });
    }
    function spawn() {
      if (t > nextMeteor) {
        nextMeteor = t + rand(0.9, 2.6) * (quality >= 2 ? 1 : 1.8);
        makeMeteor(Math.random() < 0.18);
      }
      if (t > nextRing) {
        nextRing = t + rand(2, 4.5);
        if (rings.length < 4) ring(rand(W * 0.1, W * 0.9), rand(H * 0.1, H * 0.9), rand(80, 170), rand(2, 3.2), -1);
      }
      if (t > nextBurst) {
        nextBurst = t + rand(3.5, 7);
        burst(rand(W * 0.1, W * 0.9), rand(H * 0.12, H * 0.7), 16, 140, true);
      }
      if (quality >= 1 && t > nextBolt) {
        nextBolt = t + rand(14, 28);
        makeBolt();
      }
    }

    /* ----- drawing ----- */
    function drawAurora() {
      ctx.globalCompositeOperation = "lighter";
      var cols = [accent, hueRGB(t * 12 + 160), hueRGB(t * 12 + 300)];
      var step = Math.max(14, W / 70);
      for (var k = 0; k < 3; k++) {
        var base = H * (0.14 + 0.13 * k), amp = H * 0.06, th = H * 0.2;
        var bot = [], x, y;
        ctx.beginPath();
        for (x = 0; x <= W + step; x += step) {
          y = base + Math.sin(x * 0.0035 + t * 0.32 + k * 2.1) * amp + Math.sin(x * 0.009 - t * 0.5 + k) * amp * 0.45;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          bot.push(x, y + th * (0.7 + 0.3 * Math.sin(x * 0.005 + t * 0.4 + k)));
        }
        for (i = bot.length - 2; i >= 0; i -= 2) ctx.lineTo(bot[i], bot[i + 1]);
        ctx.closePath();
        var g = ctx.createLinearGradient(0, base - amp * 1.5, 0, base + th + amp * 1.5);
        g.addColorStop(0, "rgba(" + cols[k] + ",0)");
        g.addColorStop(0.38, "rgba(" + cols[k] + ",0.24)");
        g.addColorStop(1, "rgba(" + cols[k] + ",0)");
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    function drawGrid() {
      var hy = H * 0.7, vx = W / 2 + (mouse.on ? (mouse.x - W / 2) * 0.12 : 0);
      var g = ctx.createLinearGradient(0, hy, 0, H);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(" + accent + ",0.2)");
      ctx.fillStyle = g;
      ctx.fillRect(0, hy, W, H - hy);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.17)";
      ctx.beginPath();
      for (j = -14; j <= 14; j++) { ctx.moveTo(vx, hy); ctx.lineTo(vx + j * W * 0.09, H); }
      ctx.stroke();
      var off = (t * 0.35) % 1;
      for (j = 0; j < 12; j++) {
        var z = (j + off) / 12, y = hy + (H - hy) * z * z;
        ctx.strokeStyle = "rgba(255,255,255," + (0.05 + 0.27 * z) + ")";
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    }

    function drawIcons(dt) {
      for (i = 0; i < icons.length; i++) {
        var ic = icons[i], near = false;
        ic.y += ic.vy * dt;
        ic.x += Math.sin(t * ic.sp + ic.ph) * 9 * dt;
        ic.rot += ic.vr * dt;
        if (ic.y < -70) { ic.y = H + 70; ic.x = rand(0, W); }
        if (mouse.on) {
          var dx = ic.x - mouse.x, dy = ic.y - mouse.y;
          if (dx * dx + dy * dy < 16900) { near = true; ic.rot += 4 * dt; }
        }
        var s = ic.size * (near ? 1.35 : 1) * (1 + 0.06 * Math.sin(t * 2 + ic.ph));
        ctx.save();
        ctx.translate(ic.x, ic.y);
        ctx.rotate(ic.rot);
        ctx.globalAlpha = near ? 0.95 : 0.42;
        ctx.drawImage(ic.s, -s / 2, -s / 2, s, s);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    function drawNodes(dt) {
      var n, m, dx, dy, d2, d, k;
      var LD = quality >= 2 ? 125 : 105, LD2 = LD * LD;
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < -20) n.x = W + 20; else if (n.x > W + 20) n.x = -20;
        if (n.y < -20) n.y = H + 20; else if (n.y > H + 20) n.y = -20;
        if (mouse.on) {
          dx = n.x - mouse.x; dy = n.y - mouse.y; d = Math.sqrt(dx * dx + dy * dy);
          if (d < 170 && d > 0.5) {
            k = (1 - d / 170) * 240 * dt;
            n.x += (dx / d) * k;
            n.y += (dy / d) * k;
          }
        }
      }
      var segs = [[], [], []];
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        for (j = i + 1; j < nodes.length; j++) {
          m = nodes[j];
          dx = n.x - m.x; dy = n.y - m.y; d2 = dx * dx + dy * dy;
          if (d2 < LD2) {
            k = 1 - Math.sqrt(d2) / LD;
            segs[k > 0.66 ? 2 : k > 0.33 ? 1 : 0].push(n.x, n.y, m.x, m.y);
          }
        }
      }
      var al = [0.12, 0.26, 0.45];
      ctx.lineWidth = 1;
      for (k = 0; k < 3; k++) {
        ctx.strokeStyle = "rgba(255,255,255," + al[k] + ")";
        ctx.beginPath();
        for (j = 0; j < segs[k].length; j += 4) {
          ctx.moveTo(segs[k][j], segs[k][j + 1]);
          ctx.lineTo(segs[k][j + 2], segs[k][j + 3]);
        }
        ctx.stroke();
      }
      if (mouse.on) {
        ctx.lineWidth = 1.3;
        for (i = 0; i < nodes.length; i++) {
          n = nodes[i];
          dx = n.x - mouse.x; dy = n.y - mouse.y; d = Math.sqrt(dx * dx + dy * dy);
          if (d < 165) {
            ctx.strokeStyle = "rgba(255,255,255," + ((1 - d / 165) * 0.75).toFixed(3) + ")";
            ctx.beginPath();
            ctx.moveTo(mouse.x, mouse.y);
            ctx.lineTo(n.x, n.y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 0.95;
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        var sz = n.r * 7 * (0.7 + 0.3 * Math.sin(t * 2.2 + n.ph));
        ctx.drawImage(n.h >= 0 ? rainbow[n.h] : whiteSprite, n.x - sz / 2, n.y - sz / 2, sz, sz);
      }
      ctx.globalAlpha = 1;
    }

    function drawRings(dt) {
      for (i = rings.length - 1; i >= 0; i--) {
        var r = rings[i];
        r.age += dt;
        var k = r.age / r.life;
        if (k >= 1) { rings.splice(i, 1); continue; }
        ctx.lineWidth = r.h >= 0 ? 3 : 2;
        ctx.strokeStyle = "rgba(" + (r.h >= 0 ? rainbowRGB[r.h] : accent) + "," + (0.55 * (1 - k)).toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.max * (1 - Math.pow(1 - k, 3)), 0, 6.283);
        ctx.stroke();
      }
    }

    function drawMeteors(dt) {
      for (i = meteors.length - 1; i >= 0; i--) {
        var s = meteors[i];
        s.age += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        var life = s.age / s.life;
        if (life >= 1) { meteors.splice(i, 1); continue; }
        var sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        var tx = s.x - (s.vx / sp) * s.len, ty = s.y - (s.vy / sp) * s.len;
        var fade = 1 - life * life;
        var lg = ctx.createLinearGradient(s.x, s.y, tx, ty);
        lg.addColorStop(0, "rgba(255,255,255," + fade.toFixed(3) + ")");
        lg.addColorStop(0.35, "rgba(" + rainbowRGB[s.h] + "," + (fade * 0.7).toFixed(3) + ")");
        lg.addColorStop(1, "rgba(" + rainbowRGB[s.h] + ",0)");
        ctx.strokeStyle = lg;
        ctx.lineWidth = s.big ? 4 : 2.4;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.globalAlpha = fade;
        var hs = s.big ? 34 : 20;
        ctx.drawImage(whiteSprite, s.x - hs / 2, s.y - hs / 2, hs, hs);
        ctx.globalAlpha = 1;
        if (quality >= 1 && sparks.length < 380 && Math.random() < 0.8) {
          sparks.push({
            x: s.x, y: s.y, vx: rand(-30, 30), vy: rand(-30, 30), age: 0, life: rand(0.5, 0.95),
            size: rand(7, 13), g: 40, h: s.h
          });
        }
      }
    }

    function drawSparks(dt) {
      for (i = sparks.length - 1; i >= 0; i--) {
        var q = sparks[i];
        q.age += dt;
        if (q.age >= q.life) { sparks.splice(i, 1); continue; }
        q.vy += q.g * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        ctx.globalAlpha = 1 - q.age / q.life;
        ctx.drawImage(q.h >= 0 ? rainbow[q.h] : q.h === -1 ? whiteSprite : accentSprite, q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }
      ctx.globalAlpha = 1;
    }

    function strokeLine(pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      ctx.stroke();
    }
    function drawBolts(dt) {
      for (i = bolts.length - 1; i >= 0; i--) {
        var b = bolts[i];
        b.age += dt;
        if (b.age >= b.life) { bolts.splice(i, 1); continue; }
        var k = 1 - b.age / b.life;
        var flick = (b.age < 0.07 || (b.age > 0.16 && b.age < 0.22)) ? 1 : 0.55;
        var a = k * flick;
        flash = Math.max(flash, 0.13 * a);
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(" + accent + "," + (0.3 * a).toFixed(3) + ")";
        ctx.lineWidth = 9;
        strokeLine(b.pts);
        ctx.strokeStyle = "rgba(255,255,255," + a.toFixed(3) + ")";
        ctx.lineWidth = 2.4;
        strokeLine(b.pts);
        ctx.lineWidth = 1.3;
        for (j = 0; j < b.branches.length; j++) strokeLine(b.branches[j]);
      }
      if (flash > 0.002) {
        ctx.fillStyle = "rgba(255,255,255," + flash.toFixed(3) + ")";
        ctx.fillRect(0, 0, W, H);
        flash *= 0.86;
      } else {
        flash = 0;
      }
    }

    function drawAll(dt) {
      ctx.clearRect(0, 0, W, H);
      if (quality >= 1) drawAurora();
      if (quality >= 1) drawGrid();
      drawIcons(dt);
      drawNodes(dt);
      drawRings(dt);
      drawMeteors(dt);
      drawSparks(dt);
      drawBolts(dt);
    }

    resize();
    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(resize, 150);
    });

    if (reduce) {
      drawAll(0);
      return;
    }

    /* ----- mouse: sparkle trail, and a shockwave when you click ----- */
    window.addEventListener("pointermove", function (e) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.on = true;
      mouse.last = performance.now();
      if (quality >= 1 && sparks.length < 340 && Math.random() < 0.7) {
        sparks.push({
          x: e.clientX + rand(-4, 4), y: e.clientY + rand(-4, 4), vx: rand(-25, 25), vy: rand(-45, 10),
          age: 0, life: rand(0.5, 1), size: rand(9, 17), g: 50, h: Math.floor((t * 40) % 12)
        });
      }
    }, { passive: true });
    document.documentElement.addEventListener("mouseleave", function () { mouse.on = false; });
    window.addEventListener("pointerdown", function (e) {
      ring(e.clientX, e.clientY, 190, 0.95, pick(12));
      ring(e.clientX, e.clientY, 110, 0.7, pick(12));
      burst(e.clientX, e.clientY, 26, 260, true);
    }, { passive: true });

    var last = performance.now(), raf = 0, accentTimer = 0, acc = 0, cnt = 0;
    function frame(now) {
      raf = requestAnimationFrame(frame);
      var raw = (now - last) / 1000;
      var dt = Math.min(0.05, raw);
      last = now;
      t += dt;
      accentTimer += dt;
      if (accentTimer > 2) { accentTimer = 0; readAccent(); }
      if (mouse.on && now - mouse.last > 3000) mouse.on = false;

      /* slow computer? drop to a lighter version automatically */
      if (t > 2) {
        acc += raw; cnt++;
        if (cnt >= 90) {
          if (acc / cnt > 0.036 && quality > 0) { quality--; resize(); }
          acc = 0; cnt = 0;
        }
      }
      spawn();
      drawAll(dt);
    }
    readAccent();
    raf = requestAnimationFrame(frame);

    /* stop drawing while the tab is hidden */
    document.addEventListener("visibilitychange", function () {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
  }

  /* ---------------------------------------------------------
     2. SLIDE IN WHEN SCROLLED INTO VIEW
        SiteFX.slideOnScroll("#games", ".game")
        Anything that is off screen waits hidden. When it scrolls into view
        (going down or up) it slides in, and it does it again next time.
        options.initial: also slide in the ones showing when the page opens
        options.watch:   also catch things added to the page later
     --------------------------------------------------------- */
  function slideOnScroll(rootSel, itemSel, options) {
    if (reduce || !("IntersectionObserver" in window)) return;
    options = options || {};
    var root = document.querySelector(rootSel);
    if (!root) return;

    var lastY = window.pageYOffset || 0;
    var dir = 1;
    window.addEventListener("scroll", function () {
      var y = window.pageYOffset || 0;
      if (y !== lastY) { dir = y > lastY ? 1 : -1; lastY = y; }
    }, { passive: true });

    var io = new IntersectionObserver(function (entries) {
      var entering = [];
      entries.forEach(function (e) {
        if (e.isIntersecting) entering.push(e);
        else e.target.classList.add("fx-pre");
      });
      entering.sort(function (a, b) {
        var ra = a.boundingClientRect, rb = b.boundingClientRect;
        return ra.top - rb.top || ra.left - rb.left;
      });
      var n = 0;
      entering.forEach(function (e) {
        var el = e.target;
        if (!el.classList.contains("fx-pre")) return;
        var r = e.boundingClientRect;
        var fromLeft = r.left + r.width / 2 < window.innerWidth / 2;
        el.style.setProperty("--fx-x", (fromLeft ? -70 : 70) + "px");
        el.style.setProperty("--fx-y", (dir > 0 ? 60 : -60) + "px");
        el.style.setProperty("--fx-d", Math.min(n, 10) * 45 + "ms");
        n++;
        void el.offsetWidth; /* lock in the start spot, then let it slide */
        el.classList.remove("fx-pre");
      });
    });

    function track(el, waiting) {
      if (el.__fx) return;
      el.__fx = true;
      el.classList.add("fx-track");
      if (waiting) el.classList.add("fx-pre");
      io.observe(el);
    }

    root.querySelectorAll(itemSel).forEach(function (el) { track(el, !!options.initial); });

    if (options.watch && "MutationObserver" in window) {
      new MutationObserver(function (list) {
        list.forEach(function (m) {
          Array.prototype.forEach.call(m.addedNodes, function (node) {
            if (node.nodeType !== 1) return;
            if (node.matches && node.matches(itemSel)) track(node, true);
            if (node.querySelectorAll) {
              node.querySelectorAll(itemSel).forEach(function (el) { track(el, true); });
            }
          });
        });
      }).observe(root, { childList: true, subtree: true });
    }
  }

  /* ---------------------------------------------------------
     3. MENU OPEN/CLOSE  (links.html and comments.html only)
     --------------------------------------------------------- */
  function initPageNav() {
    var body = document.body;
    var nav = document.getElementById("side-nav");
    var toggle = document.getElementById("nav-toggle");
    if (!body || !nav || !toggle || !body.hasAttribute("data-fx-nav")) return;

    var root = document.documentElement;
    var KEY = "nav:v1"; /* same key as the home page, so the menu stays how you left it */
    var collapsed;

    function isPhone() { return window.innerWidth < 700; }

    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    collapsed = isPhone() ? true : saved === "closed";

    function setCollapsed(c, remember) {
      collapsed = c;
      root.classList.toggle("nav-collapsed", c);
      toggle.setAttribute("aria-expanded", c ? "false" : "true");
      toggle.setAttribute("aria-label", c ? "Open menu" : "Close menu");
      if (remember && !isPhone()) {
        try { localStorage.setItem(KEY, c ? "closed" : "open"); } catch (e) {}
      }
    }

    root.classList.add("fx-nav");
    setCollapsed(collapsed, false);
    window.addEventListener("load", function () { root.classList.add("nav-ready"); });
    toggle.addEventListener("click", function () { setCollapsed(!collapsed, true); });
    document.addEventListener("mousedown", function (e) {
      if (isPhone() && !collapsed && !nav.contains(e.target)) setCollapsed(true, false);
    });
  }

  window.SiteFX = { slideOnScroll: slideOnScroll };

  initPageNav();
  startBackground();
})();
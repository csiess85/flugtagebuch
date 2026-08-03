/* Interaktive Flugkarte: Canvas, Offline-Vektor-Basemap, Zoom/Pan/Pinch. */
(function () {
  var BM = window.__BM__, TR = window.__TR__;
  var R2D = 180 / Math.PI, D2R = Math.PI / 180;

  function my(lat) {                       // Mercator-Y in Grad
    var l = Math.max(-85, Math.min(85, lat));
    return Math.log(Math.tan(Math.PI / 4 + l * D2R / 2)) * R2D;
  }

  /* ---- Farben je nach Theme ---- */
  function palette() {
    var dark = (document.documentElement.getAttribute('data-theme') || '') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') &&
        matchMedia('(prefers-color-scheme:dark)').matches);
    return dark ? {
      sea: '#101c26', land: '#1d2229', border: '#39424d', urban: '#252b34',
      lake: '#1b3a4d', lakeEdge: '#2d5a72', river: '#2b556e', glacier: '#31414d',
      ap: '#8a949f', apHard: '#b9c3ce', text: '#9aa3ad', text2: '#6f7883',
      halo: 'rgba(16,22,30,.85)', grid: 'rgba(255,255,255,.05)', ring: '#e9e5df'
    } : {
      sea: '#d9e6ee', land: '#f6f3ed', border: '#c4bdb1', urban: '#e9e4da',
      lake: '#bcd7e6', lakeEdge: '#8fb6cc', river: '#9dc0d4', glacier: '#eaf1f5',
      ap: '#8d857a', apHard: '#5f584e', text: '#6b645b', text2: '#948d83',
      halo: 'rgba(255,255,255,.85)', grid: 'rgba(0,0,0,.05)', ring: '#1c1a17'
    };
  }

  /* ---- Viridis für die Höhenfärbung ---- */
  var VIR = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
  function viridis(t) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var f = t * (VIR.length - 1), i = Math.min(VIR.length - 2, Math.floor(f)), u = f - i;
    var a = VIR[i], b = VIR[i + 1];
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * u) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * u) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * u) + ')';
  }

  /* ---- Bounding-Boxen der Basemap einmalig vorrechnen ---- */
  function prep(list, get) {
    return list.map(function (f) {
      var pts = get ? get(f) : f, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (var i = 0; i < pts.length; i++) {
        var x = pts[i][0], y = my(pts[i][1]);
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      return { f: f, p: pts, b: [x0, y0, x1, y1] };
    });
  }
  var L = {
    ld: prep(BM.ld), la: prep(BM.la), gl: prep(BM.gl), ur: prep(BM.ur),
    ri: prep(BM.ri, function (r) { return r[1]; })
  };
  var REG = (function () {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    L.ld.forEach(function (o) {
      if (o.b[0] < x0) x0 = o.b[0]; if (o.b[1] < y0) y0 = o.b[1];
      if (o.b[2] > x1) x1 = o.b[2]; if (o.b[3] > y1) y1 = o.b[3];
    });
    return [x0, y0, x1, y1];
  })();

  function fmtNum(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

  /* ================================================================= Karte */
  function Map(host, n) {
    var self = this;
    this.host = host;
    this.n = n;
    this.track = TR[n].map(function (p) { return [p[0], my(p[1]), p[2], p[1]]; });
    var alts = TR[n].map(function (p) { return p[2]; });
    this.aMin = Math.min.apply(null, alts);
    this.aMax = Math.max.apply(null, alts);
    if (this.aMax - this.aMin < 50) this.aMax = this.aMin + 50;

    var b = [1e9, 1e9, -1e9, -1e9];
    this.track.forEach(function (p) {
      if (p[0] < b[0]) b[0] = p[0]; if (p[0] > b[2]) b[2] = p[0];
      if (p[1] < b[1]) b[1] = p[1]; if (p[1] > b[3]) b[3] = p[1];
    });
    this.tb = b;

    var cv = document.createElement('canvas');
    cv.className = 'mapcv';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', 'Interaktive Flugkarte — ziehen zum Verschieben, Mausrad zum Zoomen');
    cv.tabIndex = 0;
    this.cv = cv; this.ctx = cv.getContext('2d');

    var ui = document.createElement('div');
    ui.className = 'mapui';
    ui.innerHTML =
      '<button type="button" data-a="in"  title="Vergrößern (+)">+</button>' +
      '<button type="button" data-a="out" title="Verkleinern (−)">−</button>' +
      '<button type="button" data-a="fit" title="Auf Flug einpassen">⌖</button>' +
      '<button type="button" data-a="full" title="Vollbild (F)">⛶</button>';
    this.ui = ui;

    var rd = document.createElement('div'); rd.className = 'mapread'; this.rd = rd;
    var hint = document.createElement('div'); hint.className = 'maphint';
    hint.textContent = 'Klicken zum Zoomen';
    this.hint = hint;

    var wrap = host.querySelector('.mapwrap');
    wrap.insertBefore(cv, wrap.firstChild);
    wrap.appendChild(ui); wrap.appendChild(rd); wrap.appendChild(hint);
    var svg = wrap.querySelector('svg.trk'); if (svg) svg.remove();

    var leg = host.querySelector('.maplegend');
    if (leg) {
      leg.innerHTML = '<span class="lgl">' + fmtNum(this.aMin) + ' ft</span>' +
        '<span class="lgbar"></span><span class="lgl">' + fmtNum(this.aMax) + ' ft</span>';
      var bar = leg.querySelector('.lgbar'), st = [];
      for (var i = 0; i <= 8; i++) st.push(viridis(i / 8) + ' ' + (i / 8 * 100) + '%');
      bar.style.background = 'linear-gradient(to right,' + st.join(',') + ')';
    }

    this.active = false;
    this.bind();
    this.resize();
    this.fit();

    var ro = new ResizeObserver(function () { self.resize(); self.draw(); });
    ro.observe(wrap);
  }

  Map.prototype.resize = function () {
    var r = this.cv.parentNode.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(80, r.width); this.h = Math.max(60, r.height);
    this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
    this.dpr = dpr;
  };

  Map.prototype.fit = function () {
    var b = this.tb, pad = 26;
    var w = Math.max(b[2] - b[0], 1e-4), h = Math.max(b[3] - b[1], 1e-4);
    this.k = Math.min((this.w - 2 * pad) / w, (this.h - 2 * pad) / h);
    this.k0 = this.k;
    this.cx = (b[0] + b[2]) / 2; this.cy = (b[1] + b[3]) / 2;
    this.clamp(); this.draw();
  };

  Map.prototype.clamp = function () {
    var rw = REG[2] - REG[0], rh = REG[3] - REG[1];
    var kMin = Math.min(this.w / rw, this.h / rh);
    var kMax = this.w / 0.035;                      // ~3 km Bildbreite
    this.k = Math.max(Math.min(this.k0, kMin), Math.min(this.k, kMax));
    var hw = this.w / this.k / 2, hh = this.h / this.k / 2;
    this.cx = Math.max(REG[0] - hw * .4, Math.min(REG[2] + hw * .4, this.cx));
    this.cy = Math.max(REG[1] - hh * .4, Math.min(REG[3] + hh * .4, this.cy));
  };

  Map.prototype.X = function (x) { return (x - this.cx) * this.k + this.w / 2; };
  Map.prototype.Y = function (y) { return this.h / 2 - (y - this.cy) * this.k; };
  Map.prototype.invX = function (px) { return (px - this.w / 2) / this.k + this.cx; };
  Map.prototype.invY = function (py) { return (this.h / 2 - py) / this.k + this.cy; };

  Map.prototype.view = function () {
    var hw = this.w / this.k / 2, hh = this.h / this.k / 2;
    return [this.cx - hw, this.cy - hh, this.cx + hw, this.cy + hh];
  };

  /* Bildbreite in km (für zoomabhängige Detailstufen) */
  Map.prototype.spanKm = function () {
    var latC = Math.atan(Math.sinh(this.cy * D2R)) * R2D;
    return (this.w / this.k) * 111.32 * Math.cos(latC * D2R);
  };

  Map.prototype.path = function (o, close) {
    var c = this.ctx, p = o.p;
    c.beginPath();
    c.moveTo(this.X(p[0][0]), this.Y(my(p[0][1])));
    for (var i = 1; i < p.length; i++) c.lineTo(this.X(p[i][0]), this.Y(my(p[i][1])));
    if (close) c.closePath();
  };

  Map.prototype.vis = function (o, v) {
    return !(o.b[2] < v[0] || o.b[0] > v[2] || o.b[3] < v[1] || o.b[1] > v[3]);
  };

  Map.prototype.draw = function () {
    var c = this.ctx, P = palette(), v = this.view(), km = this.spanKm(), self = this;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    c.fillStyle = P.sea; c.fillRect(0, 0, this.w, this.h);

    /* Land */
    c.fillStyle = P.land; c.strokeStyle = P.border; c.lineWidth = 1;
    L.ld.forEach(function (o) {
      if (!self.vis(o, v)) return;
      self.path(o, true); c.fill(); c.stroke();
    });

    /* Gletscher */
    c.fillStyle = P.glacier;
    L.gl.forEach(function (o) { if (self.vis(o, v)) { self.path(o, true); c.fill(); } });

    /* Siedlungen — erst ab mittlerem Zoom */
    if (km < 700) {
      c.fillStyle = P.urban;
      L.ur.forEach(function (o) { if (self.vis(o, v)) { self.path(o, true); c.fill(); } });
    }

    /* Flüsse */
    L.ri.forEach(function (o) {
      var rank = o.f[0];
      if (rank > (km < 120 ? 8 : km < 300 ? 7 : 5)) return;
      if (!self.vis(o, v)) return;
      c.strokeStyle = P.river;
      c.lineWidth = rank <= 3 ? 2.2 : rank <= 6 ? 1.4 : .9;
      self.path(o, false); c.stroke();
    });

    /* Seen */
    c.fillStyle = P.lake; c.strokeStyle = P.lakeEdge; c.lineWidth = 1;
    L.la.forEach(function (o) {
      if (!self.vis(o, v)) return;
      self.path(o, true); c.fill(); c.stroke();
    });

    /* Flugplätze */
    var labels = [];
    if (km < 420) {
      BM.ap.forEach(function (a) {
        var x = self.X(a[0]), y = self.Y(my(a[1]));
        if (x < -20 || y < -20 || x > self.w + 20 || y > self.h + 20) return;
        var big = a[4] === 1 || a[5] >= 900;
        if (km > 180 && !big) return;
        c.beginPath(); c.arc(x, y, 3.1, 0, 6.2832);
        c.strokeStyle = big ? P.apHard : P.ap; c.lineWidth = 1.4; c.stroke();
        c.beginPath(); c.arc(x, y, 1.1, 0, 6.2832);
        c.fillStyle = big ? P.apHard : P.ap; c.fill();
        if (km < 150) labels.push([x, y + 3.5, a[2], P.apHard, 10, 600, big ? 20 : 15, 6]);
      });
    }

    /* Landmarken */
    BM.lm.forEach(function (m) {
      var x = self.X(m[0]), y = self.Y(my(m[1]));
      if (x < 0 || y < 0 || x > self.w || y > self.h) return;
      if (km > 520) return;
      if (m[3] === 1) {
        c.beginPath();
        c.moveTo(x, y - 4); c.lineTo(x + 3.6, y + 2.4); c.lineTo(x - 3.6, y + 2.4); c.closePath();
        c.fillStyle = P.text2; c.fill();
        labels.push([x, y + 3.5, m[2], P.text, 10.5, 500, 45, 6]);
      } else {
        labels.push([x, y, m[2], P.text2, 10.5, 500, 40, 0]);
      }
    });

    /* Orte */
    BM.pl.forEach(function (p) {
      var pop = p[3];
      var need = km < 90 ? 12000 : km < 200 ? 40000 : km < 400 ? 100000 : 300000;
      if (pop < need) return;
      var x = self.X(p[0]), y = self.Y(my(p[1]));
      if (x < 0 || y < 0 || x > self.w || y > self.h) return;
      var big = pop > 200000;
      c.beginPath(); c.arc(x, y, big ? 3 : 2, 0, 6.2832);
      c.fillStyle = P.text; c.fill();
      labels.push([x, y + 3.5, p[2], P.text, big ? 12 : 10.5, big ? 700 : 500, big ? 80 : 60, 5.5]);
    });

    /* Labels: wichtigste zuerst, mit einfacher Kollisionsprüfung */
    var boxes = [];
    c.textBaseline = 'alphabetic';
    labels.sort(function (a, b) { return b[6] - a[6]; });
    labels.forEach(function (l) {
      c.font = l[5] + ' ' + l[4] + 'px -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif';
      var tw = c.measureText(l[2]).width;
      var x = l[0] + l[7];
      if (l[7] && x + tw > self.w - 4) x = l[0] - l[7] - tw;   // am rechten Rand spiegeln
      if (!l[7]) x = l[0] - tw / 2;                            // zentrierte Beschriftung
      if (x < 2 || x + tw > self.w - 2) return;
      var bx = [x - 2, l[1] - l[4], x + tw + 2, l[1] + 3];
      for (var i = 0; i < boxes.length; i++) {
        var o = boxes[i];
        if (!(bx[2] < o[0] || bx[0] > o[2] || bx[3] < o[1] || bx[1] > o[3])) return;
      }
      boxes.push(bx);
      c.lineWidth = 3; c.strokeStyle = P.halo; c.lineJoin = 'round';
      c.strokeText(l[2], x, l[1]);
      c.fillStyle = l[3]; c.fillText(l[2], x, l[1]);
    });

    /* Flugweg, nach Höhe eingefärbt */
    var t = this.track, span = this.aMax - this.aMin;
    c.lineWidth = 2.6; c.lineCap = 'round'; c.lineJoin = 'round';
    for (var i = 1; i < t.length; i++) {
      c.beginPath();
      c.moveTo(this.X(t[i - 1][0]), this.Y(t[i - 1][1]));
      c.lineTo(this.X(t[i][0]), this.Y(t[i][1]));
      c.strokeStyle = viridis(((t[i - 1][2] + t[i][2]) / 2 - this.aMin) / span);
      c.stroke();
    }

    /* Start / Ziel */
    function mark(x, y, fill) {
      c.beginPath(); c.arc(x, y, 5, 0, 6.2832);
      c.fillStyle = fill; c.fill();
      c.lineWidth = 2; c.strokeStyle = P.ring; c.stroke();
    }
    mark(this.X(t[0][0]), this.Y(t[0][1]), P.sea);
    mark(this.X(t[t.length - 1][0]), this.Y(t[t.length - 1][1]), '#e2705c');

    /* Maßstab */
    var pxPerKm = this.k / (111.32 * Math.cos(Math.atan(Math.sinh(this.cy * D2R))));
    var steps = [1, 2, 5, 10, 20, 50, 100, 200, 500], sc = steps[0];
    for (var s = 0; s < steps.length; s++) { sc = steps[s]; if (steps[s] * pxPerKm > 56) break; }
    var bl = sc * pxPerKm, by = this.h - 14, bxs = 12;
    c.strokeStyle = P.text; c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(bxs, by - 4); c.lineTo(bxs, by); c.lineTo(bxs + bl, by); c.lineTo(bxs + bl, by - 4);
    c.stroke();
    c.font = '600 10px -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif';
    c.lineWidth = 3; c.strokeStyle = P.halo; c.strokeText(sc + ' km', bxs + bl + 6, by + 1);
    c.fillStyle = P.text; c.fillText(sc + ' km', bxs + bl + 6, by + 1);

    /* Nordpfeil */
    var nx = this.w - 18, ny = 20;
    c.beginPath(); c.moveTo(nx, ny - 9); c.lineTo(nx + 4, ny + 4); c.lineTo(nx, ny + 1);
    c.lineTo(nx - 4, ny + 4); c.closePath();
    c.fillStyle = P.text; c.fill();
    c.font = '700 9px -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif';
    c.textAlign = 'center';
    c.lineWidth = 3; c.strokeStyle = P.halo; c.strokeText('N', nx, ny + 14);
    c.fillStyle = P.text; c.fillText('N', nx, ny + 14);
    c.textAlign = 'left';
  };

  /* ---- Interaktion ---- */
  Map.prototype.zoomAt = function (px, py, f) {
    var gx = this.invX(px), gy = this.invY(py);
    this.k *= f; this.clamp();
    this.cx = gx - (px - this.w / 2) / this.k;
    this.cy = gy + (py - this.h / 2) / this.k;
    this.clamp(); this.draw();
  };

  Map.prototype.activate = function () {
    this.active = true;
    this.host.classList.add('is-live');   // blendet den Hinweis dauerhaft aus
  };

  Map.prototype.bind = function () {
    var self = this, cv = this.cv, drag = null, pinch = null;

    this.ui.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      e.preventDefault(); self.activate();
      var a = b.dataset.a;
      if (a === 'in') self.zoomAt(self.w / 2, self.h / 2, 1.6);
      else if (a === 'out') self.zoomAt(self.w / 2, self.h / 2, 1 / 1.6);
      else if (a === 'fit') self.fit();
      else if (a === 'full') self.toggleFull();
    });

    cv.addEventListener('wheel', function (e) {
      if (!self.active && !e.ctrlKey && !e.metaKey) return;      // Seite darf scrollen
      e.preventDefault();
      var r = cv.getBoundingClientRect();
      self.zoomAt(e.clientX - r.left, e.clientY - r.top,
        Math.pow(1.0015, -e.deltaY * (e.deltaMode === 1 ? 18 : 1)));
    }, { passive: false });

    cv.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;
      self.activate();
      cv.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, cx: self.cx, cy: self.cy, moved: 0 };
      cv.classList.add('grabbing');
    });
    cv.addEventListener('pointermove', function (e) {
      var r = cv.getBoundingClientRect();
      if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
        self.cx = drag.cx - dx / self.k;
        self.cy = drag.cy + dy / self.k;
        self.clamp(); self.draw();
      } else if (e.pointerType !== 'touch') {
        self.hover(e.clientX - r.left, e.clientY - r.top);
      }
    });
    function endDrag(e) {
      if (!drag) return;
      drag = null; cv.classList.remove('grabbing');
    }
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('pointerleave', function () {
      self.rd.classList.remove('on');
      self.active = false;                // Mausrad scrollt wieder die Seite
    });
    cv.addEventListener('dblclick', function (e) {
      e.preventDefault(); self.activate();
      var r = cv.getBoundingClientRect();
      self.zoomAt(e.clientX - r.left, e.clientY - r.top, 1.9);
    });

    /* Touch: ein Finger scrollt die Seite, zwei Finger steuern die Karte */
    cv.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        e.preventDefault(); self.activate();
        pinch = touchState(e); pinch.cx = self.cx; pinch.cy = self.cy; pinch.k = self.k;
      }
    }, { passive: false });
    cv.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 2 || !pinch) return;
      e.preventDefault();
      var t = touchState(e), r = cv.getBoundingClientRect();
      self.k = pinch.k * (t.d / pinch.d); self.clamp();
      var gx = pinch.cx + (pinch.x - self.w / 2) / pinch.k;
      var gy = pinch.cy - (pinch.y - self.h / 2) / pinch.k;
      self.cx = gx - (t.x - self.w / 2) / self.k;
      self.cy = gy + (t.y - self.h / 2) / self.k;
      self.clamp(); self.draw();
    }, { passive: false });
    cv.addEventListener('touchend', function () { pinch = null; });

    function touchState(e) {
      var r = cv.getBoundingClientRect();
      var a = e.touches[0], b = e.touches[1];
      var ax = a.clientX - r.left, ay = a.clientY - r.top;
      var bx = b.clientX - r.left, by = b.clientY - r.top;
      return { x: (ax + bx) / 2, y: (ay + by) / 2, d: Math.max(1, Math.hypot(bx - ax, by - ay)) };
    }

    cv.addEventListener('keydown', function (e) {
      var st = 40 / self.k, hit = true;
      if (e.key === '+' || e.key === '=') self.zoomAt(self.w / 2, self.h / 2, 1.5);
      else if (e.key === '-' || e.key === '_') self.zoomAt(self.w / 2, self.h / 2, 1 / 1.5);
      else if (e.key === 'ArrowLeft') { self.cx -= st; self.clamp(); self.draw(); }
      else if (e.key === 'ArrowRight') { self.cx += st; self.clamp(); self.draw(); }
      else if (e.key === 'ArrowUp') { self.cy += st; self.clamp(); self.draw(); }
      else if (e.key === 'ArrowDown') { self.cy -= st; self.clamp(); self.draw(); }
      else if (e.key === '0') self.fit();
      else if (e.key === 'f' || e.key === 'F') self.toggleFull();
      else if (e.key === 'Escape' && self.host.classList.contains('is-full')) self.toggleFull();
      else hit = false;
      if (hit) { e.preventDefault(); self.activate(); }
    });
    cv.addEventListener('focus', function () { self.activate(); });
  };

  Map.prototype.hover = function (px, py) {
    var t = this.track, best = -1, bd = 15 * 15;
    for (var i = 0; i < t.length; i++) {
      var dx = this.X(t[i][0]) - px, dy = this.Y(t[i][1]) - py, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) { this.rd.classList.remove('on'); return; }
    var p = t[best];
    this.rd.innerHTML = '<b>' + fmtNum(p[2]) + ' ft</b> <span>' + fmtNum(p[2] * .3048) + ' m</span>' +
      '<span>' + p[3].toFixed(3) + '°N ' + p[0].toFixed(3) + '°E</span>';
    this.rd.classList.add('on');
    this.rd.style.left = Math.min(this.w - 150, Math.max(4, px + 12)) + 'px';
    this.rd.style.top = Math.max(4, py - 42) + 'px';
  };

  Map.prototype.toggleFull = function () {
    var self = this, on = this.host.classList.toggle('is-full');
    document.body.classList.toggle('map-full-open', on);
    requestAnimationFrame(function () { self.resize(); self.fit(); self.cv.focus(); });
  };

  /* ---- Lazy-Init: nur sichtbare Karten aufbauen ---- */
  var maps = [];
  function init(host) {
    if (host.__map) return;
    host.__map = new Map(host, +host.dataset.n);
    maps.push(host.__map);
  }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { init(e.target); io.unobserve(e.target); } });
  }, { rootMargin: '400px 0px' });
  document.querySelectorAll('.map[data-n]').forEach(function (m) { io.observe(m); });

  /* Theme-Wechsel und Filter neu zeichnen lassen */
  window.__redrawMaps = function () { maps.forEach(function (m) { m.draw(); }); };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var f = document.querySelector('.map.is-full');
      if (f && f.__map) f.__map.toggleFull();
    }
  });
})();

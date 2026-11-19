/* Sarah W. Vorwerk · Antarktis 2020 – gemeinsamer Kern für alle Designs.
   Ein Design setzt vor diesem Skript window.THEME (Karte, Farben, Schiff, Hooks).
   Daten: data/track.json (aus raw/*.plt, scripts/build_track.py), data/stations.json,
   Fotos aus photos/ (data/photos.json), Wetter (ERA5-Reanalyse) live von Open-Meteo. */
(function () {
  'use strict';
  const TH = window.THEME || {};
  const BASE = TH.base || '';
  const LOCAL_OFFSET_H = -3;            // Ortszeit Ushuaia / Antarktische Halbinsel
  const PHOTO_CLOCK_OFFSET_S = 0;       // Kamerauhr = GPS-Uhr (an Ankerplätzen geprüft)
  const DAY_MS = 86400000;
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  const SINK = document.createElement('div');
  const $ = (id) => document.getElementById(id) || SINK;
  const fmt = (n, d = 0) => { const f = 10 ** d; let v = Math.round(n * f) / f; if (v === 0) v = 0; return v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }); };

  // ---------- Geometrie ----------
  const R_NM = 3440.065, rad = Math.PI / 180;
  function hav(la1, lo1, la2, lo2) {
    const a = Math.sin((la2 - la1) * rad / 2) ** 2 +
      Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin((lo2 - lo1) * rad / 2) ** 2;
    return 2 * R_NM * Math.asin(Math.sqrt(a));
  }
  function bearing(la1, lo1, la2, lo2) {
    const y = Math.sin((lo2 - lo1) * rad) * Math.cos(la2 * rad);
    const x = Math.cos(la1 * rad) * Math.sin(la2 * rad) - Math.sin(la1 * rad) * Math.cos(la2 * rad) * Math.cos((lo2 - lo1) * rad);
    return (Math.atan2(y, x) / rad + 360) % 360;
  }
  const COMPASS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  const compass = (deg) => COMPASS[Math.round(deg / 45) % 8];
  function beaufort(kn) {
    const lim = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64];
    let b = 0; while (b < lim.length && kn >= lim[b]) b++; return b;
  }
  const BFT_NAME = ['Windstille', 'leiser Zug', 'leichte Brise', 'schwache Brise', 'mäßige Brise', 'frische Brise',
    'starker Wind', 'steifer Wind', 'stürmischer Wind', 'Sturm', 'schwerer Sturm', 'orkanartiger Sturm', 'Orkan'];

  // ---------- Zeit ----------
  const loc = (ms) => new Date(ms + LOCAL_OFFSET_H * 3600000);   // getUTC* liefert Ortszeit
  const pad = (n) => String(n).padStart(2, '0');
  function fmtDate(ms, withWd = true) {
    const d = loc(ms);
    return (withWd ? WD[d.getUTCDay()] + '., ' : '') + pad(d.getUTCDate()) + '. ' + MON[d.getUTCMonth()] + '.';
  }
  const fmtTime = (ms) => { const d = loc(ms); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); };

  // ---------- State ----------
  let T, LAT, LON, D, t0, tEnd, totalNm, stations = [], photos = [];
  let t = 0, playing = false, map, ship, tag, lastFrame = 0;
  const SPEEDS = [0.5, 1, 3, 10];        // 1× ≈ 1 Reisetag in 4 s
  let speedIdx = 0;
  const BASE_RATE = 86400 / 4;
  let wxOn = true, followOn = true, curDay = 1, wxCur = null, lastSog = 0;

  function idxAt(s) {
    let lo = 0, hi = T.length - 1;
    if (s <= T[0]) return 0;
    if (s >= T[hi]) return hi;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= s) lo = m; else hi = m; }
    return lo;
  }
  function posAt(s) {
    const i = idxAt(s), j = Math.min(i + 1, T.length - 1);
    const f = j === i ? 0 : Math.max(0, Math.min(1, (s - T[i]) / (T[j] - T[i])));
    return { i, lat: LAT[i] + (LAT[j] - LAT[i]) * f, lon: LON[i] + (LON[j] - LON[i]) * f, d: D[i] + (D[j] - D[i]) * f };
  }
  function motionAt(s) {
    const a = posAt(s - 900), b = posAt(s + 900);
    const dt = (Math.min(s + 900, tEnd) - Math.max(s - 900, 0)) / 3600;
    const sog = dt > 0 ? hav(a.lat, a.lon, b.lat, b.lon) / dt : 0;
    return { sog, cog: bearing(a.lat, a.lon, b.lat, b.lon), anchored: sog < 0.6 };
  }

  // öffentliche Schnittstelle für die Designs
  const APP = window.APP = {
    fmt, fmtDate, fmtTime, loc, compass, beaufort, BFT_NAME, hav, LOCAL_OFFSET_H,
    get t() { return t; }, get t0() { return t0; }, get tEnd() { return tEnd; }, get totalNm() { return totalNm; },
    get stations() { return stations; }, get photos() { return photos; }, get playing() { return playing; },
    get map() { return map; }, get wx() { return wxCur; },
    posAt: (s) => posAt(s), motionAt: (s) => motionAt(s),
    setT: (s) => { pause(); setT(s); }, openLb: (k) => openLb(k), pause: () => pause(), play: () => play(),
    series: () => series(), refresh: () => render(true)
  };

  // ---------- Laden ----------
  Promise.all([
    fetch(BASE + 'data/track.json').then((r) => r.json()),
    fetch(BASE + 'data/stations.json').then((r) => r.json())
  ]).then(([tr, st]) => {
    t0 = Date.parse(tr.t0);
    const n = tr.p.length;
    T = new Float64Array(n); LAT = new Float64Array(n); LON = new Float64Array(n); D = new Float64Array(n);
    tr.p.forEach((p, k) => {
      T[k] = p[0]; LAT[k] = p[1]; LON[k] = p[2];
      D[k] = k ? D[k - 1] + hav(LAT[k - 1], LON[k - 1], p[1], p[2]) : 0;
    });
    tEnd = T[n - 1]; totalNm = D[n - 1];
    stations = st.map((s) => Object.assign(s, { a: (Date.parse(s.from) - t0) / 1000, b: (Date.parse(s.to) - t0) / 1000 }));
    stations.forEach((s) => { s.d = posAt(s.a).d; });
    $('pTot').textContent = fmt(totalNm) + ' sm';
    buildTimeline();
    if (TH.onReady) TH.onReady(APP);
    initMap();
    loadPhotos();
    const h = location.hash.match(/t=([0-9T:\-]+)/);
    setT(h ? (Date.parse(h[1] + (h[1].length <= 16 ? ':00' : '') + 'Z') - t0) / 1000 - LOCAL_OFFSET_H * 3600 : stations[3].a + 3600 * 5);
  });

  // ---------- Karte ----------
  const C = Object.assign({
    done: '#ef6a4c', doneW: 3.6, todo: '#16222c', todoW: 1.8, todoDash: [2.5, 2], todoOp: 1, halo: '#ffffff', haloOp: 0.35,
    label: '#16222c', labelHalo: 'rgba(255,255,255,.9)', labelFont: ['Open Sans Semibold'], labelSize: 13,
    photo: '#ffd7c8', photoStroke: '#ef6a4c', port: '#16222c', portStroke: '#ffffff',
    anchorBg: '#ffffff', anchorFg: '#16222c'
  }, TH.colors || {});

  function initMap() {
    const coords = Array.from(T, (_, k) => [LON[k], LAT[k]]);
    map = new maplibregl.Map({
      container: 'map',
      attributionControl: { compact: true },
      style: { version: 8, glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf', sources: TH.sources, layers: TH.layers },
      center: [-62, -63], zoom: TH.zoom || 6, maxZoom: 14
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl({
      onAdd() {
        const d = document.createElement('div'); d.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        d.innerHTML = '<button id="followBtn" class="follow on" type="button" title="Karte folgt dem Schiff">⌖</button>';
        d.firstChild.onclick = () => setFollow(!followOn);
        return d;
      }, onRemove() {}
    }, 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'nautical' }), 'bottom-left');
    map.on('dragstart', () => setFollow(false));

    map.on('load', () => {
      map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
      const chunks = [];
      for (let k = 0; k < T.length - 1; k += CH) {
        chunks.push({ type: 'Feature', properties: { c: k / CH }, geometry: { type: 'LineString', coordinates: coords.slice(k, Math.min(k + CH + 1, T.length)) } });
      }
      map.addSource('doneChunks', { type: 'geojson', data: { type: 'FeatureCollection', features: chunks } });
      map.addSource('done', { type: 'geojson', data: lineTo(t) });
      map.addSource('stations', {
        type: 'geojson', data: {
          type: 'FeatureCollection', features: stations.map((s, k) => ({
            type: 'Feature', id: k, properties: { k, num: String(k), name: s.name, port: s.type === 'port' ? 1 : 0 },
            geometry: { type: 'Point', coordinates: [s.lon, s.lat] }
          }))
        }
      });
      map.addSource('photos', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      if (C.haloOp) map.addLayer({ id: 'route-halo', type: 'line', source: 'route', paint: { 'line-color': C.halo, 'line-width': 5, 'line-opacity': C.haloOp }, layout: { 'line-join': 'round' } });
      map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': C.todo, 'line-width': C.todoW, 'line-dasharray': C.todoDash, 'line-opacity': C.todoOp }, layout: { 'line-join': 'round' } });
      map.addLayer({ id: 'route-hit', type: 'line', source: 'route', paint: { 'line-color': '#000', 'line-width': 14, 'line-opacity': 0 } });
      if (C.doneGlow) {
        map.addLayer({ id: 'doneGlowC', type: 'line', source: 'doneChunks', filter: ['<', ['get', 'c'], -1], paint: { 'line-color': C.done, 'line-width': C.doneW * 3.5, 'line-opacity': .22, 'line-blur': 5 } });
        map.addLayer({ id: 'doneGlow', type: 'line', source: 'done', paint: { 'line-color': C.done, 'line-width': C.doneW * 3.5, 'line-opacity': .22, 'line-blur': 5 } });
      }
      const ds = { paint: { 'line-color': C.done, 'line-width': C.doneW }, layout: { 'line-join': 'round', 'line-cap': 'round' } };
      map.addLayer(Object.assign({ id: 'doneChunks', type: 'line', source: 'doneChunks', filter: ['<', ['get', 'c'], -1] }, ds));
      map.addLayer(Object.assign({ id: 'done', type: 'line', source: 'done' }, ds));
      map.addLayer({
        id: 'photos', type: 'circle', source: 'photos',
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 9, 4.5], 'circle-color': C.photo, 'circle-stroke-color': C.photoStroke, 'circle-stroke-width': 1.5, 'circle-opacity': ['case', ['get', 'past'], 1, 0.3], 'circle-stroke-opacity': ['case', ['get', 'past'], 1, 0.3] }
      });
      map.addImage('anchor', anchorIcon(C.anchorBg, C.anchorFg), { pixelRatio: 2 });
      map.addLayer({
        id: 'ports', type: 'circle', source: 'stations', filter: ['==', ['get', 'port'], 1],
        paint: { 'circle-radius': 7, 'circle-color': C.port, 'circle-stroke-color': C.portStroke, 'circle-stroke-width': 2 }
      });
      map.addLayer({
        id: 'stations', type: 'symbol', source: 'stations', filter: ['==', ['get', 'port'], 0],
        layout: { 'icon-image': 'anchor', 'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.7, 8, 0.95], 'icon-allow-overlap': true, 'icon-ignore-placement': true }
      });
      map.addLayer({
        id: 'station-labels', type: 'symbol', source: 'stations', minzoom: 5.5,
        filter: ['!=', ['get', 'k'], stations.length - 1],
        layout: { 'text-field': TH.labelField || ['get', 'name'], 'text-font': C.labelFont, 'text-size': C.labelSize, 'text-offset': [1.3, 0], 'text-anchor': 'left', 'text-optional': true, 'text-letter-spacing': C.labelSpacing || 0 },
        paint: { 'text-color': C.label, 'text-halo-color': C.labelHalo, 'text-halo-width': 1.6 }
      });
      if (TH.onMapLoad) TH.onMapLoad(map, APP);

      const sh = TH.ship || {};
      const se = document.createElement('div'); se.className = 'shipm'; se.innerHTML = sh.html || '<div class="dotship"></div>';
      ship = new maplibregl.Marker({ element: se, anchor: sh.anchor || 'center', offset: sh.offset || [0, 0], rotationAlignment: 'map' }).setLngLat([LON[0], LAT[0]]).addTo(map);
      if (TH.tag !== false) {
        const te = document.createElement('div'); te.className = 'shiptag'; te.innerHTML = '<div id="boatTag"></div>';
        tag = new maplibregl.Marker({ element: te, anchor: 'left', offset: TH.tagOffset || [26, 0] }).setLngLat([LON[0], LAT[0]]).addTo(map);
      }

      ['photos', 'stations', 'ports', 'route-hit'].forEach((l) => {
        map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
      });
      map.on('click', (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ['photos', 'stations', 'ports', 'route-hit'] });
        if (!f.length) return;
        const top = f.find((x) => x.layer.id === 'photos') || f.find((x) => x.layer.id === 'stations' || x.layer.id === 'ports') || f[0];
        if (top.layer.id === 'photos') openLb(top.properties.k);
        else if (top.layer.id === 'stations' || top.layer.id === 'ports') { const s = stations[top.properties.k]; pause(); setT(s.a); stationPopup(s); }
        else { pause(); setT(nearestT(e.lngLat)); }
      });
      const p = posAt(t); map.jumpTo({ center: [p.lon, p.lat], zoom: TH.zoom || 6 });
      render(true);
      if (photos.length) updatePhotoLayer(true);
    });
  }

  function anchorIcon(bg, fg) {
    const S = 52, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2);
    g.fillStyle = bg; g.fill(); g.lineWidth = 3; g.strokeStyle = fg; g.stroke();
    g.strokeStyle = fg; g.lineWidth = 3.4; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.arc(26, 13.5, 3.6, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(26, 17.5); g.lineTo(26, 40); g.stroke();
    g.beginPath(); g.moveTo(19, 22.5); g.lineTo(33, 22.5); g.stroke();
    g.beginPath(); g.moveTo(13, 30); g.quadraticCurveTo(15, 40, 26, 40.5); g.quadraticCurveTo(37, 40, 39, 30); g.stroke();
    g.beginPath(); g.moveTo(10.5, 32.5); g.lineTo(13, 29); g.lineTo(16.5, 31.5); g.stroke();
    g.beginPath(); g.moveTo(41.5, 32.5); g.lineTo(39, 29); g.lineTo(35.5, 31.5); g.stroke();
    return g.getImageData(0, 0, S, S);
  }

  function stationPopup(s) {
    const range = s.a === s.b ? fmtDate(t0 + s.a * 1000) + ' · ' + fmtTime(t0 + s.a * 1000)
      : fmtDate(t0 + s.a * 1000, false) + ' ' + fmtTime(t0 + s.a * 1000) + ' – ' + fmtDate(t0 + s.b * 1000, false) + ' ' + fmtTime(t0 + s.b * 1000);
    new maplibregl.Popup({ offset: 12, closeButton: false, className: 'stpop' }).setLngLat([s.lon, s.lat])
      .setHTML('<b>' + s.name + '</b><br><span>' + s.sub + '</span><br><span class="mono">' + range + '</span>').addTo(map);
  }

  function nearestT(ll) {
    let best = 0, bd = Infinity;
    const c = Math.cos(ll.lat * rad);
    for (let k = 0; k < T.length; k += 2) {
      const dx = (LON[k] - ll.lng) * c, dy = LAT[k] - ll.lat, dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = k; }
    }
    return T[best];
  }

  const CH = 120;
  function lineTo(s) {
    const p = posAt(s);
    const c = [];
    for (let k = Math.floor(p.i / CH) * CH; k <= p.i; k++) c.push([LON[k], LAT[k]]);
    c.push([p.lon, p.lat]);
    if (c.length < 2) c.push([p.lon, p.lat]);
    return { type: 'Feature', geometry: { type: 'LineString', coordinates: c } };
  }

  // ---------- Zeit setzen / rendern ----------
  function setT(s) { t = Math.max(0, Math.min(tEnd, s)); render(); }

  let lastLineIdx = -1, lastHash = 0, lastStationKey = '';
  function render(force) {
    const p = posAt(t);
    const ms = t0 + t * 1000;

    const sl = $('slider');
    sl.value = Math.round(t / tEnd * 1000);
    sl.style.setProperty('--p', (t / tEnd * 100) + '%');
    $('bar').style.width = (p.d / totalNm * 100) + '%';
    $('pDone').textContent = fmt(p.d) + ' sm';

    const startLocalDay = Math.floor((t0 + LOCAL_OFFSET_H * 3600000) / DAY_MS);
    const day = Math.floor((ms + LOCAL_OFFSET_H * 3600000) / DAY_MS) - startLocalDay + 1;
    curDay = day;
    $('sDay').textContent = day;
    $('sDate').textContent = fmtDate(ms) + ' ' + fmtTime(ms);
    $('clock').textContent = fmtDate(ms) + ' 2020 · ' + fmtTime(ms) + ' Uhr';
    $('sLat').innerHTML = fmt(Math.abs(p.lat), 2) + '<small>°S</small>';
    $('sLon').textContent = fmt(Math.abs(p.lon), 2) + '° W';

    const m = motionAt(t);
    lastSog = m.sog;
    $('sSog').textContent = fmt(m.sog, 1);
    $('sCog').textContent = m.anchored ? 'vor Anker / im Hafen' : 'Kurs ' + Math.round(m.cog) + '° ' + compass(m.cog);
    $('sLeft').textContent = fmt(totalNm - p.d);
    const days = t / 86400;
    $('sAvg').textContent = days > 0.5 ? 'Ø ' + fmt(p.d / days) + ' sm/Tag' : '';

    if (map && map.getSource('done')) {
      const ch = Math.floor(p.i / CH);
      if (ch !== lastLineIdx || force) {
        lastLineIdx = ch;
        map.setFilter('doneChunks', ['<', ['get', 'c'], ch]);
        if (map.getLayer('doneGlowC')) map.setFilter('doneGlowC', ['<', ['get', 'c'], ch]);
      }
      const ld = lineTo(t);
      map.getSource('done').setData(ld);
      ship.setLngLat([p.lon, p.lat]);
      if (tag) tag.setLngLat([p.lon, p.lat]);
      const sh = TH.ship || {};
      if (!m.anchored) {
        if (sh.mode === 'rotate') ship.setRotation(m.cog);
        else if (sh.mode === 'flip') ship.getElement().classList.toggle('west', m.cog > 180);
      }
      if (followOn) follow(p);
    }

    let cur = -1, next = -1;
    stations.forEach((s, k) => { if (s.a <= t + 1) cur = k; if (next < 0 && s.a > t + 1) next = k; });
    const atStation = cur >= 0 && t <= stations[cur].b + 60 && stations[cur].b > stations[cur].a;
    const sk = cur + '|' + next + '|' + atStation;
    if (sk !== lastStationKey || force) {
      lastStationKey = sk;
      document.querySelectorAll('#tl li').forEach((li, k) => {
        li.classList.toggle('done', k <= cur);
        li.classList.toggle('cur', k === cur && atStation);
      });
    }
    if (atStation) {
      $('nextLab').textContent = '⚓ Vor Anker';
      $('nName').textContent = stations[cur].name;
      $('nDist').textContent = '· ' + stations[cur].sub;
    } else if (next >= 0) {
      $('nextLab').textContent = next === stations.length - 1 ? 'Ziel' : 'Nächster Ankerplatz';
      $('nName').textContent = stations[next].name;
      $('nDist').textContent = '· noch ' + fmt(Math.max(0, stations[next].d - p.d)) + ' sm';
    } else {
      $('nextLab').textContent = 'Angekommen';
      $('nName').textContent = 'Ushuaia';
      $('nDist').textContent = '· ' + fmt(totalNm) + ' sm in 25 Tagen';
    }

    updateBoatTag();
    scheduleWx(p);
    updateThumbs();
    if (photos.length) updatePhotoLayer();
    if (TH.onRender) TH.onRender(APP, { t, ms, p, m, day, cur, next, atStation, force });

    const now = performance.now();
    if (!playing && now - lastHash > 300) {
      lastHash = now;
      history.replaceState(null, '', '#t=' + loc(ms).toISOString().slice(0, 16));
    }
  }

  function follow(p) {
    if (map.isEasing && map.isEasing()) return;
    map.jumpTo({ center: [p.lon, p.lat] });
  }
  function setFollow(on) {
    followOn = on;
    const b = document.getElementById('followBtn'); if (b) b.classList.toggle('on', on);
    if (on && map) { const p = posAt(t); map.easeTo({ center: [p.lon, p.lat], duration: 600 }); }
  }

  // ---------- Stationen-Liste ----------
  function buildTimeline() {
    const ol = document.getElementById('tl'); if (!ol) return;
    stations.forEach((s, k) => {
      const li = document.createElement('li');
      const nights = Math.round((s.b - s.a) / 86400);
      const leg = k ? fmt(s.d - stations[k - 1].d) + ' sm' : '';
      const when = s.a === s.b ? fmtDate(t0 + s.a * 1000) + ', ' + fmtTime(t0 + s.a * 1000)
        : fmtDate(t0 + s.a * 1000) + ', ' + fmtTime(t0 + s.a * 1000) + (nights >= 1 ? ' · ' + nights + (nights === 1 ? ' Nacht' : ' Nächte') : '');
      li.innerHTML = (TH.tlNum ? '<span class="no">' + (s.type === 'port' ? '●' : k) + '</span>' : '') + '<div class="d">' + when + (leg ? ' · +' + leg : '') + '</div><div class="n">' + s.name + '</div><div class="s">' + s.sub + '</div>';
      li.onclick = () => { pause(); setT(s.a); if (map) map.easeTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 8), duration: 900 }); };
      ol.appendChild(li);
    });
  }

  // ---------- Player ----------
  function play() {
    if (t >= tEnd - 1) t = 0;
    playing = true; document.body.classList.add('playing');
    $('play').textContent = '❚❚'; lastFrame = performance.now();
    requestAnimationFrame(tick);
  }
  function pause() { playing = false; document.body.classList.remove('playing'); $('play').textContent = '▶'; }
  function tick(now) {
    if (!playing) return;
    const dtR = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
    const p0 = posAt(t), p1 = posAt(t + 1800);
    const still = hav(p0.lat, p0.lon, p1.lat, p1.lon) < 0.2;
    t += dtR * BASE_RATE * SPEEDS[speedIdx] * (still ? 4 : 1);
    if (t >= tEnd) { t = tEnd; pause(); }
    render();
    if (playing) requestAnimationFrame(tick);
  }
  $('play').onclick = () => (playing ? pause() : play());
  const spTxt = () => String(SPEEDS[speedIdx]).replace('.', ',') + '×';
  $('speed').textContent = spTxt();
  $('speed').onclick = () => { speedIdx = (speedIdx + 1) % SPEEDS.length; $('speed').textContent = spTxt(); };
  $('slider').oninput = (e) => { pause(); setT(e.target.value / 1000 * tEnd); };
  document.addEventListener('keydown', (e) => {
    const lb = document.getElementById('lb');
    if (lb && !lb.hidden) {
      if (e.key === 'Escape') closeLb();
      if (e.key === 'ArrowRight') stepLb(1);
      if (e.key === 'ArrowLeft') stepLb(-1);
      return;
    }
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
    if (e.key === 'ArrowRight') { pause(); setT(t + 3 * 3600); }
    if (e.key === 'ArrowLeft') { pause(); setT(t - 3 * 3600); }
  });

  // ---------- Wetter (ERA5 via Open-Meteo Archive) ----------
  const VARS = 'temperature_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl';
  const wxCache = new Map();
  let wxTimer = null;
  $('wxToggle').onchange = (e) => { wxOn = e.target.checked; $('wx').classList.toggle('off', !wxOn); wxCur = null; render(true); };

  function scheduleWx(p) {
    if (!wxOn) return;
    clearTimeout(wxTimer);
    wxTimer = setTimeout(() => showWx(p), playing ? 250 : 60);
  }
  function wxFetch(la, lo, s, e) {
    const key = la + ',' + lo + ',' + s + ',' + e;
    if (wxCache.has(key)) return wxCache.get(key);
    const url = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + la + '&longitude=' + lo +
      '&start_date=' + s + '&end_date=' + e + '&hourly=' + VARS + '&wind_speed_unit=kn&timezone=GMT&cell_selection=nearest';
    const pr = fetch(url).then((r) => r.json()).then((j) => {
      const h = j.hourly; const idx = new Map();
      h.time.forEach((x, i) => idx.set(Date.parse(x + ':00Z'), i));
      return { h, idx };
    }).catch(() => { wxCache.delete(key); return null; });
    wxCache.set(key, pr);
    return pr;
  }
  function showWx(p) {
    const ms = t0 + t * 1000;
    const la = Math.round(p.lat * 4) / 4, lo = Math.round(p.lon * 4) / 4;
    const d = new Date(new Date(ms).toISOString().slice(0, 10) + 'T00:00:00Z');
    const s = new Date(d - DAY_MS).toISOString().slice(0, 10), e = new Date(+d + DAY_MS).toISOString().slice(0, 10);
    wxFetch(la, lo, s, e).then((w) => {
      if (!w || !wxOn) return;
      const hr = Math.round(ms / 3600000) * 3600000;
      const i = w.idx.get(hr); if (i == null) return;
      const H = w.h;
      const prev = w.idx.get(hr - 3 * 3600000);
      const dp = prev != null ? H.pressure_msl[i] - H.pressure_msl[prev] : 0;
      wxCur = {
        temp: H.temperature_2m[i], feel: H.apparent_temperature[i], wind: H.wind_speed_10m[i], gust: H.wind_gusts_10m[i],
        dir: H.wind_direction_10m[i], pres: H.pressure_msl[i], dp, bft: beaufort(H.wind_speed_10m[i])
      };
      $('wTemp').textContent = fmt(wxCur.temp) + '°';
      $('wFeel').textContent = fmt(wxCur.feel) + '°';
      $('wBft').textContent = BFT_NAME[wxCur.bft] + ' aus ' + compass(wxCur.dir) + ' · ' + wxCur.bft + ' Bft';
      $('wWind').textContent = fmt(wxCur.wind);
      $('wDir').textContent = compass(wxCur.dir);
      $('wArr').style.transform = 'rotate(' + wxCur.dir + 'deg)';
      $('wGust').textContent = fmt(wxCur.gust);
      $('wPres').textContent = fmt(wxCur.pres);
      $('wTrend').textContent = dp > 0.8 ? '↗' : dp < -0.8 ? '↘' : '→';
      const ld = loc(ms); const localMidnightUtc = Date.UTC(ld.getUTCFullYear(), ld.getUTCMonth(), ld.getUTCDate()) - LOCAL_OFFSET_H * 3600000;
      const curLocalH = ld.getUTCHours();
      let html = '';
      for (let hh = 1; hh < 24; hh += 3) {
        const j = w.idx.get(localMidnightUtc + hh * 3600000);
        const isNow = curLocalH >= hh - 1 && curLocalH < hh + 2;
        if (j == null) { html += '<div><div class="h">' + pad(hh) + '</div><div class="t">–</div><div class="w">–</div></div>'; continue; }
        const wk = H.wind_speed_10m[j];
        html += '<div class="' + (isNow ? 'now' : '') + '"><div class="h">' + pad(hh) + '</div><div class="t">' + fmt(H.temperature_2m[j]) + '°</div><div class="w' + (wk >= 22 ? ' hi' : '') + '">' + Math.round(wk) + '</div></div>';
      }
      $('wHours').innerHTML = html;
      updateBoatTag();
      if (TH.onWx) TH.onWx(APP, wxCur);
    });
  }
  // Wetter der ganzen Reise (je Tag an der Position um 12 Uhr Ortszeit), für Barograph und Logbuch.
  // Eine einzige Anfrage mit 26 Orten, im Browser zwischengespeichert.
  let seriesP = null;
  function series() {
    if (seriesP) return seriesP;
    const KEY = 'sww-series-v1';
    const build = (arr) => {
      const out = { time: [], pres: [], wind: [], dir: [], temp: [] };
      arr.forEach((h) => h.time.forEach((x, i) => {
        out.time.push(Date.parse(x + ':00Z')); out.pres.push(h.pressure_msl[i]); out.wind.push(h.wind_speed_10m[i]);
        out.dir.push(h.wind_direction_10m[i]); out.temp.push(h.temperature_2m[i]);
      }));
      const idx = new Map(out.time.map((ms, i) => [ms, i]));
      out.at = (ms) => { const i = idx.get(Math.round(ms / 3600000) * 3600000); return i == null ? null : { pres: out.pres[i], wind: out.wind[i], dir: out.dir[i], temp: out.temp[i] }; };
      return out;
    };
    try { const c = JSON.parse(localStorage.getItem(KEY)); if (c && c.length) return (seriesP = Promise.resolve(build(c))); } catch (e) { /* kein Speicher */ }
    const days = [];
    for (let d = Date.UTC(2020, 1, 3); d <= Date.UTC(2020, 1, 28); d += DAY_MS) days.push(d);
    const pos = days.map((d) => posAt((d + 15 * 3600000 - t0) / 1000));
    const url = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + pos.map((p) => p.lat.toFixed(2)).join(',') +
      '&longitude=' + pos.map((p) => p.lon.toFixed(2)).join(',') + '&start_date=2020-02-03&end_date=2020-02-28' +
      '&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,pressure_msl&wind_speed_unit=kn&timezone=GMT&cell_selection=nearest';
    seriesP = fetch(url).then((r) => r.json()).then((j) => {
      const list = Array.isArray(j) ? j : [j];
      // je Ort nur „seinen“ Tag übernehmen
      const arr = list.map((loc, k) => {
        const day = new Date(days[k]).toISOString().slice(0, 10), H = loc.hourly, keep = { time: [], pressure_msl: [], wind_speed_10m: [], wind_direction_10m: [], temperature_2m: [] };
        H.time.forEach((x, i) => { if (x.startsWith(day)) Object.keys(keep).forEach((key) => keep[key].push(H[key][i])); });
        return keep;
      });
      try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) { /* voll */ }
      return build(arr);
    }).catch(() => { seriesP = null; return build([]); });
    return seriesP;
  }

  function updateBoatTag() {
    const el = document.getElementById('boatTag'); if (!el) return;
    if (TH.tagHtml) { el.innerHTML = TH.tagHtml(APP, { day: curDay, sog: lastSog, wx: wxOn ? wxCur : null }); return; }
    el.innerHTML = '<span class="day">Tag ' + curDay + '</span>' + (wxOn && wxCur
      ? '<b>' + fmt(wxCur.temp) + '°</b> <span style="display:inline-block;transform:rotate(' + wxCur.dir + 'deg)">↓</span> ' + Math.round(wxCur.wind) + ' kn'
      : '<b>' + fmt(lastSog, 1) + '</b> kn');
  }

  // ---------- Fotos (im Repo, ohne Personen, ohne Metadaten) ----------
  function loadPhotos() {
    fetch(BASE + 'data/photos.json').then((r) => r.json()).then((list) => {
      photos = list.map((x) => ({
        title: x.title, s: (Date.parse(x.taken + 'Z') - t0) / 1000 + PHOTO_CLOCK_OFFSET_S,
        q: BASE + 'photos/t/' + x.f + '.jpg', m: BASE + 'photos/t/' + x.f + '.jpg', big: BASE + 'photos/' + x.f + '.jpg'
      })).filter((x) => x.s >= -3600 && x.s <= tEnd + 3600).sort((a, b) => a.s - b.s);
      photos.forEach((ph, k) => { ph.k = k; const p = posAt(ph.s); ph.lat = p.lat; ph.lon = p.lon; });
      updatePhotoLayer(true);
      updateThumbs(true);
      if (TH.onPhotos) TH.onPhotos(APP, photos);
    }).catch(() => { $('thumbs').innerHTML = ''; });
  }
  let lastPastCount = -1;
  function updatePhotoLayer(force) {
    if (!map || !map.getSource('photos')) return;
    let past = 0; photos.forEach((p) => { if (p.s <= t) past++; });
    if (!force && past === lastPastCount) return;
    lastPastCount = past;
    map.getSource('photos').setData({
      type: 'FeatureCollection', features: photos.map((p) => {
        const j = ((p.k * 2654435761) % 1000) / 1000, a = j * Math.PI * 2, r = 0.004 * (0.3 + ((p.k * 40503) % 100) / 140);
        return { type: 'Feature', properties: { k: p.k, past: p.s <= t }, geometry: { type: 'Point', coordinates: [p.lon + Math.cos(a) * r * 2.3, p.lat + Math.sin(a) * r] } };
      })
    });
  }
  let lastThumbKey = '';
  function updateThumbs(force) {
    const box = document.getElementById('thumbs');
    if (!photos.length || !box) return;
    let i = -1; photos.forEach((p, k) => { if (p.s <= t + 60) i = k; });
    const n = TH.thumbCount || 6;
    const sel = i < 0 ? photos.slice(0, n) : photos.slice(Math.max(0, i - n + 1), i + 1).reverse();
    const key = sel.map((p) => p.k).join();
    if (key === lastThumbKey && !force) return;
    lastThumbKey = key;
    box.innerHTML = sel.map((p) =>
      '<button data-k="' + p.k + '" title="' + (p.title || 'Foto') + '"><img loading="lazy" src="' + p.q + '" alt="' + (p.title || 'Foto') + '"><span>' +
      fmtDate(t0 + p.s * 1000, false) + ' ' + fmtTime(t0 + p.s * 1000) + '</span></button>').join('');
    box.querySelectorAll('button').forEach((b) => { b.onclick = () => openLb(+b.dataset.k); });
  }

  // ---------- Lightbox ----------
  let lbK = 0;
  function openLb(k) {
    pause();
    lbK = k; const p = photos[k];
    $('lbImg').src = p.big; $('lbImg').alt = p.title || 'Foto';
    $('lbT').textContent = p.title || 'Sarah W. Vorwerk';
    $('lbM').textContent = fmtDate(t0 + p.s * 1000) + ' ' + fmtTime(t0 + p.s * 1000) + ' · ' + fmt(Math.abs(p.lat), 2) + '°S ' + fmt(Math.abs(p.lon), 2) + '°W · ' + (k + 1) + '/' + photos.length;
    $('lb').hidden = false;
    setT(p.s);
  }
  function stepLb(d) { openLb((lbK + d + photos.length) % photos.length); }
  function closeLb() { $('lb').hidden = true; $('lbImg').src = ''; }
  $('lbX').onclick = closeLb;
  $('lbP').onclick = () => stepLb(-1);
  $('lbN').onclick = () => stepLb(1);
  $('lb').onclick = (e) => { if (e.target.id === 'lb') closeLb(); };
})();

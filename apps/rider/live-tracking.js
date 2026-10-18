(() => {
  'use strict';
  const panel = document.getElementById('trip-live-tracking');
  if (!panel) return;
  const $ = id => document.getElementById(id);
  const tokenKey = 'rohny_access_token';
  const pendingOrActive = new Set(['pending', 'accepted', 'driver_arriving', 'in_progress']);
  const terminal = new Set(['completed', 'cancelled']);
  const active = new Set(['accepted', 'driver_arriving', 'in_progress']);
  const labels = {
    pending: 'قيد البحث عن كابتن',
    accepted: 'تم قبول الرحلة',
    driver_arriving: 'الكابتن في الطريق إليك',
    in_progress: 'الرحلة جارية',
    completed: 'وصلت بأمان',
    cancelled: 'تم إلغاء الرحلة'
  };
  const steps = [
    { key: 'pending', title: 'تم إرسال طلب الرحلة', detail: 'طلبك وصل، وبنبحث عن كابتن متاح.' },
    { key: 'accepted', title: 'الكابتن قبل الرحلة', detail: 'تم قبول طلبك وتجهيز الكابتن للتحرك.' },
    { key: 'driver_arriving', title: 'الكابتن في الطريق إليك', detail: 'تابع موقع الكابتن ومساره على الخريطة.' },
    { key: 'in_progress', title: 'بدأت الرحلة', detail: 'الكابتن في طريقه إلى وجهتك.' },
    { key: 'completed', title: 'وصلت بأمان', detail: 'تم إنهاء الرحلة بنجاح.' }
  ];
  let map = null, tripId = '', pickupMarker = null, destMarker = null, driverMarker = null;
  let routeLine = null, routeKey = '', routeAt = 0, lastOrigin = null, routeReq = 0, busy = false;
  const apiBase = window.ROHNY_API_BASE || '';

  async function api(path) {
    const token = sessionStorage.getItem(tokenKey) || '';
    if (!token) throw new Error('سجّل الدخول لمتابعة الرحلة.');
    const r = await fetch(apiBase + path, { headers: { Accept: 'application/json', Authorization: 'Bearer ' + token } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || 'تعذّر تحديث متابعة الرحلة.');
    return d;
  }

  function renderStages(status) {
    const container = $('trip-live-stages');
    if (!container) return;
    container.replaceChildren();
    if (status === 'cancelled') {
      const request = document.createElement('div');
      request.className = 'rider-trip-stage rider-trip-stage--done';
      request.setAttribute('role', 'listitem');
      request.innerHTML = '<span class="rider-trip-stage-dot" aria-hidden="true">✓</span><span class="rider-trip-stage-copy"><strong>تم إرسال طلب الرحلة</strong><small>تم تسجيل طلبك على ROHNY.</small></span>';
      container.append(request);
      const cancelled = document.createElement('div');
      cancelled.className = 'rider-trip-stage rider-trip-stage--cancelled';
      cancelled.setAttribute('role', 'listitem');
      cancelled.innerHTML = '<span class="rider-trip-stage-dot" aria-hidden="true">×</span><span class="rider-trip-stage-copy"><strong>تم إلغاء الرحلة</strong><small>هذا الطلب انتهى بالإلغاء.</small></span>';
      container.append(cancelled);
      return;
    }
    const current = Math.max(0, steps.findIndex(step => step.key === status));
    steps.forEach((step, i) => {
      const state = i < current ? 'done' : i === current ? 'current' : 'upcoming';
      const item = document.createElement('div');
      item.className = 'rider-trip-stage rider-trip-stage--' + state;
      item.setAttribute('role', 'listitem');
      const dot = document.createElement('span');
      dot.className = 'rider-trip-stage-dot';
      dot.setAttribute('aria-hidden', 'true');
      dot.textContent = state === 'done' ? '✓' : String(i + 1);
      const copy = document.createElement('span');
      copy.className = 'rider-trip-stage-copy';
      const title = document.createElement('strong');
      title.textContent = step.title;
      const detail = document.createElement('small');
      detail.textContent = step.detail;
      copy.append(title, detail);
      item.append(dot, copy);
      container.append(item);
    });
  }

  function icon(kind, label) {
    return L.divIcon({ className: 'rohny-leaflet-marker', html: '<span class="rohny-map-pin rohny-map-pin--' + kind + '"><span>' + label + '</span></span>', iconSize: [42, 48], iconAnchor: [21, 42], popupAnchor: [0, -38] });
  }
  function initMap() {
    if (map) return;
    if (!window.L) throw new Error('تعذّر تحميل الخريطة.');
    map = L.map('rider-live-map').setView([30.0131, 31.2089], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, className: 'rohny-map-tiles',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'
    }).addTo(map);
  }
  function distance(a, b) {
    if (!a || !b) return Infinity;
    const rad = x => x * Math.PI / 180, d1 = rad(b[0] - a[0]), d2 = rad(b[1] - a[1]);
    const h = Math.sin(d1 / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(d2 / 2) ** 2;
    return 12742000 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }
  async function route(from, to, key) {
    const id = ++routeReq;
    try {
      const coords = from[1] + ',' + from[0] + ';' + to[1] + ',' + to[0];
      const r = await fetch('https://router.project-osrm.org/route/v1/driving/' + coords + '?overview=full&geometries=geojson&steps=false');
      if (!r.ok) throw Error();
      const d = await r.json();
      if (id !== routeReq || key !== routeKey) return;
      if (d.code !== 'Ok' || !d.routes?.length) throw Error();
      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.polyline(d.routes[0].geometry.coordinates.map(p => [p[1], p[0]]), {
        color: '#c8f58c', weight: 6, opacity: .98, className: 'rohny-route-line', lineCap: 'round', lineJoin: 'round'
      }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [28, 28], maxZoom: 16 });
    } catch (_) {
      if (id !== routeReq || key !== routeKey) return;
      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.polyline([from, to], { color: '#c8f58c', weight: 4, opacity: .8, dashArray: '7 8' }).addTo(map);
      map.fitBounds([from, to], { padding: [28, 28], maxZoom: 15 });
      $('trip-live-updated').textContent = 'تعذّر حساب طريق الشوارع الآن؛ يظهر خط تقريبي بين النقطتين.';
    }
  }

  async function refresh() {
    if (busy || document.visibilityState !== 'visible') return;
    busy = true;
    try {
      const token = sessionStorage.getItem(tokenKey) || '';
      if (!token) { panel.hidden = true; return; }
      const trips = await api('/trips/mine');
      if (!Array.isArray(trips)) return;
      // /trips/mine is newest-first; prefer a pending/active trip, otherwise retain the most recent finished result.
      const trip = trips.find(t => pendingOrActive.has(t.status)) || trips.find(t => terminal.has(t.status));
      if (!trip) { panel.hidden = true; return; }
      panel.hidden = false;
      $('trip-live-status-badge').textContent = labels[trip.status] || trip.status;
      renderStages(trip.status);
      const mapSection = $('trip-live-map-section');
      const isLive = pendingOrActive.has(trip.status);
      mapSection.hidden = !isLive;
      $('trip-live-title').textContent = ({
        pending: 'طلبك قيد البحث عن كابتن',
        accepted: 'تم قبول رحلتك',
        driver_arriving: 'الكابتن في طريقه إليك',
        in_progress: 'مشوارك على الطريق',
        completed: 'وصلت بأمان',
        cancelled: 'تم إلغاء الرحلة'
      })[trip.status] || 'متابعة رحلتك';
      $('trip-live-message').textContent = ({
        pending: 'تم إرسال طلبك بنجاح. بنبحث عن كابتن متاح، وهتظهر لك المراحل هنا أولًا بأول.',
        accepted: 'الكابتن قبل رحلتك. عند وصول أول تحديث للموقع هتشوف مكانه على الخريطة.',
        driver_arriving: 'الكابتن في الطريق إليك؛ تابع موقعه ومساره هنا.',
        in_progress: 'بدأت الرحلة؛ الخريطة بتعرض مسار الكابتن إلى وجهتك.',
        completed: 'رحلتك انتهت بنجاح. تقدر تراجع التفاصيل في سجل رحلاتك.',
        cancelled: 'تم إلغاء طلب الرحلة. تقدر تطلب رحلة جديدة في أي وقت.'
      })[trip.status] || 'حالة الرحلة الحالية.';
      if (!isLive) {
        window.__rohnyLastTrackedStatus = trip.status;
        window.__rohnyLastTrackedTripId = trip.id;
        return;
      }
      $('trip-live-map-subtitle').textContent = trip.status === 'pending'
        ? 'خط سير رحلتك ونقطتا الركوب والوجهة'
        : trip.status === 'in_progress' ? 'مسار الرحلة إلى وجهتك' : 'موقع الكابتن ومساره إلى نقطة ركوبك';
      const d = await api('/trips/' + encodeURIComponent(trip.id) + '/location');
      if (d.status !== trip.status) return;
      initMap();
      const p = [Number(d.pickupLatitude), Number(d.pickupLongitude)];
      const dest = [Number(d.destinationLatitude), Number(d.destinationLongitude)];
      if (![...p, ...dest].every(Number.isFinite)) throw Error('إحداثيات الرحلة غير مكتملة.');
      if (tripId !== d.tripId) {
        if (routeLine) map.removeLayer(routeLine);
        [pickupMarker, destMarker, driverMarker].filter(Boolean).forEach(m => map.removeLayer(m));
        routeLine = pickupMarker = destMarker = driverMarker = null;
        tripId = d.tripId; routeKey = ''; routeAt = 0; lastOrigin = null;
        pickupMarker = L.marker(p, { icon: icon('pickup', 'A'), zIndexOffset: 300 }).addTo(map).bindPopup('نقطة ركوبك: ' + (d.pickupAddress || 'نقطة الانطلاق'));
        destMarker = L.marker(dest, { icon: icon('destination', 'B'), zIndexOffset: 300 }).addTo(map).bindPopup('وجهتك: ' + (d.destinationAddress || 'الوجهة'));
      }
      const loc = d.driverLocation;
      const has = loc && Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude));
      if (has) {
        const cur = [Number(loc.latitude), Number(loc.longitude)];
        if (driverMarker) driverMarker.setLatLng(cur);
        else driverMarker = L.marker(cur, { icon: icon('captain', 'R'), zIndexOffset: 700 }).addTo(map).bindPopup('موقع الكابتن الحالي');
        const onRide = d.status === 'in_progress', from = onRide ? p : cur, to = onRide ? dest : p;
        const moved = distance(lastOrigin, cur);
        const need = !routeKey || (!onRide && moved > 180) || Date.now() - routeAt > 25000 || (onRide && !routeKey.includes(':destination:'));
        if (need) {
          routeKey = d.tripId + (onRide ? ':destination:' : ':pickup:') + Date.now();
          lastOrigin = cur; routeAt = Date.now(); void route(from, to, routeKey);
        }
        const when = loc.recordedAt ? new Date(loc.recordedAt) : null;
        $('trip-live-updated').textContent = when && !Number.isNaN(when.getTime())
          ? 'آخر تحديث لموقع الكابتن: ' + when.toLocaleTimeString('ar-EG')
          : 'موقع الكابتن بيتحدّث تلقائيًا.';
      } else {
        $('trip-live-updated').textContent = trip.status === 'pending'
          ? 'في انتظار قبول كابتن لطلبك. بعد القبول هيظهر موقعه هنا.'
          : 'في انتظار أول تحديث لموقع الكابتن. تأكد أن تطبيق الكابتن مفتوح وإذن الموقع مسموح.';
        if (!routeKey) {
          map.fitBounds([p, dest], { padding: [28, 28], maxZoom: 15 });
          routeKey = d.tripId + ':waiting:' + Date.now();
          routeAt = Date.now(); void route(p, dest, routeKey);
        }
      }
      window.setTimeout(() => map && map.invalidateSize(), 100);
      // Keep the rider on the booking screen; the live map and stage list are embedded in this form.
    } catch (e) {
      const updated = $('trip-live-updated');
      if (updated) updated.textContent = e.message || 'تعذّر تحديث الموقع؛ ستتم إعادة المحاولة تلقائيًا.';
    } finally {
      busy = false;
    }
  }
  refresh();
  window.setInterval(refresh, 5000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
})();
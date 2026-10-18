(() => {
  'use strict';
  const tokenKey = 'rohny_driver_access_token';
  let token = sessionStorage.getItem(tokenKey) || '';
  let driverUser = null;
  try { driverUser = JSON.parse(sessionStorage.getItem('rohny_driver_user') || 'null'); } catch { driverUser = null; }
  const $ = (id) => document.getElementById(id);
  const loginPanel = $('loginPanel');
  const dashboard = $('dashboard');
  const accountView = $('accountView');
  const profileView = $('profileView');
  const profileForm = $('driverProfileForm');
  let profileImages = {};
  let audioContext = null;
  let ringingTimer = null;
  let ringingTripId = '';
  let tripsLoadInProgress = false;
  const loginForm = $('loginForm');
  const loginButton = $('loginButton');
  const loginStatus = $('loginStatus');
  const dashboardStatus = $('dashboardStatus');
  const assignedList = $('assignedList');
  const availableList = $('availableList');
  const topActions = $('topActions');
  const bottomNav = $('bottomNav');
  const availableCount = $('availableCount');
  const assignedCount = $('assignedCount');
  const historyPanel = $('historyPanel');
  const historyList = $('historyList');
  const historyCount = $('historyCount');
  const toggleHistory = $('toggleHistory');
  const historyArrow = $('historyArrow');
  let historyTrips = [];
  const transferredTripIds = new Set();
  const statusLabels = {
    pending: 'قيد الانتظار',
    accepted: 'تم قبول الرحلة',
    driver_arriving: 'السائق في الطريق',
    in_progress: 'الرحلة جارية',
    completed: 'مكتملة',
    cancelled: 'ملغاة'
  };
  const rideLabels = { economy: 'اقتصادي', scooter: 'اسكوتر', comfort: 'مريح', family: 'عائلي' };
  const paymentLabels = { cash: 'كاش', wallet: 'محفظة', card: 'بطاقة' };

  function unlockTripAudio() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioContext) audioContext = new AudioContextClass();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } catch (_) {}
  }

  function playTripAlert() {
    if (!audioContext || audioContext.state !== 'running') return;
    try {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(660, audioContext.currentTime + 0.22);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.22, audioContext.currentTime + 0.03);
      gain.gain.setValueAtTime(0.22, audioContext.currentTime + 0.28);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.38);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + 0.4);
    } catch (_) {}
  }

  function syncTripRinging(available) {
    const nextTripId = available.length ? String(available[0].id) : '';
    if (!nextTripId) {
      ringingTripId = '';
      if (ringingTimer) window.clearInterval(ringingTimer);
      ringingTimer = null;
      return;
    }
    ringingTripId = nextTripId;
    if (!ringingTimer) {
      playTripAlert();
      ringingTimer = window.setInterval(playTripAlert, 1400);
      dashboardStatus.textContent = 'رحلة جديدة متاحة — اقبلها أو ارفضها لإيقاف تنبيهها.';
    }
  }

  async function api(path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = Array.isArray(data.message) ? data.message.join('، ') : data.message;
      if (response.status === 401) signOut('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
      throw new Error(message || 'تعذّر الاتصال بالخادم.');
    }
    return data;
  }

  function showSignedIn(signedIn) {
    loginPanel.classList.toggle('hidden', signedIn);
    dashboard.classList.toggle('hidden', !signedIn);
    topActions.classList.toggle('hidden', !signedIn);
    bottomNav.classList.toggle('hidden', !signedIn);
    if (!signedIn) { accountView.classList.add('hidden'); profileView.classList.add('hidden'); dashboard.querySelector('.welcome').classList.remove('hidden'); dashboard.querySelector('.dashboard-grid').classList.remove('hidden'); historyPanel.classList.add('hidden'); }
    document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === 'trips'));
  }

  function signOut(message = 'تم تسجيل الخروج.') {
    token = '';
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem('rohny_driver_user');
    driverUser = null;
    showSignedIn(false);
    loginStatus.textContent = message;
  }

  function addRow(card, label, value) {
    const row = document.createElement('div');
    row.className = 'row';
    const key = document.createElement('span');
    key.textContent = label;
    const val = document.createElement('strong');
    val.textContent = value == null || value === '' ? '—' : String(value);
    row.append(key, val);
    card.append(row);
  }

  function tripCard(trip, assigned) {
    const card = document.createElement('article');
    card.className = 'trip';
    const tripHead = document.createElement('div'); tripHead.className = 'trip-head';
    const title = document.createElement('h3');
    title.textContent = 'رحلة #' + String(trip.id || '').slice(0, 8);
    const statusPill = document.createElement('span'); statusPill.className = 'pill'; statusPill.textContent = statusLabels[trip.status] || trip.status;
    tripHead.append(title, statusPill); card.append(tripHead);
    const route = document.createElement('div');
    route.className = 'route';
    const track = document.createElement('div');
    track.className = 'route-track';
    const startDot = document.createElement('span'); startDot.className = 'route-dot';
    const routeLine = document.createElement('span'); routeLine.className = 'route-line';
    const endDot = document.createElement('span'); endDot.className = 'route-dot end';
    track.append(startDot, routeLine, endDot);
    const addresses = document.createElement('div');
    const start = document.createElement('div'); start.innerHTML = '<div class="route-label">نقطة الركوب</div>';
    const startAddress = document.createElement('div'); startAddress.className = 'route-address'; startAddress.textContent = trip.pickupAddress || 'غير محدد'; start.append(startAddress);
    const destination = document.createElement('div'); destination.style.marginTop = '19px'; destination.innerHTML = '<div class="route-label">الوجهة</div>';
    const destinationAddress = document.createElement('div'); destinationAddress.className = 'route-address'; destinationAddress.textContent = trip.destinationAddress || 'غير محددة'; destination.append(destinationAddress);
    addresses.append(start, destination); route.append(track, addresses); card.append(route);
    addRow(card, 'الحالة', statusLabels[trip.status] || trip.status);
    addRow(card, 'نوع الرحلة', rideLabels[trip.rideType] || trip.rideType);
    addRow(card, 'عدد الركاب', trip.passengerCount);
    addRow(card, 'الدفع', paymentLabels[trip.paymentMethod] || trip.paymentMethod);
    if (trip.fareAmount != null && trip.fareCurrency) addRow(card, trip.riderFreeRide ? 'أجرة ممولة من ROHNY' : 'الأجرة التقديرية', Number(trip.fareAmount).toLocaleString('ar-EG', { maximumFractionDigits: 2 }) + ' ' + trip.fareCurrency);
    if (trip.riderFreeRide) addRow(card, 'حالة الدفع', 'الراكب لا يدفع — ROHNY تتحمل الأجرة');
    if (trip.cityCode) addRow(card, 'المدينة', trip.cityCode);
    const distance = trip.fareDistanceMeters ?? trip.estimatedDistanceMeters;
    if (distance != null) addRow(card, 'المسافة التقريبية', (distance / 1000).toLocaleString('ar-EG', { maximumFractionDigits: 1 }) + ' كم');
    const duration = trip.fareDurationSeconds ?? trip.estimatedDurationSeconds;
    if (duration != null) addRow(card, 'المدة التقريبية', Math.max(1, Math.round(duration / 60)).toLocaleString('ar-EG') + ' دقيقة');
    if (trip.scheduledAt) addRow(card, 'موعد الرحلة', new Date(trip.scheduledAt).toLocaleString('ar-EG'));
    if (trip.riderNote) addRow(card, 'ملاحظة الراكب', trip.riderNote);
    const actions = document.createElement('div');
    actions.className = 'actions';
    if (!assigned && trip.status === 'pending') {
      const accept = document.createElement('button');
      accept.type = 'button';
      accept.className = 'btn primary';
      accept.textContent = 'قبول الرحلة';
      accept.addEventListener('click', () => performTripAction(accept, trip.id, 'accept'));
      const reject = document.createElement('button');
      reject.type = 'button';
      reject.className = 'btn';
      reject.textContent = 'رفض الرحلة';
      reject.addEventListener('click', () => performTripAction(reject, trip.id, 'reject'));
      actions.append(accept, reject);
    } else if (assigned) {
      const next = {
        accepted: ['driver_arriving', 'أنا في الطريق للراكب'],
        driver_arriving: ['in_progress', 'بدء الرحلة'],
        in_progress: ['completed', 'إنهاء الرحلة']
      }[trip.status];
      if (next) {
        const advance = document.createElement('button');
        advance.type = 'button';
        advance.className = 'btn primary';
        advance.textContent = next[1];
        advance.addEventListener('click', () => performTripAction(advance, trip.id, next[0]));
        actions.append(advance);
      }
    }
    if (actions.childElementCount) card.append(actions);

    if (
      assigned &&
      trip.status === 'completed' &&
      trip.paymentMethod === 'cash' &&
      !trip.riderFreeRide &&
      trip.fareCurrency &&
      !transferredTripIds.has(trip.id)
    ) {
      const settlement = document.createElement('section');
      settlement.className = 'account-note';
      settlement.style.marginTop = '14px';
      const heading = document.createElement('strong');
      heading.textContent = 'تحويل باقي الأجرة إلى محفظة الراكب';
      const explanation = document.createElement('p');
      explanation.style.margin = '8px 0';
      explanation.textContent = 'استخدم هذا الإجراء فقط إذا دفع الراكب نقدًا ولم يتوفر معك الباقي، وبعد موافقته الشفهية. سيُخصم المبلغ من محفظتك ويُضاف إلى محفظة الراكب.';
      const form = document.createElement('form');
      form.style.display = 'grid';
      form.style.gap = '10px';
      const amount = document.createElement('input');
      amount.type = 'number';
      amount.min = '0.01';
      amount.step = '0.01';
      amount.required = true;
      amount.inputMode = 'decimal';
      amount.placeholder = 'قيمة الباقي (' + trip.fareCurrency + ')';
      amount.setAttribute('aria-label', 'قيمة الباقي الذي سيُحوّل للراكب');
      amount.style.cssText = 'width:100%;padding:12px;border-radius:12px;border:1px solid #2a4a3a;background:#071b15;color:var(--text)';
      const consentLabel = document.createElement('label');
      consentLabel.style.cssText = 'display:flex;align-items:flex-start;gap:8px;line-height:1.7';
      const consent = document.createElement('input');
      consent.type = 'checkbox';
      consent.required = true;
      consent.style.marginTop = '5px';
      const consentText = document.createElement('span');
      consentText.textContent = 'أؤكد أن الراكب وافق شفهيًا على إضافة الباقي إلى محفظته في ROHNY.';
      consentLabel.append(consent, consentText);
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.className = 'btn primary';
      submit.textContent = 'تأكيد تحويل الباقي';
      const status = document.createElement('div');
      status.className = 'msg';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      form.append(amount, consentLabel, submit, status);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const value = Number(amount.value);
        const digits = new Intl.NumberFormat('en-US', { style: 'currency', currency: trip.fareCurrency }).resolvedOptions().maximumFractionDigits ?? 2;
        const amountMinor = Math.round(value * (10 ** digits));
        if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(amountMinor)) {
          status.textContent = 'أدخل قيمة صحيحة للباقي.';
          return;
        }
        if (!consent.checked) {
          status.textContent = 'يجب تأكيد موافقة الراكب الشفهية أولًا.';
          return;
        }
        submit.disabled = true;
        status.textContent = 'جارٍ تنفيذ التحويل…';
        try {
          await api('/wallet/transfers', {
            method: 'POST',
            body: JSON.stringify({
              tripId: trip.id,
              amountMinor,
              currency: trip.fareCurrency,
              consentConfirmed: true,
              idempotencyKey: crypto.randomUUID()
            })
          });
          transferredTripIds.add(trip.id);
          status.textContent = 'تم تحويل الباقي إلى محفظة الراكب بنجاح.';
          form.replaceChildren(status);
          await Promise.all([loadAccount(), loadTrips()]);
        } catch (error) {
          status.textContent = error.message || 'تعذّر تحويل الباقي. لم يتم تأكيد نجاح العملية.';
          submit.disabled = false;
        }
      });
      settlement.append(heading, explanation, form);
      card.append(settlement);
    }
    return card;
  }

  async function performTripAction(button, tripId, action) {
    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = 'جارٍ التنفيذ…';
    try {
      if (action === 'accept') {
        await api('/trips/' + encodeURIComponent(tripId) + '/accept', { method: 'POST' });
      } else if (action === 'reject') {
        await api('/trips/' + encodeURIComponent(tripId) + '/reject', { method: 'POST' });
      } else {
        await api('/trips/' + encodeURIComponent(tripId) + '/status', {
          method: 'PATCH',
          body: JSON.stringify({ status: action })
        });
      }
      dashboardStatus.textContent = 'تم تحديث الرحلة.';
      await loadTrips();
    } catch (error) {
      dashboardStatus.textContent = error.message || 'تعذّر تحديث الرحلة.';
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  async function loadAccount() {
    const details = $('accountDetails');
    details.replaceChildren();
    const addDetail = (label, value) => addRow(details, label, value);
    addDetail('الاسم', driverUser?.fullName || driverUser?.name || '—');
    addDetail('البريد الإلكتروني', driverUser?.email || '—');
    addDetail('رقم الموبايل', driverUser?.phone || '—');
    addDetail('نوع الحساب', 'كابتن ROHNY');
    $('walletBalance').textContent = 'جارٍ التحميل…';
    $('walletTransactions').innerHTML = '<div class="empty">جارٍ تحميل حركات المحفظة…</div>';
    try {
      const [wallet, transactions] = await Promise.all([
        api('/wallet/me?currency=EGP'),
        api('/wallet/transactions?currency=EGP&limit=20')
      ]);
      const amount = Number(wallet.balance).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      $('walletBalance').textContent = amount + ' ' + (wallet.currency || 'EGP');
      const list = $('walletTransactions');
      list.replaceChildren();
      transferredTripIds.clear();
      if (Array.isArray(transactions)) {
        transactions.forEach((tx) => {
          if (tx.type === 'transfer' && tx.direction === 'debit' && tx.relatedTripId) transferredTripIds.add(tx.relatedTripId);
        });
      }
      const labels = { transfer: 'تحويل باقي للراكب', trip_payment: 'دفع رحلة', platform_commission: 'عمولة المنصة', card_top_up: 'إضافة رصيد', refund: 'استرداد', cash_out: 'سحب رصيد' };
      if (!Array.isArray(transactions) || !transactions.length) {
        const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'لا توجد حركات على المحفظة حتى الآن.'; list.append(empty);
      } else transactions.forEach((tx) => {
        const row = document.createElement('div'); row.className = 'transaction';
        const info = document.createElement('div');
        const title = document.createElement('div'); title.className = 'transaction-title'; title.textContent = labels[tx.type] || tx.description || 'حركة محفظة';
        const date = document.createElement('div'); date.className = 'transaction-date'; date.textContent = [tx.description, tx.createdAt ? new Date(tx.createdAt).toLocaleString('ar-EG') : ''].filter(Boolean).join(' • ');
        info.append(title, date);
        const amountNode = document.createElement('div'); amountNode.className = 'transaction-amount ' + (tx.direction === 'credit' ? 'credit' : 'debit');
        amountNode.textContent = (tx.direction === 'credit' ? '+' : '−') + Number(tx.amount).toLocaleString('ar-EG', { maximumFractionDigits: 2 }) + ' ' + tx.currency;
        row.append(info, amountNode); list.append(row);
      });
    } catch (error) {
      $('walletBalance').textContent = 'تعذّر التحميل';
      $('walletTransactions').innerHTML = '';
      const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = error.message || 'تعذّر تحميل المحفظة.'; $('walletTransactions').append(empty);
    }
  }


  const profileFields = ['fullName','nationalIdNumber','nationalIdExpiry','vehicleType','vehicleMake','vehicleModel','vehicleYear','vehicleColor','vehiclePlate','drivingLicenseNumber','drivingLicenseExpiry','vehicleLicenseNumber','vehicleLicenseExpiry'];
  const profileImageKeys = ['profilePhoto','vehiclePhoto','nationalIdFront','nationalIdBack','drivingLicenseFront','drivingLicenseBack','vehicleLicenseFront','vehicleLicenseBack'];
  function previewProfileImage(key, data) {
    const target = $(key + 'Preview');
    if (!target) return;
    target.replaceChildren();
    if (!data) return;
    const img = document.createElement('img');
    img.src = data; img.alt = 'معاينة مستند خاص'; img.loading = 'lazy';
    if (key === 'profilePhoto' || key === 'vehiclePhoto') img.className = 'profile-photo-preview';
    target.append(img);
  }
  async function fileAsDataUrl(file) {
    if (!file) return null;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('ارفع الصور بصيغة JPG أو PNG أو WebP فقط.');
    if (file.size > 2 * 1024 * 1024) throw new Error('حجم كل صورة يجب ألا يتجاوز 2 ميجابايت.');
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('تعذرت قراءة الصورة.'));
      reader.readAsDataURL(file);
    });
  }
  function profileStatus(profile) {
    const labels = { not_submitted: 'لم يتم إرسال الملف للمراجعة', pending: 'ملفك قيد مراجعة الإدارة', approved: 'تمت الموافقة على الملف', needs_changes: 'الملف يحتاج إلى تعديل' };
    $('profileReviewStatus').textContent = (labels[profile.reviewStatus] || 'حالة الملف غير معروفة') + (profile.reviewNote ? ' — ملاحظة الإدارة: ' + profile.reviewNote : '');
  }
  async function loadDriverProfile() {
    $('driverProfileMessage').textContent = 'جارٍ تحميل ملفك…';
    try {
      const profile = await api('/driver-profile/me');
      profileFields.forEach((key) => { const field = profileForm.elements.namedItem(key); if (field) field.value = profile[key] ?? ''; });
      profileImages = profile.images || {};
      profileImageKeys.forEach((key) => previewProfileImage(key, profileImages[key]));
      profileStatus(profile);
      $('driverProfileMessage').textContent = 'تم تحميل بيانات الملف.';
    } catch (error) { $('driverProfileMessage').textContent = error.message || 'تعذر تحميل الملف.'; $('driverProfileMessage').classList.add('error'); }
  }
  profileImageKeys.forEach((key) => {
    const field = profileForm.elements.namedItem(key);
    field.addEventListener('change', async () => {
      try {
        const file = field.files?.[0];
        if (!file) return;
        const data = await fileAsDataUrl(file);
        profileImages[key] = data;
        previewProfileImage(key, data);
      } catch (error) { field.value = ''; $('driverProfileMessage').textContent = error.message; $('driverProfileMessage').classList.add('error'); }
    });
  });
  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('saveDriverProfile'); button.disabled = true;
    $('driverProfileMessage').classList.remove('error');
    $('driverProfileMessage').textContent = 'جارٍ حفظ الملف وإرساله للمراجعة…';
    try {
      const payload = {};
      profileFields.forEach((key) => {
        const field = profileForm.elements.namedItem(key);
        if (field && field.value !== '') payload[key] = key === 'vehicleYear' ? Number(field.value) : field.value;
      });
      payload.images = profileImages;
      const profile = await api('/driver-profile/me', { method: 'PUT', body: JSON.stringify(payload) });
      profileStatus(profile);
      $('driverProfileMessage').textContent = 'تم حفظ الملف وإرساله للمراجعة بنجاح.';
    } catch (error) { $('driverProfileMessage').textContent = error.message || 'تعذر حفظ الملف.'; $('driverProfileMessage').classList.add('error'); }
    finally { button.disabled = false; }
  });
  $('refreshDriverProfile').addEventListener('click', loadDriverProfile);

  function showView(view) {
    if (view === 'profile') {
      accountView.classList.add('hidden'); profileView.classList.remove('hidden');
      dashboard.querySelector('.welcome').classList.add('hidden'); dashboard.querySelector('.dashboard-grid').classList.add('hidden'); historyPanel.classList.add('hidden');
      document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === 'profile'));
      loadDriverProfile(); window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (view === 'account') {
      profileView.classList.add('hidden');
      document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === 'account'));
      dashboard.querySelector('.welcome').classList.add('hidden');
      dashboard.querySelector('.dashboard-grid').classList.add('hidden');
      historyPanel.classList.add('hidden');
      accountView.classList.remove('hidden');
      loadAccount();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      accountView.classList.add('hidden'); profileView.classList.add('hidden');
      dashboard.querySelector('.welcome').classList.remove('hidden');
      dashboard.querySelector('.dashboard-grid').classList.remove('hidden');
      document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === 'trips'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  let driverMap = null;
  let driverMapMarkers = [];
  let driverRouteLine = null;
  let driverNavigationTripId = '';
  let driverNavigationStatus = '';
  let driverLocation = null;
  let driverRouteKey = '';

  function ensureDriverMap() {
    if (driverMap || !window.L || !$('driverNavigationMap')) return;
    driverMap = L.map('driverNavigationMap', { zoomControl: true }).setView([30.0131, 31.2089], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(driverMap);
  }

  function requestDriverLocation(onReady) {
    if (!navigator.geolocation) { onReady(null); return; }
    navigator.geolocation.getCurrentPosition(position => {
      driverLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
      onReady(driverLocation);
    }, () => onReady(driverLocation), { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 });
  }

  async function drawDriverRoute(trip, location) {
    ensureDriverMap();
    if (!driverMap) { $('driverNavigationInfo').textContent = 'تعذّر تحميل مكتبة الخريطة. تأكد من الاتصال بالإنترنت ثم أعد تحميل الصفحة.'; return; }
    const pickup = [Number(trip.pickupLatitude), Number(trip.pickupLongitude)];
    const destination = [Number(trip.destinationLatitude), Number(trip.destinationLongitude)];
    if (![...pickup, ...destination].every(Number.isFinite)) { $('driverNavigationInfo').textContent = 'إحداثيات الرحلة غير مكتملة؛ لا يمكن رسم خط السير.'; return; }
    const isRideStarted = trip.status === 'in_progress';
    const target = isRideStarted ? destination : pickup;
    const origin = location ? [location.lat, location.lng] : pickup;
    const key = [trip.id, trip.status, location ? location.lat.toFixed(3) : 'no-gps', location ? location.lng.toFixed(3) : 'no-gps'].join(':');
    if (key === driverRouteKey) return;
    driverRouteKey = key;
    driverNavigationTripId = trip.id;
    driverNavigationStatus = trip.status;
    driverNavigationSubtitle.textContent = isRideStarted ? 'الرحلة جارية — الاتجاه إلى وجهة الراكب' : 'في طريقك إلى الراكب — نقطة الالتقاء محددة على الخريطة';
    $('driverNavigationInfo').textContent = location ? 'جارٍ حساب خط السير حسب موقعك الحالي…' : 'لم نتمكن من تحديد موقعك الحالي؛ يعرض المسار من نقطة الركوب مؤقتًا. فعّل إذن الموقع لتوجيه أدق.';
    driverMapMarkers.forEach(marker => driverMap.removeLayer(marker));
    driverMapMarkers = [];
    if (driverRouteLine) { driverMap.removeLayer(driverRouteLine); driverRouteLine = null; }
    driverMapMarkers.push(L.marker(pickup).addTo(driverMap).bindPopup('نقطة ركوب الراكب: ' + (trip.pickupAddress || 'نقطة الركوب')));
    driverMapMarkers.push(L.marker(destination).addTo(driverMap).bindPopup('وجهة الراكب: ' + (trip.destinationAddress || 'الوجهة')));
    if (location) driverMapMarkers.push(L.circleMarker([location.lat, location.lng], { radius: 8, color: '#ffffff', weight: 3, fillColor: '#287cff', fillOpacity: 1 }).addTo(driverMap).bindPopup('موقعك الحالي'));
    const waypoints = [origin, target];
    try {
      const coords = waypoints.map(point => point[1] + ',' + point[0]).join(';');
      const response = await fetch('https://router.project-osrm.org/route/v1/driving/' + coords + '?overview=full&geometries=geojson&steps=false', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('route');
      const data = await response.json();
      if (data.code !== 'Ok' || !data.routes || !data.routes.length) throw new Error('route');
      const route = data.routes[0];
      const points = route.geometry.coordinates.map(point => [point[1], point[0]]);
      driverRouteLine = L.polyline(points, { color: '#c4ff62', weight: 6, opacity: 0.95 }).addTo(driverMap);
      driverMap.fitBounds(driverRouteLine.getBounds(), { padding: [25, 25], maxZoom: 16 });
      const km = (route.distance / 1000).toLocaleString('ar-EG', { maximumFractionDigits: 1 });
      const mins = Math.max(1, Math.round(route.duration / 60)).toLocaleString('ar-EG');
      $('driverNavigationInfo').textContent = (isRideStarted ? 'المتبقي إلى الوجهة: ' : 'المسافة إلى الراكب: ') + km + ' كم — وقت قيادة تقديري: ' + mins + ' دقيقة.';
    } catch (_) {
      driverMap.fitBounds([pickup, destination], { padding: [25, 25], maxZoom: 15 });
      $('driverNavigationInfo').textContent = 'تعذّر حساب المسار على الطرق حاليًا. تظهر نقطتا الرحلة على الخريطة؛ يمكنك فتح الاتجاهات الخارجية.';
    }
    const externalUrl = 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(origin.join(',')) + '&destination=' + encodeURIComponent(target.join(',')) + '&travelmode=driving';
    const external = $('openNavigationExternal');
    external.href = externalUrl;
    external.style.display = 'inline-block';
  }

  const driverNavigationSubtitle = $('driverNavigationSubtitle');
  function renderDriverNavigation(activeTrips) {
    const panel = $('driverNavigationPanel');
    const trip = activeTrips.find(item => ['accepted', 'driver_arriving', 'in_progress'].includes(item.status));
    if (!trip) {
      panel.classList.add('hidden');
      driverNavigationTripId = ''; driverNavigationStatus = ''; driverRouteKey = '';
      return;
    }
    panel.classList.remove('hidden');
    ensureDriverMap();
    requestDriverLocation(location => {
      if (driverNavigationTripId !== trip.id || driverNavigationStatus !== trip.status || !driverRouteKey) {
        drawDriverRoute(trip, location);
        return;
      }
      const key = [trip.id, trip.status, location ? location.lat.toFixed(3) : 'no-gps', location ? location.lng.toFixed(3) : 'no-gps'].join(':');
      if (key !== driverRouteKey) drawDriverRoute(trip, location);
    });
    window.setTimeout(() => { if (driverMap) driverMap.invalidateSize(); }, 120);
  }

  $('refreshDriverLocation').addEventListener('click', () => {
    driverRouteKey = '';
    const tripId = driverNavigationTripId;
    requestDriverLocation(location => {
      const current = window.__rohnyActiveDriverTrip;
      if (current && current.id === tripId) drawDriverRoute(current, location);
      else $('driverNavigationInfo').textContent = 'جارٍ تحديث الرحلات للحصول على مسارك…';
    });
  });

  async function loadTrips() {
    if (!token || tripsLoadInProgress) return;
    tripsLoadInProgress = true;
    dashboardStatus.textContent = 'جارٍ تحديث الرحلات…';
    $('refresh').disabled = true;
    try {
      const [assigned, available] = await Promise.all([
        api('/trips/driver/mine'),
        api('/trips/available')
      ]);
      if (!Array.isArray(assigned) || !Array.isArray(available)) throw new Error('استجابة الرحلات غير متوقعة.');
      assignedList.replaceChildren();
      availableList.replaceChildren();
      historyTrips = assigned.filter((trip) => ['completed', 'cancelled'].includes(trip.status));
      const activeTrips = assigned.filter((trip) => !['completed', 'cancelled'].includes(trip.status));
      window.__rohnyActiveDriverTrip = activeTrips.find(item => ['accepted', 'driver_arriving', 'in_progress'].includes(item.status)) || null;
      renderDriverNavigation(activeTrips);
      assignedCount.textContent = String(activeTrips.length);
      historyCount.textContent = String(historyTrips.length);
      availableCount.textContent = String(available.length);
      syncTripRinging(available);
      if (!activeTrips.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.innerHTML = '<span class="empty-icon">◷</span>لا توجد رحلات حالية الآن.<br>ستظهر هنا الرحلات التي تقبلها وتكون قيد التنفيذ.';
        assignedList.append(empty);
      } else activeTrips.forEach((trip) => assignedList.append(tripCard(trip, true)));
      if (!historyPanel.classList.contains('hidden')) renderHistory();
      if (!available.length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'لا توجد رحلات متاحة الآن.';
        availableList.append(empty);
      } else available.forEach((trip) => availableList.append(tripCard(trip, false)));
      dashboardStatus.textContent = 'تم تحديث الرحلات: ' + assigned.length + ' مسندة، ' + available.length + ' متاحة.';
    } catch (error) {
      dashboardStatus.textContent = error.message || 'تعذّر تحميل الرحلات.';
      dashboardStatus.classList.add('error');
    } finally {
      $('refresh').disabled = false;
      tripsLoadInProgress = false;
    }
  }

  function renderHistory() {
    historyList.replaceChildren();
    if (!historyTrips.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerHTML = '<span class="empty-icon">▤</span>لا يوجد سجل رحلات سابق حتى الآن.';
      historyList.append(empty);
      return;
    }
    historyTrips.slice().sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
      .forEach((trip) => historyList.append(tripCard(trip, true)));
  }

  toggleHistory.addEventListener('click', () => {
    const opening = historyPanel.classList.contains('hidden');
    historyPanel.classList.toggle('hidden', !opening);
    toggleHistory.setAttribute('aria-expanded', String(opening));
    toggleHistory.querySelector('span').textContent = opening ? 'إخفاء سجل الرحلات السابقة' : 'عرض سجل الرحلات السابقة';
    historyArrow.textContent = opening ? '⌃' : '⌄';
    if (opening) {
      renderHistory();
      historyPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    unlockTripAudio();
    const identifier = $('identifier').value.trim();
    const password = $('password').value;
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
    const isPhone = /^\+?[0-9() .-]{7,20}$/.test(identifier);
    if ((!isEmail && !isPhone) || password.length < 12 || password.length > 128) {
      loginStatus.textContent = 'اكتب بريدًا صحيحًا أو رقم موبايل صالحًا، وكلمة مرور من 12 إلى 128 حرفًا.';
      loginStatus.classList.add('error');
      return;
    }
    loginButton.disabled = true;
    loginStatus.textContent = 'جارٍ التحقق من الحساب…';
    loginStatus.classList.remove('error');
    try {
      const identity = isEmail ? { email: identifier.toLowerCase() } : { phone: identifier };
      const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ ...identity, password }) });
      if (!result.accessToken || result.user?.role !== 'driver') {
        throw new Error('هذا الحساب ليس حساب كابتن مُفعّلًا.');
      }
      token = result.accessToken;
      driverUser = result.user || null;
      sessionStorage.setItem(tokenKey, token);
      sessionStorage.setItem('rohny_driver_user', JSON.stringify(driverUser));
      showSignedIn(true);
      $('password').value = '';
      await loadTrips();
      await Promise.all([loadAccount(), loadDriverDepositRequests()]);
    } catch (error) {
      loginStatus.textContent = error.message || 'تعذّر تسجيل الدخول.';
      loginStatus.classList.add('error');
    } finally {
      loginButton.disabled = false;
    }
  });

  document.addEventListener('click', unlockTripAudio, { passive: true });
  $('refresh').addEventListener('click', loadTrips);
  $('mobileRefresh').addEventListener('click', loadTrips);
  document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.addEventListener('click', () => showView(item.dataset.view)));
  $('refreshWallet').addEventListener('click', () => {
    loadAccount();
    loadDriverDepositRequests();
  });

  const driverDepositStatusLabels = { pending: 'قيد مراجعة الإدارة', approved: 'تم اعتماد الإيداع', rejected: 'مرفوض' };

  async function loadDriverDepositRequests() {
    const list = $('driverDepositRequests');
    if (!token || !list) return;
    list.innerHTML = '<div class="empty">جارٍ تحميل طلبات الإيداع…</div>';
    try {
      const requests = await api('/wallet/deposits/mine');
      list.replaceChildren();
      if (!Array.isArray(requests) || requests.length === 0) {
        list.innerHTML = '<div class="empty">لا توجد طلبات إيداع حتى الآن.</div>';
        return;
      }
      requests.forEach((item) => {
        const card = document.createElement('article');
        card.className = 'transaction';
        const info = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'transaction-title';
        title.textContent = 'طلب إيداع — ' + (driverDepositStatusLabels[item.status] || item.status);
        const date = document.createElement('div');
        date.className = 'transaction-date';
        date.textContent = 'تاريخ الطلب: ' + (item.createdAt ? new Date(item.createdAt).toLocaleString('ar-EG') : '—');
        info.append(title, date);
        if (item.note) {
          const note = document.createElement('div');
          note.className = 'transaction-date';
          note.textContent = 'ملاحظتك: ' + item.note;
          info.append(note);
        }
        if (item.adminNote) {
          const note = document.createElement('div');
          note.className = 'transaction-date';
          note.textContent = 'رد الإدارة: ' + item.adminNote;
          info.append(note);
        }
        const amount = document.createElement('div');
        amount.className = 'transaction-amount ' + (item.status === 'approved' ? 'credit' : '');
        amount.textContent = Number(item.amount).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + item.currency;
        card.append(info, amount);
        list.append(card);
      });
    } catch (error) {
      list.replaceChildren();
      const message = document.createElement('div');
      message.className = 'empty';
      message.textContent = error.message || 'تعذّر تحميل طلبات الإيداع.';
      list.append(message);
    }
  }

  $('depositAction').addEventListener('click', () => {
    $('walletActionNotice').classList.add('hidden');
    const panel = $('driverDepositPanel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) $('driverDepositAmount').focus();
  });

  $('driverDepositCancel').addEventListener('click', () => {
    $('driverDepositPanel').classList.add('hidden');
    $('driverDepositStatus').textContent = '';
  });

  $('driverDepositForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!token) {
      $('driverDepositStatus').textContent = 'سجّل الدخول أولًا.';
      return;
    }
    const amount = Number($('driverDepositAmount').value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      $('driverDepositStatus').textContent = 'أدخل مبلغًا صحيحًا.';
      return;
    }
    const button = $('driverDepositSubmit');
    button.disabled = true;
    $('driverDepositStatus').textContent = 'جارٍ إرسال الطلب…';
    try {
      await api('/wallet/deposits', {
        method: 'POST',
        body: JSON.stringify({ amount, currency: 'EGP', note: $('driverDepositNote').value.trim() })
      });
      $('driverDepositStatus').textContent = 'تم تسجيل طلب الإيداع. رصيدك لن يتغير حتى تعتمد الإدارة استلام المبلغ.';
      $('driverDepositForm').reset();
      $('driverDepositPanel').classList.add('hidden');
      await loadDriverDepositRequests();
    } catch (error) {
      $('driverDepositStatus').textContent = error.message || 'تعذّر إرسال طلب الإيداع.';
    } finally {
      button.disabled = false;
    }
  });

  $('refreshDriverDeposits').addEventListener('click', loadDriverDepositRequests);
  document.querySelectorAll('.nav-item[data-target]').forEach((item) => item.addEventListener('click', () => {
    const target = $(item.dataset.target);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  $('logout').addEventListener('click', () => signOut());
  if (token) {
    showSignedIn(true);
    loadTrips().catch(() => {});
    loadAccount().catch(() => {});
    loadDriverDepositRequests().catch(() => {});
  } else showSignedIn(false);
  window.setInterval(() => {
    if (token && !dashboard.classList.contains('hidden')) loadTrips().catch(() => {});
  }, 4000);
})();
(() => {
  'use strict';
  const tokenKey = 'rohny_driver_access_token';
  let token = sessionStorage.getItem(tokenKey) || '';
  const $ = (id) => document.getElementById(id);
  const loginPanel = $('loginPanel');
  const dashboard = $('dashboard');
  const loginForm = $('loginForm');
  const loginButton = $('loginButton');
  const loginStatus = $('loginStatus');
  const dashboardStatus = $('dashboardStatus');
  const assignedList = $('assignedList');
  const availableList = $('availableList');
  const topActions = $('topActions');
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
  }

  function signOut(message = 'تم تسجيل الخروج.') {
    token = '';
    sessionStorage.removeItem(tokenKey);
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
    const title = document.createElement('h3');
    title.textContent = 'رحلة ' + String(trip.id || '').slice(0, 8);
    card.append(title);
    addRow(card, 'من', trip.pickupAddress);
    addRow(card, 'إلى', trip.destinationAddress);
    addRow(card, 'الحالة', statusLabels[trip.status] || trip.status);
    addRow(card, 'نوع الرحلة', rideLabels[trip.rideType] || trip.rideType);
    addRow(card, 'عدد الركاب', trip.passengerCount);
    addRow(card, 'الدفع', paymentLabels[trip.paymentMethod] || trip.paymentMethod);
    if (trip.fareAmount != null && trip.fareCurrency) addRow(card, 'الأجرة التقديرية', Number(trip.fareAmount).toLocaleString('ar-EG', { maximumFractionDigits: 2 }) + ' ' + trip.fareCurrency);
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
      actions.append(accept);
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
    return card;
  }

  async function performTripAction(button, tripId, action) {
    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = 'جارٍ التنفيذ…';
    try {
      if (action === 'accept') {
        await api('/trips/' + encodeURIComponent(tripId) + '/accept', { method: 'POST' });
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

  async function loadTrips() {
    if (!token) return;
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
      if (!assigned.length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'لا توجد رحلات مسندة إليك حاليًا.';
        assignedList.append(empty);
      } else assigned.forEach((trip) => assignedList.append(tripCard(trip, true)));
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
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
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
      sessionStorage.setItem(tokenKey, token);
      showSignedIn(true);
      $('password').value = '';
      await loadTrips();
    } catch (error) {
      loginStatus.textContent = error.message || 'تعذّر تسجيل الدخول.';
      loginStatus.classList.add('error');
    } finally {
      loginButton.disabled = false;
    }
  });

  $('refresh').addEventListener('click', loadTrips);
  $('logout').addEventListener('click', () => signOut());
  if (token) {
    showSignedIn(true);
    loadTrips().catch(() => {});
  } else showSignedIn(false);
})();
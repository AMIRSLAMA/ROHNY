(() => {
  'use strict';

  // The web host must reverse-proxy /auth/* and /trips to the private ROHNY API.
  // A separately hosted API can be configured before this file loads via window.ROHNY_API_BASE.
  const apiBase = window.ROHNY_API_BASE || '';
  const tokenKey = 'rohny_access_token';
  let token = sessionStorage.getItem(tokenKey) || '';

  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const status = document.getElementById('auth-status');
  const loginButton = document.getElementById('auth-login');
  const registerButton = document.getElementById('auth-register');
  const logoutButton = document.getElementById('auth-logout');
  const bookingStatus = document.getElementById('booking-status');
  const confirmButton = document.getElementById('confirm-ride');
  const historyStatus = document.getElementById('trip-history-status');
  const historyList = document.getElementById('trip-history-list');
  const refreshHistoryButton = document.getElementById('refresh-trip-history');

  function setStatus(message, signedIn) {
    status.textContent = message;
    loginButton.hidden = signedIn;
    registerButton.hidden = signedIn;
    logoutButton.hidden = !signedIn;
    emailInput.disabled = signedIn;
    passwordInput.disabled = signedIn;
    refreshHistoryButton.hidden = !signedIn;
    if (!signedIn) {
      historyList.replaceChildren();
      historyStatus.textContent = 'سجّل الدخول لعرض رحلاتك السابقة.';
    }
  }

  function clearSession(message) {
    token = '';
    sessionStorage.removeItem(tokenKey);
    setStatus(message || 'تم تسجيل الخروج. سجّل الدخول قبل طلب رحلة.', false);
  }

  async function api(path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(apiBase + path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && path !== '/auth/login') {
        clearSession('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
      }
      const message = Array.isArray(data.message) ? data.message.join('، ') : data.message;
      throw new Error(message || 'تعذّر الاتصال بالخادم. تأكد من إعداد رابط API ثم حاول مجددًا.');
    }
    return data;
  }

  async function authenticate(register) {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!emailInput.checkValidity() || !email || password.length < 12) {
      setStatus('اكتب بريدًا إلكترونيًا صحيحًا وكلمة مرور من 12 حرفًا على الأقل.', false);
      return;
    }
    loginButton.disabled = true;
    registerButton.disabled = true;
    try {
      if (register) {
        await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
      }
      const result = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (!result.accessToken || result.user?.role !== 'rider') {
        throw new Error('هذا الحساب ليس حساب راكب، أو لم يرجع الخادم رمز دخول صالحًا.');
      }
      token = result.accessToken;
      sessionStorage.setItem(tokenKey, token);
      setStatus('تم تسجيل الدخول: ' + (result.user.email || email), true);
      await loadTripHistory();
    } catch (error) {
      setStatus(error.message || 'تعذّر تسجيل الدخول.', false);
    } finally {
      loginButton.disabled = false;
      registerButton.disabled = false;
    }
  }

  loginButton.addEventListener('click', () => authenticate(false));
  registerButton.addEventListener('click', () => authenticate(true));
  logoutButton.addEventListener('click', () => clearSession());

  if (token) {
    setStatus('جلسة دخول محفوظة مؤقتًا. سيتم التحقق منها عند إرسال طلب الرحلة.', true);
  } else {
    setStatus('سجّل الدخول أو أنشئ حسابًا قبل طلب الرحلة.', false);
  }

  const tripStatusLabels = {
    pending: 'قيد الانتظار',
    accepted: 'تم قبول الرحلة',
    preparing: 'جارٍ التجهيز',
    ready_for_pickup: 'السائق جاهز للاستلام',
    driver_assigned: 'تم تعيين سائق',
    picked_up: 'تم الاستلام',
    out_for_delivery: 'في الطريق',
    delivered: 'مكتملة',
    cancelled: 'ملغاة'
  };
  const rideTypeLabels = { economy: 'اقتصادي', comfort: 'مريح', family: 'عائلي' };
  const paymentLabels = { cash: 'كاش', wallet: 'محفظة', card: 'بطاقة' };

  function addHistoryRow(container, label, value) {
    const row = document.createElement('div');
    row.className = 'review-row';
    const key = document.createElement('span');
    key.textContent = label;
    const val = document.createElement('strong');
    val.textContent = value || '—';
    row.append(key, val);
    container.append(row);
  }

  async function loadTripHistory() {
    if (!token) return;
    historyStatus.textContent = 'جارٍ تحميل سجل الرحلات…';
    refreshHistoryButton.disabled = true;
    try {
      const trips = await api('/trips/mine');
      if (!Array.isArray(trips)) throw new Error('صيغة سجل الرحلات من الخادم غير متوقعة.');
      historyList.replaceChildren();
      if (trips.length === 0) {
        historyStatus.textContent = 'لا توجد رحلات محفوظة في حسابك حتى الآن.';
        return;
      }
      historyStatus.textContent = 'عدد الرحلات: ' + trips.length;
      trips.forEach((trip) => {
        const card = document.createElement('article');
        card.className = 'ride-review';
        const title = document.createElement('h3');
        title.textContent = 'رحلة ' + (trip.id ? String(trip.id).slice(0, 8) : '');
        card.append(title);
        addHistoryRow(card, 'من', trip.pickupAddress);
        addHistoryRow(card, 'إلى', trip.destinationAddress);
        addHistoryRow(card, 'الحالة', tripStatusLabels[trip.status] || 'غير معروفة');
        addHistoryRow(card, 'نوع الرحلة', rideTypeLabels[trip.rideType] || trip.rideType);
        addHistoryRow(card, 'طريقة الدفع', paymentLabels[trip.paymentMethod] || trip.paymentMethod);
        const when = trip.scheduledAt || trip.createdAt;
        let dateLabel = '—';
        if (when) {
          const date = new Date(when);
          if (!Number.isNaN(date.getTime())) dateLabel = date.toLocaleString('ar-EG');
        }
        addHistoryRow(card, trip.scheduledAt ? 'موعد الرحلة' : 'تاريخ الطلب', dateLabel);
        historyList.append(card);
      });
    } catch (error) {
      historyStatus.textContent = error.message || 'تعذّر تحميل سجل الرحلات.';
      throw error;
    } finally {
      refreshHistoryButton.disabled = false;
    }
  }

  refreshHistoryButton.addEventListener('click', () => {
    loadTripHistory().catch(() => {});
  });

  confirmButton.addEventListener('click', async () => {
    bookingStatus.textContent = '';
    if (!token) {
      bookingStatus.textContent = 'سجّل الدخول أولًا حتى نرسل طلب الرحلة.';
      document.getElementById('auth-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      emailInput.focus();
      return;
    }
    if (!pickupMarker || !destinationMarker || !pickupInput.value.trim() || !destinationInput.value.trim()) {
      bookingStatus.textContent = 'أكد نقطة الانطلاق والوجهة على الخريطة قبل إرسال الطلب.';
      return;
    }

    const pickup = pickupMarker.getLatLng();
    const destination = destinationMarker.getLatLng();
    const payload = {
      pickupAddress: pickupInput.value.trim(),
      pickupLatitude: pickup.lat,
      pickupLongitude: pickup.lng,
      destinationAddress: destinationInput.value.trim(),
      destinationLatitude: destination.lat,
      destinationLongitude: destination.lng,
      rideType: selectedRide,
      passengerCount: Number(document.getElementById('passengers').value),
      paymentMethod: selectedPayment,
      scheduledAt: selectedSchedule === 'later' ? new Date(scheduledAtInput.value).toISOString() : null,
      riderNote: document.getElementById('trip-note').value.trim() || null
    };

    confirmButton.disabled = true;
    confirmButton.textContent = 'جارٍ إرسال الطلب…';
    try {
      const trip = await api('/trips', { method: 'POST', body: JSON.stringify(payload) });
      bookingStatus.textContent = 'تم إرسال طلب الرحلة بنجاح. الحالة: قيد الانتظار.' +
        (trip.id ? ' رقم الطلب: ' + trip.id : '');
      confirmButton.textContent = 'تم إرسال الطلب';
      await loadTripHistory();
    } catch (error) {
      bookingStatus.textContent = error.message || 'تعذّر إرسال طلب الرحلة.';
      confirmButton.textContent = 'إعادة المحاولة';
      confirmButton.disabled = false;
    }
  });
})();

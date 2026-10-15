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

  function setStatus(message, signedIn) {
    status.textContent = message;
    loginButton.hidden = signedIn;
    registerButton.hidden = signedIn;
    logoutButton.hidden = !signedIn;
    emailInput.disabled = signedIn;
    passwordInput.disabled = signedIn;
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
    } catch (error) {
      bookingStatus.textContent = error.message || 'تعذّر إرسال طلب الرحلة.';
      confirmButton.textContent = 'إعادة المحاولة';
      confirmButton.disabled = false;
    }
  });
})();

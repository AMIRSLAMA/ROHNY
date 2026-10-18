(() => {
  'use strict';

  // The web host must reverse-proxy /auth/* and /trips to the private ROHNY API.
  // A separately hosted API can be configured before this file loads via window.ROHNY_API_BASE.
  const apiBase = window.ROHNY_API_BASE || '';
  const tokenKey = 'rohny_access_token';
  let token = sessionStorage.getItem(tokenKey) || '';

  const identifierInput = document.getElementById('auth-email');
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
  const walletPanel = document.getElementById('wallet-panel');
  const walletBalance = document.getElementById('wallet-balance');
  const walletStatus = document.getElementById('wallet-status');
  const walletTransactions = document.getElementById('wallet-transactions');
  const refreshWalletButton = document.getElementById('refresh-wallet');
  const walletCurrencyInput = document.getElementById('wallet-currency');
  const walletDepositForm = document.getElementById('wallet-deposit-form');
  const walletDepositAmount = document.getElementById('wallet-deposit-amount');
  const walletDepositNote = document.getElementById('wallet-deposit-note');
  const walletDepositSubmit = document.getElementById('wallet-deposit-submit');
  const walletDepositFormStatus = document.getElementById('wallet-deposit-form-status');
  const walletDepositRequests = document.getElementById('wallet-deposit-requests');
  const walletOpenDepositButton = document.getElementById('wallet-open-deposit');
  const walletTopupCard = document.getElementById('wallet-topup-card');
  const walletCancelDepositButton = document.getElementById('wallet-cancel-deposit');
  const cityCodeInput = document.getElementById('city-code');
  const cityHint = document.getElementById('city-hint');
  let selectedFareQuote = null;

  async function loadPricingCities() {
    try {
      const response = await fetch(apiBase + '/pricing/cities', { headers: { Accept: 'application/json' } });
      const cities = await response.json();
      if (!response.ok || !Array.isArray(cities)) throw new Error('تعذّر تحميل المدن');
      cityCodeInput.replaceChildren();
      if (!cities.length) {
        cityCodeInput.add(new Option('لا توجد مدينة مفعّلة بعد', ''));
        cityCodeInput.disabled = true;
        cityHint.textContent = 'تحتاج الإدارة لإضافة مدينة وأسعارها أولًا من لوحة الإدارة.';
        return;
      }
      cityCodeInput.add(new Option('اختار المدينة', ''));
      cities.forEach(city => cityCodeInput.add(new Option(city.cityName + ' — ' + city.countryCode + ' (' + city.currency + ')', city.cityCode)));
      cityCodeInput.disabled = false;
      cityHint.textContent = 'اختار مدينة الرحلة؛ العملة والأسعار تتحدد تلقائيًا حسب إعدادات المدينة.';
    } catch (_) {
      cityCodeInput.replaceChildren(new Option('تعذّر تحميل المدن', ''));
      cityCodeInput.disabled = true;
      cityHint.textContent = 'تحقق من اتصال الخادم ثم أعد تحميل الصفحة.';
    }
  }
  loadPricingCities();
  cityCodeInput.addEventListener('change', () => { selectedFareQuote = null; });
  window.ROHNY_QUOTE_FARE = async payload => {
    if (!token) throw new Error('سجّل الدخول أولًا لحساب سعر الرحلة.');
    selectedFareQuote = await api('/pricing/quote', { method: 'POST', body: JSON.stringify(payload) });
    return selectedFareQuote;
  };

  function setStatus(message, signedIn) {
    status.textContent = message;
    if (typeof window.ROHNY_SET_RIDER_SESSION_VIEW === 'function') window.ROHNY_SET_RIDER_SESSION_VIEW(signedIn);
    loginButton.hidden = signedIn;
    registerButton.hidden = signedIn;
    logoutButton.hidden = !signedIn;
    identifierInput.disabled = signedIn;
    passwordInput.disabled = signedIn;
    refreshHistoryButton.hidden = !signedIn;
    walletPanel.hidden = !signedIn;
    refreshWalletButton.hidden = !signedIn;
    if (!signedIn) {
      walletBalance.textContent = '—';
      walletTransactions.replaceChildren();
      if (walletDepositRequests) walletDepositRequests.innerHTML = '<p class="note">سجّل الدخول لعرض طلبات الإيداع.</p>';
      if (walletDepositFormStatus) walletDepositFormStatus.textContent = '';
      walletStatus.textContent = 'سجّل الدخول لعرض محفظتك.';
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
    const identifier = identifierInput.value.trim();
    const password = passwordInput.value;
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
    const isPhone = /^\+?[0-9() .-]{7,20}$/.test(identifier);
    if ((!isEmail && !isPhone) || password.length < 12 || password.length > 128) {
      setStatus('اكتب بريدًا إلكترونيًا صحيحًا أو رقم موبايل صالحًا، وكلمة مرور من 12 إلى 128 حرفًا.', false);
      return;
    }
    const identity = isEmail ? { email: identifier.toLowerCase() } : { phone: identifier };
    loginButton.disabled = true;
    registerButton.disabled = true;
    try {
      if (register) {
        await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ ...identity, password })
        });
      }
      const result = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ ...identity, password })
      });
      if (!result.accessToken || result.user?.role !== 'rider') {
        throw new Error('هذا الحساب ليس حساب راكب، أو لم يرجع الخادم رمز دخول صالحًا.');
      }
      token = result.accessToken;
      sessionStorage.setItem(tokenKey, token);
      setStatus('تم تسجيل الدخول: ' + (result.user.email || result.user.phone || identifier), true);
      loadTripHistory().catch(() => {});
      loadWallet().catch(() => {});
      loadWalletDepositRequests().catch(() => {});
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
    loadWallet().catch(() => {});
  } else {
    setStatus('سجّل الدخول أو أنشئ حسابًا قبل طلب الرحلة.', false);
  }
  if (typeof window.ROHNY_SET_RIDER_SESSION_VIEW === 'function') window.ROHNY_SET_RIDER_SESSION_VIEW(Boolean(token));

  const tripStatusLabels = {
    pending: 'قيد الانتظار',
    accepted: 'السائق قبل الرحلة',
    driver_arriving: 'السائق في الطريق إليك',
    in_progress: 'الرحلة جارية',
    completed: 'مكتملة',
    cancelled: 'ملغاة'
  };
  const rideTypeLabels = { economy: 'اقتصادي', scooter: 'اسكوتر', comfort: 'مريح', family: 'عائلي' };
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
        addHistoryRow(card, 'السعر المحفوظ', trip.riderFreeRide ? 'رحلة مجانية — 0' : (trip.fareAmount == null ? 'غير متاح للرحلات القديمة' : new Intl.NumberFormat('ar', { style: 'currency', currency: trip.fareCurrency || 'USD' }).format(Number(trip.fareAmount))));
        if (trip.riderFreeRide) addHistoryRow(card, 'تكلفة الرحلة', 'تتحملها ROHNY بالكامل');
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
        if (trip.status === 'pending' || trip.status === 'accepted') {
          const cancelButton = document.createElement('button');
          cancelButton.type = 'button';
          cancelButton.className = 'map-toolbar-button';
          cancelButton.textContent = 'إلغاء الرحلة';
          cancelButton.addEventListener('click', async () => {
            if (!window.confirm('هل تريد إلغاء هذه الرحلة؟')) return;
            cancelButton.disabled = true;
            cancelButton.textContent = 'جارٍ الإلغاء…';
            try {
              await api('/trips/' + encodeURIComponent(trip.id) + '/cancel', { method: 'POST' });
              await loadTripHistory();
            } catch (error) {
              historyStatus.textContent = error.message || 'تعذّر إلغاء الرحلة.';
              cancelButton.disabled = false;
              cancelButton.textContent = 'إعادة المحاولة';
            }
          });
          card.append(cancelButton);
        }
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

  const walletTransactionLabels = {
    transfer: 'استلام/تحويل باقي الكاش من الكابتن',
    trip_payment: 'دفع أجرة رحلة من المحفظة',
    platform_commission: 'عمولة المنصة',
    card_top_up: 'شحن إلكتروني',
    refund: 'استرداد',
    cash_out: 'سحب',
    platform_reward: 'مكافأة ممولة من ROHNY',
    captain_bonus: 'مكافأة كابتن'
  };

  async function loadWallet() {
    if (!token) return;
    walletStatus.textContent = 'جارٍ تحميل المحفظة…';
    refreshWalletButton.disabled = true;
    try {
      const currency = (walletCurrencyInput.value || 'EGP').trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error('اكتب رمز عملة صحيحًا من 3 أحرف مثل USD أو EGP.');
      walletCurrencyInput.value = currency;
      const wallet = await api('/wallet/me?currency=' + encodeURIComponent(currency));
      const formatter = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: wallet.currency });
      walletBalance.textContent = formatter.format(Number(wallet.balance));
      const entries = await api('/wallet/transactions?limit=10&currency=' + encodeURIComponent(currency));
      walletTransactions.replaceChildren();
      if (!Array.isArray(entries) || entries.length === 0) {
        walletStatus.textContent = 'رصيدك الداخلي ظاهر أعلاه. لا توجد حركات مالية مسجلة حتى الآن.';
        return;
      }
      walletStatus.textContent = 'آخر الحركات المالية:';
      entries.forEach((entry) => {
        const row = document.createElement('div');
        row.className = 'review-row';
        const label = document.createElement('span');
        label.textContent = (entry.direction === 'credit' ? '＋ ' : '− ') +
          (walletTransactionLabels[entry.type] || 'حركة مالية');
        const detail = document.createElement('small');
        detail.style.display = 'block';
        detail.style.marginTop = '5px';
        detail.style.fontSize = '11px';
        detail.style.lineHeight = '1.7';
        detail.style.opacity = '.78';
        detail.textContent = [
          entry.description || '',
          entry.relatedTripId ? 'رقم الرحلة: ' + entry.relatedTripId : '',
          entry.createdAt ? new Date(entry.createdAt).toLocaleString('ar-EG') : ''
        ].filter(Boolean).join(' • ');
        label.append(detail);
        const amount = document.createElement('strong');
        amount.textContent = new Intl.NumberFormat('ar-EG', {
          style: 'currency', currency: entry.currency
        }).format(Number(entry.amount));
        row.append(label, amount);
        walletTransactions.append(row);
      });
    } catch (error) {
      walletStatus.textContent = error.message || 'تعذّر تحميل المحفظة.';
      throw error;
    } finally {
      refreshWalletButton.disabled = false;
    }
  }


  const depositStatusLabels = { pending: 'قيد مراجعة الإدارة', approved: 'تم اعتماد الإيداع', rejected: 'مرفوض' };

  async function loadWalletDepositRequests() {
    if (!token || !walletDepositRequests) return;
    walletDepositRequests.innerHTML = '<p class="note">جارٍ تحميل طلبات الإيداع…</p>';
    try {
      const requests = await api('/wallet/deposits/mine');
      walletDepositRequests.replaceChildren();
      if (!Array.isArray(requests) || requests.length === 0) {
        walletDepositRequests.innerHTML = '<p class="note">لا توجد طلبات إيداع حتى الآن.</p>';
        return;
      }
      requests.forEach(item => {
        const card = document.createElement('article');
        card.className = 'ride-review';
        const title = document.createElement('h4');
        title.textContent = 'طلب إيداع — ' + (depositStatusLabels[item.status] || item.status);
        const amount = document.createElement('div');
        amount.className = 'review-row';
        const label = document.createElement('span');
        label.textContent = 'المبلغ';
        const value = document.createElement('strong');
        value.textContent = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: item.currency }).format(Number(item.amount));
        amount.append(label, value);
        const date = document.createElement('p');
        date.className = 'note';
        date.textContent = 'تاريخ الطلب: ' + (item.createdAt ? new Date(item.createdAt).toLocaleString('ar-EG') : '—');
        card.append(title, amount, date);
        if (item.note) { const note = document.createElement('p'); note.className = 'note'; note.textContent = 'ملاحظتك: ' + item.note; card.append(note); }
        if (item.adminNote) { const note = document.createElement('p'); note.className = 'note'; note.textContent = 'رد الإدارة: ' + item.adminNote; card.append(note); }
        walletDepositRequests.append(card);
      });
    } catch (error) {
      walletDepositRequests.innerHTML = '';
      const message = document.createElement('p');
      message.className = 'note';
      message.textContent = error.message || 'تعذّر تحميل طلبات الإيداع.';
      walletDepositRequests.append(message);
    }
  }

  if (walletOpenDepositButton && walletTopupCard) walletOpenDepositButton.addEventListener('click', () => {
    if (!token) { walletDepositFormStatus.textContent = 'سجّل الدخول أولًا.'; return; }
    walletTopupCard.hidden = !walletTopupCard.hidden;
    if (!walletTopupCard.hidden) walletDepositAmount.focus();
  });
  if (walletCancelDepositButton && walletTopupCard) walletCancelDepositButton.addEventListener('click', () => {
    walletTopupCard.hidden = true;
    walletDepositFormStatus.textContent = '';
  });

  if (walletDepositForm) walletDepositForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!token) { walletDepositFormStatus.textContent = 'سجّل الدخول أولًا.'; return; }
    const amount = Number(walletDepositAmount.value);
    if (!Number.isFinite(amount) || amount <= 0) { walletDepositFormStatus.textContent = 'أدخل مبلغًا صحيحًا.'; return; }
    walletDepositSubmit.disabled = true;
    walletDepositFormStatus.textContent = 'جارٍ إرسال الطلب…';
    try {
      await api('/wallet/deposits', { method: 'POST', body: JSON.stringify({
        amount,
        currency: (walletCurrencyInput.value || 'EGP').trim().toUpperCase(),
        note: walletDepositNote.value.trim()
      }) });
      walletDepositFormStatus.textContent = 'تم تسجيل طلب الإيداع. الرصيد لن يتغير حتى تعتمد الإدارة استلام المبلغ.';
      walletDepositForm.reset();
      if (walletTopupCard) walletTopupCard.hidden = true;
      await loadWalletDepositRequests();
    } catch (error) {
      walletDepositFormStatus.textContent = error.message || 'تعذّر إرسال طلب الإيداع.';
    } finally {
      walletDepositSubmit.disabled = false;
    }
  });

  refreshWalletButton.addEventListener('click', () => {
    loadWallet().catch(() => {});
    loadWalletDepositRequests().catch(() => {});
  });

  walletCurrencyInput.addEventListener('change', () => {
    walletCurrencyInput.value = walletCurrencyInput.value.trim().toUpperCase();
    if (token) loadWallet().catch(() => {});
  });

  confirmButton.addEventListener('click', async () => {
    bookingStatus.textContent = '';
    if (!token) {
      bookingStatus.textContent = 'سجّل الدخول أولًا حتى نرسل طلب الرحلة.';
      document.getElementById('auth-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      identifierInput.focus();
      return;
    }
    if (!pickupMarker || !destinationMarker || !pickupInput.value.trim() || !destinationInput.value.trim()) {
      bookingStatus.textContent = 'أكد نقطة الانطلاق والوجهة على الخريطة قبل إرسال الطلب.';
      return;
    }

    const scheduledDate = selectedSchedule === 'later' ? new Date(scheduledAtInput.value) : null;
    if (selectedSchedule === 'later' && (!scheduledAtInput.value || Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() < Date.now() + 5 * 60 * 1000)) {
      bookingStatus.textContent = 'اختار موعدًا صحيحًا بعد خمس دقائق على الأقل قبل إرسال الرحلة.';
      return;
    }

    const pickup = pickupMarker.getLatLng();
    const destination = destinationMarker.getLatLng();
    if (!cityCodeInput.value) {
      bookingStatus.textContent = 'اختار مدينة مفعّلة أولًا. إذا لم تظهر مدن، يلزم إعداد الأسعار من لوحة الإدارة.';
      return;
    }

    const payload = {
      pickupAddress: pickupInput.value.trim(),
      pickupLatitude: pickup.lat,
      pickupLongitude: pickup.lng,
      destinationAddress: destinationInput.value.trim(),
      destinationLatitude: destination.lat,
      destinationLongitude: destination.lng,
      cityCode: cityCodeInput.value,
      rideType: selectedRide,
      passengerCount: Number(document.getElementById('passengers').value),
      paymentMethod: selectedPayment,
      scheduledAt: scheduledDate ? scheduledDate.toISOString() : null,
      riderNote: document.getElementById('trip-note').value.trim() || null
    };

    confirmButton.disabled = true;
    confirmButton.textContent = 'جارٍ حساب السعر وإرسال الطلب…';
    try {
      const quote = await api('/pricing/quote', { method: 'POST', body: JSON.stringify({
        cityCode: payload.cityCode,
        rideType: payload.rideType,
        pickupLatitude: payload.pickupLatitude,
        pickupLongitude: payload.pickupLongitude,
        destinationLatitude: payload.destinationLatitude,
        destinationLongitude: payload.destinationLongitude
      }) });
      const priceChanged = !selectedFareQuote || selectedFareQuote.currency !== quote.currency || Math.abs(Number(selectedFareQuote.fareAmount) - Number(quote.fareAmount)) >= 0.01;
      selectedFareQuote = quote;
      document.getElementById('fare-price').textContent = new Intl.NumberFormat('ar', { style: 'currency', currency: quote.currency }).format(Number(quote.fareAmount));
      document.getElementById('fare-currency').textContent = quote.currency;
      document.getElementById('review-fare').textContent = new Intl.NumberFormat('ar', { style: 'currency', currency: quote.currency }).format(Number(quote.fareAmount));
      document.getElementById('review-city').textContent = quote.cityName + ' — ' + quote.currency;
      if (priceChanged) {
        bookingStatus.textContent = 'السعر الحالي هو ' + new Intl.NumberFormat('ar', { style: 'currency', currency: quote.currency }).format(Number(quote.fareAmount)) + '. راجع السعر الجديد ثم اضغط تأكيد مرة أخرى لإرسال الطلب.';
        confirmButton.textContent = 'تأكيد السعر وطلب الرحلة';
        confirmButton.disabled = false;
        return;
      }
      payload.quotedFareAmount = Number(quote.fareAmount);
      payload.quotedCurrency = quote.currency;
      const trip = await api('/trips', { method: 'POST', body: JSON.stringify(payload) });
      bookingStatus.textContent = 'تم إرسال طلب الرحلة بنجاح. ' + (trip.riderFreeRide ? 'تم استخدام مكافأة رحلة مجانية — لن تدفع أجرة الرحلة.' : 'السعر المحفوظ: ' + new Intl.NumberFormat('ar', { style: 'currency', currency: trip.fareCurrency || selectedFareQuote.currency }).format(Number(trip.fareAmount))) + ' — الحالة: قيد الانتظار.' +
        (trip.id ? ' رقم الطلب: ' + trip.id : '');
      confirmButton.textContent = 'تم إرسال الطلب';
      loadTripHistory().catch(() => {});
    } catch (error) {
      bookingStatus.textContent = /Fare or currency changed/i.test(error.message)
        ? 'تغيّر السعر أثناء المراجعة. راجع السعر المحدّث ثم اضغط تأكيد مرة أخرى.'
        : (error.message || 'تعذّر إرسال طلب الرحلة.');
      confirmButton.textContent = 'إعادة المحاولة';
      confirmButton.disabled = false;
    }
  });
})();

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
    bottomNav.classList.toggle('hidden', !signedIn);
    if (!signedIn) { accountView.classList.add('hidden'); dashboard.querySelector('.welcome').classList.remove('hidden'); dashboard.querySelector('.dashboard-grid').classList.remove('hidden'); historyPanel.classList.add('hidden'); }
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
      const labels = { transfer: 'تحويل محفظة', trip_payment: 'دفع رحلة', platform_commission: 'عمولة المنصة', card_top_up: 'إضافة رصيد', refund: 'استرداد', cash_out: 'سحب رصيد' };
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

  function showView(view) {
    if (view === 'account') {
      dashboard.querySelector('.welcome').classList.add('hidden');
      dashboard.querySelector('.dashboard-grid').classList.add('hidden');
      historyPanel.classList.add('hidden');
      accountView.classList.remove('hidden');
      loadAccount();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      accountView.classList.add('hidden');
      dashboard.querySelector('.welcome').classList.remove('hidden');
      dashboard.querySelector('.dashboard-grid').classList.remove('hidden');
      document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === 'trips'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
      historyTrips = assigned.filter((trip) => ['completed', 'cancelled'].includes(trip.status));
      const activeTrips = assigned.filter((trip) => !['completed', 'cancelled'].includes(trip.status));
      assignedCount.textContent = String(activeTrips.length);
      historyCount.textContent = String(historyTrips.length);
      availableCount.textContent = String(available.length);
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
    } catch (error) {
      loginStatus.textContent = error.message || 'تعذّر تسجيل الدخول.';
      loginStatus.classList.add('error');
    } finally {
      loginButton.disabled = false;
    }
  });

  $('refresh').addEventListener('click', loadTrips);
  $('mobileRefresh').addEventListener('click', loadTrips);
  document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.addEventListener('click', () => showView(item.dataset.view)));
  $('refreshWallet').addEventListener('click', loadAccount);
  function showWalletActionNotice(kind) {
    const notice = $('walletActionNotice');
    notice.classList.remove('hidden');
    notice.textContent = kind === 'deposit'
      ? 'طلب الإيداع: واجهة المحفظة جاهزة، لكن استقبال طلبات الإيداع لم يُفعّل بعد على الخادم. لن نضيف رصيدًا يدويًا أو نعرض عملية وهمية قبل ربط وسيلة دفع وموافقة الإدارة.'
      : 'طلب السحب: واجهة المحفظة جاهزة، لكن طلبات السحب ومراجعتها لم تُفعّل بعد على الخادم. لن يتم خصم أي رصيد قبل إعداد مسار سحب آمن وموافقة الإدارة.';
  }
  $('depositAction').addEventListener('click', () => showWalletActionNotice('deposit'));
  $('withdrawAction').addEventListener('click', () => showWalletActionNotice('withdraw'));
  document.querySelectorAll('.nav-item[data-target]').forEach((item) => item.addEventListener('click', () => {
    const target = $(item.dataset.target);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  $('logout').addEventListener('click', () => signOut());
  if (token) {
    showSignedIn(true);
    loadTrips().catch(() => {});
  } else showSignedIn(false);
})();
/* ============================================================
   CLASSIXTREET — мини-приложение Telegram
   ------------------------------------------------------------
   Работает только на app.html. Ничего своего про товары не
   знает: каталог, карточки, размерные сетки и корзину рисует
   тот же код, что и на сайте (js/app.js, js/cart.js).
   Здесь только четыре вещи:

     1. подключение к Telegram (тема, кнопки «Назад» и большая
        кнопка снизу);
     2. переключение экранов;
     3. экран корзины и форма заказа;
     4. отправка заказа боту.

   Если страницу открыть в обычном браузере — всё работает как
   мобильный каталог, а заказ уходит запасным путём (ссылка на
   чат или текст для копирования). Это же режим отладки.
   ============================================================ */
(function(){
  if (document.body.getAttribute('data-page') !== 'app') return;

  var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

  /* Заказ можно отправить прямо боту только если приложение
     запущено кнопкой на клавиатуре внизу чата. Открытое из меню
     или инлайн-кнопки — только для просмотра, sendData там
     не срабатывает. Это ограничение Telegram, не ошибка:
     на такой случай ниже есть запасной путь. */
  var canSend = !!(tg && typeof tg.sendData === 'function');

  /* Кнопка «Назад» есть не во всех версиях Telegram —
     проверяем при запуске и запоминаем. */
  var backOk = false;

  var VIEWS = ['catalog', 'sizes', 'cart', 'order'];
  var view  = 'catalog';

  var navButtons = Array.prototype.slice.call(document.querySelectorAll('.tgnav button'));
  var cartBox    = document.getElementById('tg-cart');
  var totalBox   = document.getElementById('tg-cart-total');
  var cartNote   = document.getElementById('tg-cart-note');
  var badge      = document.getElementById('tgnav-badge');
  var form       = document.getElementById('tg-order-form');
  var delBox     = document.getElementById('tg-delivery');
  var errBox     = document.getElementById('tg-form-error');
  var fallback   = document.getElementById('tg-fallback');
  var fbText     = document.getElementById('tg-fallback-text');
  var copyBtn    = document.getElementById('tg-copy');
  var submitBtn  = document.getElementById('tg-submit');

  /* ------------------------------------------------------------
     ЗАПУСК В TELEGRAM
     ------------------------------------------------------------ */
  function applyTheme(){
    if (!tg) return;
    /* Тёмная тема сайта уже описана в style.css под
       [data-theme="dark"] — просто включаем её. */
    document.documentElement.setAttribute(
      'data-theme', tg.colorScheme === 'dark' ? 'dark' : 'light'
    );
  }

  if (tg){
    tg.ready();
    tg.expand();
    /* Чтобы случайный свайп вниз не выбросил из формы
       с заполненными полями. */
    if (typeof tg.enableClosingConfirmation === 'function') tg.enableClosingConfirmation();
    applyTheme();
    tg.onEvent('themeChanged', applyTheme);

    /* Свою кнопку «Отправить заказ» прячем только если системная
       действительно работает. На старых клиентах Telegram её нет —
       там покупатель должен видеть обычную кнопку в форме. */
    var hasMain = !!(tg.MainButton && typeof tg.MainButton.setText === 'function'
                     && (typeof tg.isVersionAtLeast !== 'function' || tg.isVersionAtLeast('6.0')));
    if (hasMain) document.body.classList.add('has-mainbutton');

    if (tg.BackButton && (typeof tg.isVersionAtLeast !== 'function' || tg.isVersionAtLeast('6.1'))){
      tg.BackButton.onClick(function(){
        /* Если открыта карточка товара — закрываем её,
           а не уходим с экрана. */
        var modalOpen = document.querySelector('.modal:not([hidden])');
        if (modalOpen){
          var close = modalOpen.querySelector('[data-close]');
          if (close) close.click();
          return;
        }
        show(view === 'order' ? 'cart' : 'catalog');
      });
      backOk = true;
    }
    if (hasMain) tg.MainButton.onClick(mainButtonClick);
  }

  function haptic(kind){
    if (!tg || !tg.HapticFeedback) return;
    try {
      if (kind === 'ok') tg.HapticFeedback.notificationOccurred('success');
      else if (kind === 'err') tg.HapticFeedback.notificationOccurred('error');
      else tg.HapticFeedback.impactOccurred('light');
    } catch (e) {}
  }

  /* ------------------------------------------------------------
     ПЕРЕКЛЮЧЕНИЕ ЭКРАНОВ
     ------------------------------------------------------------ */
  function show(next){
    if (VIEWS.indexOf(next) === -1) next = 'catalog';
    view = next;

    VIEWS.forEach(function(v){
      var box = document.getElementById('view-' + v);
      if (box) box.hidden = (v !== next);
    });
    navButtons.forEach(function(b){
      var go = b.getAttribute('data-go');
      /* У экрана заказа своей кнопки в панели нет — подсвечиваем
         корзину, из которой в него приходят. */
      var active = go === next || (next === 'order' && go === 'cart');
      b.setAttribute('aria-pressed', String(active));
    });

    if (next === 'cart')  renderCart();
    if (next === 'order') prepareOrder();

    window.scrollTo(0, 0);
    syncSystemButtons();
  }

  navButtons.forEach(function(b){
    b.addEventListener('click', function(){
      haptic();
      show(b.getAttribute('data-go'));
    });
  });

  /* Кнопки Telegram: «Назад» сверху и большая кнопка снизу.
     Что на ней написано — зависит от экрана. */
  function syncSystemButtons(){
    if (!tg) return;

    if (backOk){
      if (view === 'catalog') tg.BackButton.hide();
      else                    tg.BackButton.show();
    }

    if (!document.body.classList.contains('has-mainbutton')) return;
    var n = cartCount();

    if (view === 'order'){
      tg.MainButton.setText('Отправить заказ');
      tg.MainButton.show();
      tg.MainButton.enable();
    } else if (view === 'cart'){
      if (n){
        tg.MainButton.setText('Оформить заказ');
        tg.MainButton.show();
        tg.MainButton.enable();
      } else {
        tg.MainButton.hide();
      }
    } else {
      if (n){
        tg.MainButton.setText('Корзина · ' + formatPrice(cartTotal()));
        tg.MainButton.show();
        tg.MainButton.enable();
      } else {
        tg.MainButton.hide();
      }
    }
  }

  function mainButtonClick(){
    if (view === 'order')      submitOrder();
    else if (view === 'cart')  show('order');
    else                       show('cart');
  }

  /* ------------------------------------------------------------
     СВЯЗЬ С КОРЗИНОЙ САЙТА

     js/app.js после «В корзину» вызывает openCart(), а
     js/cart.js открывает выдвижную панель — она нужна на
     большом экране, здесь вместо неё свой экран. Подменяем
     функции: этот файл подключён последним, а вызовы идут
     по имени во время работы.
     ------------------------------------------------------------ */
  window.openCart = function(){
    haptic();
    show('cart');
  };
  window.closeCart = function(){};

  var cartRefreshBase = window.cartRefresh;
  window.cartRefresh = function(){
    /* Счётчик в шапке сайта здесь не существует, но исходную
       функцию всё равно зовём — вдруг в неё что-то добавят. */
    if (typeof cartRefreshBase === 'function') cartRefreshBase();
    if (badge){
      var n = cartCount();
      badge.textContent = n;
      badge.hidden = n === 0;
    }
    if (view === 'cart') renderCart();
    syncSystemButtons();
  };

  /* ------------------------------------------------------------
     ЭКРАН КОРЗИНЫ
     Разметка позиции та же, что у выдвижной панели сайта
     (.citem в css/style.css) — свои стили не нужны.
     ------------------------------------------------------------ */
  function renderCart(){
    var items = cartLoad();
    cartBox.innerHTML = '';

    if (!items.length){
      var empty = document.createElement('p');
      empty.className = 'tgcart__empty';
      empty.textContent = 'Пока пусто';
      cartBox.appendChild(empty);

      var back = document.createElement('button');
      back.type = 'button';
      back.className = 'btn btn--ghost';
      back.style.width = '100%';
      back.style.justifyContent = 'center';
      back.textContent = 'В каталог';
      back.addEventListener('click', function(){ show('catalog'); });
      cartBox.appendChild(back);

      totalBox.hidden = true;
      cartNote.hidden = true;
      return;
    }

    items.forEach(function(it){
      var row = document.createElement('div');
      row.className = 'citem';

      var shot = document.createElement('div');
      shot.className = 'citem__shot';
      if (it.photo){
        var im = document.createElement('img');
        im.src = it.photo;
        im.alt = it.name;
        shot.appendChild(im);
      }
      row.appendChild(shot);

      var info = document.createElement('div');
      info.className = 'citem__info';

      var nm = document.createElement('h3');
      nm.className = 'citem__name';
      nm.textContent = it.name;
      info.appendChild(nm);

      var sz = document.createElement('p');
      sz.className = 'mono citem__size';
      sz.textContent = [
        it.color || '',
        it.size ? 'размер ' + it.size : 'размер не выбран'
      ].filter(Boolean).join(' · ');
      info.appendChild(sz);

      var qty = document.createElement('div');
      qty.className = 'qty';

      var minus = document.createElement('button');
      minus.type = 'button';
      minus.textContent = '−';
      minus.setAttribute('aria-label', 'Убрать одну');
      minus.addEventListener('click', function(){
        haptic();
        cartSetQty(it.key, it.qty - 1);
      });
      qty.appendChild(minus);

      var n = document.createElement('span');
      n.className = 'qty__n';
      n.textContent = it.qty;
      qty.appendChild(n);

      var plus = document.createElement('button');
      plus.type = 'button';
      plus.textContent = '+';
      plus.setAttribute('aria-label', 'Добавить одну');
      plus.addEventListener('click', function(){
        haptic();
        cartSetQty(it.key, it.qty + 1);
      });
      qty.appendChild(plus);

      info.appendChild(qty);
      row.appendChild(info);

      var right = document.createElement('div');
      right.className = 'citem__right';

      var pr = document.createElement('span');
      pr.className = 'citem__price';
      pr.textContent = formatPrice((it.price || 0) * it.qty);
      right.appendChild(pr);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'citem__del mono';
      del.textContent = 'Убрать';
      del.addEventListener('click', function(){
        haptic();
        cartRemove(it.key);
      });
      right.appendChild(del);

      row.appendChild(right);
      cartBox.appendChild(row);
    });

    totalBox.innerHTML = '<span>Итого</span><b>' + formatPrice(cartTotal()) + '</b>';
    totalBox.hidden = false;
    cartNote.hidden = false;

    /* Запасной режим: своей кнопки в Telegram не видно, но в
       браузере она единственный способ пойти дальше. */
    if (!tg){
      var go = document.createElement('button');
      go.type = 'button';
      go.className = 'btn btn--red btn--big';
      go.style.width = '100%';
      go.style.justifyContent = 'center';
      go.style.marginTop = '1rem';
      go.textContent = 'Оформить заказ';
      go.addEventListener('click', function(){ show('order'); });
      cartBox.appendChild(go);
    }
  }

  /* ------------------------------------------------------------
     ЭКРАН ЗАКАЗА
     ------------------------------------------------------------ */
  var deliveryBuilt = false;

  function prepareOrder(){
    if (!deliveryBuilt){
      /* Способы доставки — из DELIVERY в js/cart.js,
         как на checkout.html */
      DELIVERY.forEach(function(d, i){
        var lab = document.createElement('label');
        lab.className = 'delivery__opt';
        lab.innerHTML =
          '<input type="radio" name="delivery" value="' + d.name + '"' + (i === 0 ? ' checked' : '') + '>'
          + '<span class="delivery__name">' + d.name + '</span>'
          + '<span class="delivery__hint mono">' + d.hint + '</span>';
        delBox.appendChild(lab);
      });
      deliveryBuilt = true;

      /* Ник покупателя Telegram знает — подставляем,
         чтобы не набирать руками. */
      var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
      if (u && u.username && !form.contact.value) form.contact.value = '@' + u.username;
      if (u && u.first_name && !form.firstname.value) form.firstname.value = u.first_name;
      if (u && u.last_name  && !form.lastname.value)  form.lastname.value  = u.last_name;
    }
    errBox.hidden = true;
    fallback.hidden = true;
  }

  function readForm(){
    return {
      firstname: form.firstname.value.trim(),
      lastname:  form.lastname.value.trim(),
      phone:     form.phone.value.trim(),
      city:      form.city.value.trim(),
      contact:   form.contact.value.trim(),
      address:   form.address.value.trim(),
      note:      form.note.value.trim(),
      delivery:  (form.querySelector('input[name="delivery"]:checked') || {}).value || ''
    };
  }

  /* Проверка та же, что на checkout.html — чтобы заказ с сайта
     и заказ из приложения содержали одинаковый набор данных. */
  function problemsIn(data){
    var problems = [];
    if (!cartLoad().length) problems.push('корзина пуста');
    if (!data.firstname) problems.push('имя');
    if (!data.lastname)  problems.push('фамилия');
    if (!data.phone)     problems.push('телефон');
    if (!data.city)      problems.push('город');
    if (!data.contact)   problems.push('Telegram или ссылка на соцсеть');
    if (!document.getElementById('tf-agree').checked) problems.push('согласие на обработку данных');
    return problems;
  }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    submitOrder();
  });

  /* ------------------------------------------------------------
     ОТПРАВКА ЗАКАЗА

     Три попытки по очереди:
       1. отдать данные боту напрямую (tg.sendData);
       2. открыть чат с готовым текстом;
       3. показать текст для копирования.
     ------------------------------------------------------------ */
  function byteLength(s){
    /* sendData ограничен 4096 байтами, а не символами: русская
       буква — это два байта. */
    if (window.TextEncoder){
      try { return new TextEncoder().encode(s).length; } catch (e) {}
    }
    return encodeURIComponent(s).replace(/%[0-9A-F]{2}/gi, '.').length;
  }

  function buildPayload(data, short){
    var items = cartLoad().map(function(it){
      var row = { id: it.id, size: it.size || '', qty: it.qty, price: it.price || 0 };
      if (!short){
        row.name = it.name;
        if (it.color) row.color = it.color;
      }
      return row;
    });
    var f = data;
    if (short){
      f = {
        firstname: data.firstname, lastname: data.lastname,
        phone: data.phone, city: data.city, contact: data.contact,
        delivery: data.delivery, address: data.address,
        note: (data.note || '').slice(0, 200)
      };
    }
    return JSON.stringify({
      v: 1,
      no: orderNumber(),
      items: items,
      total: cartTotal(),
      form: f
    });
  }

  function orderSent(){
    cartClear();
    form.reset();
    haptic('ok');
    errBox.className = 'formerror formerror--ok';
    errBox.textContent = 'Заказ отправлен. Ответим в течение дня.';
    errBox.hidden = false;
  }

  var sending = false;

  function submitOrder(){
    if (sending) return;
    errBox.hidden = true;
    errBox.className = 'formerror';
    fallback.hidden = true;

    var data = readForm();
    var problems = problemsIn(data);
    if (problems.length){
      haptic('err');
      errBox.textContent = 'Не хватает: ' + problems.join(', ');
      errBox.hidden = false;
      errBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    /* --- 1. напрямую боту --- */
    if (canSend){
      var payload = buildPayload(data, false);
      if (byteLength(payload) > 3900) payload = buildPayload(data, true);

      if (byteLength(payload) <= 3900){
        var ok = true;
        sending = true;
        if (tg.MainButton) tg.MainButton.showProgress(true);

        /* Корзину освобождаем сразу: если данные ушли, Telegram
           закроет приложение и сделать это будет уже негде.
           Не ушли — вернём обратно из saved. */
        var saved = cartLoad();
        try {
          tg.sendData(payload);
          cartClear();
        } catch (err){
          ok = false;
        }

        /* Telegram не сообщает, дошли ли данные. Зато если дошли —
           он закрывает приложение. Значит: всё ещё открыты через
           две секунды — данные не приняты (так бывает, когда
           приложение открыто не кнопкой «Каталог» на клавиатуре,
           а из меню). Тогда уходим на запасной путь. */
        if (ok){
          setTimeout(function(){
            sending = false;
            if (tg.MainButton) tg.MainButton.hideProgress();
            cartSave(saved);
            fallbackOrder(data);
          }, 2000);
          return;
        }

        sending = false;
        if (tg.MainButton) tg.MainButton.hideProgress();
        cartSave(saved);
      }
    }

    fallbackOrder(data);
  }

  /* Запасной путь: открыть чат с готовым текстом, а если и это
     невозможно — показать текст для копирования. */
  function fallbackOrder(data){
    var text = buildOrderText(data);   /* js/cart.js */

    if (tg && typeof tg.openTelegramLink === 'function' && typeof TELEGRAM !== 'undefined' && TELEGRAM){
      tg.openTelegramLink('https://t.me/' + TELEGRAM + '?text=' + encodeURIComponent(text));
      orderSent();
      return;
    }
    if (!tg && sendOrder(text)){       /* js/cart.js — обычный браузер */
      orderSent();
      return;
    }

    haptic('err');
    fbText.value = text;
    fallback.hidden = false;
    fallback.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  copyBtn.addEventListener('click', function(){
    fbText.select();
    var done = false;
    try { done = document.execCommand('copy'); } catch (e) {}
    copyBtn.textContent = done ? 'Скопировано' : 'Выделено — скопируйте вручную';
    setTimeout(function(){ copyBtn.textContent = 'Скопировать'; }, 1800);
  });

  /* ------------------------------------------------------------
     ЗАПУСК
     ------------------------------------------------------------ */
  submitBtn.textContent = 'Отправить заказ';
  cartRefresh();
  show('catalog');
})();

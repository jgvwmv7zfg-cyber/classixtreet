/* ============================================================
   CLASSIXTREET — страница оформления заказа
   Работает только на checkout.html
   ============================================================ */
(function(){
  var box = document.getElementById('checkout');
  if (!box) return;

  var itemsBox = document.getElementById('checkout-items');
  var totalBox = document.getElementById('checkout-total');
  var delBox   = document.getElementById('delivery');
  var form     = document.getElementById('order-form');
  var errBox   = document.getElementById('form-error');
  var hintBox  = document.getElementById('checkout-hint');
  var fallback = document.getElementById('fallback');
  var fbText   = document.getElementById('fallback-text');
  var copyBtn  = document.getElementById('copy-btn');

  /* ---------- способы доставки ---------- */
  delBox.innerHTML = ''; // очистить перед заполнением
  DELIVERY.forEach(function(d, i){
    var lab = document.createElement('label');
    lab.className = 'delivery__opt';
    lab.innerHTML =
      '<input type="radio" name="delivery" value="' + d.name + '"' + (i === 0 ? ' checked' : '') + '>'
      + '<span class="delivery__name">' + d.name + '</span>'
      + '<span class="delivery__hint mono">' + d.hint + '</span>';
    delBox.appendChild(lab);
  });

  /* ---------- состав заказа ---------- */
  window.renderCheckout = function(){
    var items = cartLoad();
    itemsBox.innerHTML = '';

    if (!items.length){
      var p = document.createElement('p');
      p.className = 'mono drawer__empty';
      p.textContent = 'Корзина пуста';
      itemsBox.appendChild(p);
      totalBox.textContent = '';
      form.classList.add('is-disabled');
      return;
    }
    form.classList.remove('is-disabled');

    items.forEach(function(it){
      var row = document.createElement('div');
      row.className = 'sumrow';

      var left = document.createElement('div');
      var nm = document.createElement('b');
      nm.textContent = it.name;
      left.appendChild(nm);
      var meta = document.createElement('span');
      meta.className = 'mono sumrow__meta';
      meta.textContent = (it.size ? 'размер ' + it.size : 'без размера') + (it.qty > 1 ? ' · ' + it.qty + ' шт' : '');
      left.appendChild(meta);
      row.appendChild(left);

      var pr = document.createElement('span');
      pr.className = 'sumrow__price';
      pr.textContent = formatPrice((it.price || 0) * it.qty);
      row.appendChild(pr);

      itemsBox.appendChild(row);
    });

    totalBox.innerHTML = '<span class="mono">Итого</span><b>' + formatPrice(cartTotal()) + '</b>';
  };
  renderCheckout();

  /* ------------------------------------------------------------
     КАРТА ПУНКТОВ ВЫДАЧИ

     Два режима, переключаются ключом YANDEX_MAPS_KEY в cart.js:

     1. Без ключа — встроенная карта Яндекса в рамке. Показывает
        настоящие пункты, но кликать по ним нельзя: рамка чужая,
        браузер запрещает читать её содержимое.

     2. С ключом — карта рисуется библиотекой Яндекса прямо на
        странице. Пункты становятся нашими, клик подставляет
        полный адрес в поле «Адрес или пункт выдачи».
     ------------------------------------------------------------ */
  var pvz      = document.getElementById('pvz');
  var pvzMap   = document.getElementById('pvz-map');
  var pvzLive  = document.getElementById('pvz-live');
  var pvzTitle = document.getElementById('pvz-title');
  var pvzLink  = document.getElementById('pvz-link');
  var pvzHint  = document.getElementById('pvz-hint');
  var lastQuery = '';

  var hasKey = (typeof YANDEX_MAPS_KEY !== 'undefined') && YANDEX_MAPS_KEY;
  var ymapsReady = null, map = null, searchControl = null;

  function currentDelivery(){
    var val = (form.querySelector('input[name="delivery"]:checked') || {}).value || '';
    var found = null;
    DELIVERY.forEach(function(d){ if (d.name === val) found = d; });
    return found;
  }

  /* подгружаем библиотеку один раз */
  function loadYmaps(){
    if (ymapsReady) return ymapsReady;
    ymapsReady = new Promise(function(resolve, reject){
      var sc = document.createElement('script');
      sc.src = 'https://api-maps.yandex.ru/2.1/?apikey=' + encodeURIComponent(YANDEX_MAPS_KEY) + '&lang=ru_RU';
      sc.onload = function(){ window.ymaps.ready(function(){ resolve(window.ymaps); }); };
      sc.onerror = function(){ reject(new Error('Не удалось загрузить Яндекс Карты')); };
      document.head.appendChild(sc);
    });
    return ymapsReady;
  }

  /* живая карта: пункты кликабельны */
  function showLiveMap(query){
    pvzMap.hidden = true;
    pvzLive.hidden = false;

    loadYmaps().then(function(ymaps){
      if (!map){
        map = new ymaps.Map(pvzLive, { center: [55.16, 61.40], zoom: 11, controls: ['zoomControl'] });
        searchControl = new ymaps.control.SearchControl({
          options: { provider: 'yandex#search', noPlacemark: false, size: 'large', float: 'left' }
        });
        map.controls.add(searchControl);

        /* клик по пункту — забираем название и адрес */
        searchControl.events.add('resultselect', function(e){
          searchControl.getResult(e.get('index')).then(function(res){
            var name = res.properties.get('name') || '';
            var addr = (typeof res.getAddressLine === 'function' ? res.getAddressLine() : '')
                    || res.properties.get('description') || '';
            var full = [name, addr].filter(Boolean).join(', ');
            if (full){
              form.address.value = full;
              form.address.focus();
              pvzHint.textContent = 'Адрес подставлен: ' + full;
              pvzHint.classList.add('is-ok');
            }
          });
        });
      }
      searchControl.search(query);
      pvzHint.classList.remove('is-ok');
      pvzHint.textContent = 'Нажмите на пункт выдачи — адрес подставится в поле ниже';
    }).catch(function(){
      /* ключ неверный или библиотека не загрузилась — откатываемся на рамку */
      pvzLive.hidden = true;
      pvzMap.hidden = false;
      pvzMap.src = 'https://yandex.ru/map-widget/v1/?text=' + encodeURIComponent(query) + '&z=11';
      pvzHint.textContent = 'Карта в простом режиме — впишите адрес пункта в поле ниже вручную';
    });
  }

  /* простая карта в рамке */
  function showFrameMap(query){
    pvzLive.hidden = true;
    pvzMap.hidden = false;
    pvzMap.src = 'https://yandex.ru/map-widget/v1/?text=' + encodeURIComponent(query) + '&z=11';
    pvzHint.textContent = 'Найдите удобный пункт и впишите его адрес в поле ниже';
  }

  function updateMap(){
    var d = currentDelivery();
    var city = form.city.value.trim();

    if (!d || !d.search || city.length < 3){
      pvz.hidden = true;
      lastQuery = '';
      return;
    }
    var q = d.search + ', ' + city;
    if (q === lastQuery){ pvz.hidden = false; return; }
    lastQuery = q;

    pvzTitle.textContent = d.name + ' — ' + city;
    pvzLink.href = 'https://yandex.ru/maps/?text=' + encodeURIComponent(q);
    pvz.hidden = false;

    if (hasKey) showLiveMap(q);
    else        showFrameMap(q);
  }

  var cityTimer;
  form.city.addEventListener('input', function(){
    clearTimeout(cityTimer);
    cityTimer = setTimeout(updateMap, 600);
  });
  form.addEventListener('change', function(e){
    if (e.target.name === 'delivery') updateMap();
  });

  /* ---------- подсказка под кнопкой ----------
     Раньше здесь было «откроется чат с готовым сообщением»:
     покупателю приходилось отправлять заказ самому. Теперь заказ
     уходит сразу нам, копировать и пересылать ничего не нужно. */
  hintBox.textContent = ORDER_API
    ? 'Заказ уйдёт нам сразу — ничего пересылать не нужно'
    : 'Отправка не настроена: заполните ORDER_API в файле js/cart.js';

  /* ---------- отправка ---------- */
  form.addEventListener('submit', function(e){
    e.preventDefault();
    errBox.hidden = true;

    var data = {
      firstname: form.firstname.value.trim(),
      lastname:  form.lastname.value.trim(),
      phone:     form.phone.value.trim(),
      city:      form.city.value.trim(),
      contact:   form.contact.value.trim(),
      address:   form.address.value.trim(),
      note:      form.note.value.trim(),
      delivery:  (form.querySelector('input[name="delivery"]:checked') || {}).value || ''
    };

    var problems = [];
    if (!cartLoad().length)  problems.push('корзина пуста');
    if (!data.firstname) problems.push('имя');
    if (!data.lastname)  problems.push('фамилия');
    if (!data.phone)     problems.push('телефон');
    if (!data.city)      problems.push('город');
    if (!data.contact)   problems.push('Telegram или ссылка на соцсеть');
    if (!document.getElementById('f-agree').checked) problems.push('согласие на обработку данных');

    if (problems.length){
      errBox.textContent = 'Не хватает: ' + problems.join(', ');
      errBox.hidden = false;
      errBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    /* Отправляем и ждём ответа сервера. Пока ждём — блокируем
       кнопку, иначе покупатель нажмёт ещё раз и придёт два заказа.
       Сервер на бесплатном тарифе может просыпаться до минуты,
       поэтому честно пишем, что идёт отправка. */
    var btn = form.querySelector('button[type="submit"]');
    var btnText = btn ? btn.textContent : '';
    if (btn){ btn.disabled = true; btn.textContent = 'Отправляем…'; }

    errBox.className = 'formerror';
    errBox.textContent = 'Отправляем заказ. Это может занять до минуты — не закрывайте страницу.';
    errBox.hidden = false;

    var text = buildOrderText(data);

    sendOrder(data).then(function(res){
      form.reset();
      cartClear();
      renderCheckout();
      errBox.className = 'formerror formerror--ok';
      errBox.textContent = 'Заказ ' + res.no + ' принят. Мы напишем вам в течение дня.';
      errBox.hidden = false;
    }).catch(function(err){
      /* Заказ не дошёл. Не делаем вид, что всё хорошо: показываем
         готовый текст, чтобы человек мог отправить его сам. */
      console.error('Заказ не отправился:', err);
      errBox.className = 'formerror';
      errBox.textContent = 'Не получилось отправить заказ автоматически. '
        + 'Скопируйте текст ниже и пришлите его нам в Telegram — оформим вручную.';
      errBox.hidden = false;
      fbText.value = text;
      fallback.hidden = false;
      fallback.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }).finally(function(){
      if (btn){ btn.disabled = false; btn.textContent = btnText; }
    });
  });

  copyBtn.addEventListener('click', function(){
    fbText.select();
    try {
      document.execCommand('copy');
      copyBtn.textContent = 'Скопировано';
      setTimeout(function(){ copyBtn.textContent = 'Скопировать'; }, 1800);
    } catch (err) {}
  });
})();

/* ============================================================
   CLASSIXTREET — КОРЗИНА И ЗАКАЗ
   ------------------------------------------------------------
   Корзина хранится в браузере покупателя (localStorage), сервер
   не нужен. Заказ уходит вам в Telegram сам, через бота.

   Ник для Telegram задаётся в js/products.js — переменная TELEGRAM.
   ============================================================ */

/* Способы доставки. Правьте под себя: подпись и подсказка. */
/* ------------------------------------------------------------
   КЛЮЧ ЯНДЕКС КАРТ — бесплатный, получается за пару минут
   в кабинете разработчика Яндекса (JavaScript API и Геокодер).

   ПУСТО  — карта показывается простой картинкой-рамкой.
             Смотреть можно, кликать по пунктам нельзя.
   ВПИСАН — карта становится живой: пункты выдачи кликабельны,
             по клику адрес сам подставляется в поле заказа.
   ------------------------------------------------------------ */
var YANDEX_MAPS_KEY = '';

/* search — что искать на карте пунктов выдачи. Пусто — карта не показывается. */
var DELIVERY = [
  { id: 'cdek',    name: 'СДЭК',                       hint: 'Пункт выдачи или курьер',        search: 'СДЭК пункт выдачи' },
  { id: 'post',    name: 'Почта России',               hint: 'Дольше, но есть везде',          search: 'Почта России отделение' },
  { id: 'yandex',  name: 'Яндекс Доставка / Boxberry', hint: 'Альтернативные пункты выдачи',   search: 'Boxberry пункт выдачи' },
  { id: 'pickup',  name: 'Самовывоз в Челябинске',     hint: 'Договоримся о встрече',          search: '' }
];

var CART_KEY = 'cxt-cart-v1';

/* ---------- хранилище ---------- */
function cartLoad(){
  try {
    var raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function cartSave(items){
  try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (e) {}
  cartRefresh();
}
function cartCount(){
  return cartLoad().reduce(function(n, it){ return n + it.qty; }, 0);
}
function cartTotal(){
  return cartLoad().reduce(function(s, it){ return s + (it.price || 0) * it.qty; }, 0);
}

/* ---------- изменение ---------- */
function cartAdd(product, size){
  var items = cartLoad();
  var key = product.id + '|' + (size || '');
  var found = null;
  items.forEach(function(it){ if (it.key === key) found = it; });
  if (found) { found.qty += 1; }
  else {
    items.push({
      key: key, id: product.id, name: product.name,
      color: product.color || '', size: size || '',
      price: product.price || 0, photo: product.photo || '', qty: 1
    });
  }
  cartSave(items);
}
function cartSetQty(key, qty){
  var items = cartLoad().map(function(it){
    if (it.key === key) it.qty = Math.max(1, Math.min(99, qty));
    return it;
  });
  cartSave(items);
}
function cartRemove(key){
  cartSave(cartLoad().filter(function(it){ return it.key !== key; }));
}
function cartClear(){ cartSave([]); }

/* ---------- кнопка в шапке ---------- */
var cartBtn, cartBadge, drawer, drawerBody, drawerFoot;

function buildCartButton(){
  var bar = document.querySelector('.topbar__inner');
  if (!bar) return;
  cartBtn = document.createElement('button');
  cartBtn.type = 'button';
  cartBtn.className = 'cartbtn';
  cartBtn.setAttribute('aria-label', 'Корзина');
  cartBtn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true">'
    + '<path d="M4 6h16l-1.5 11.5a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5L4 6z"/>'
    + '<path d="M9 6V4.5a3 3 0 0 1 6 0V6"/></svg>'
    + '<span class="cartbtn__badge" hidden>0</span>';
  cartBadge = cartBtn.querySelector('.cartbtn__badge');
  cartBtn.addEventListener('click', openCart);
  var tg = bar.querySelector('.btn');
  bar.insertBefore(cartBtn, tg || null);
}

/* ---------- выдвижная панель ---------- */
function buildDrawer(){
  drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.hidden = true;
  drawer.innerHTML =
    '<div class="drawer__backdrop" data-close></div>'
    + '<aside class="drawer__panel" role="dialog" aria-modal="true" aria-label="Корзина">'
    +   '<div class="drawer__head">'
    +     '<h2 class="drawer__title">Корзина</h2>'
    +     '<button type="button" class="drawer__close" data-close aria-label="Закрыть">'
    +       '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>'
    +     '</button>'
    +   '</div>'
    +   '<div class="drawer__body"></div>'
    +   '<div class="drawer__foot"></div>'
    + '</aside>';
  document.body.appendChild(drawer);
  drawerBody = drawer.querySelector('.drawer__body');
  drawerFoot = drawer.querySelector('.drawer__foot');
  drawer.addEventListener('click', function(e){
    if (e.target.closest('[data-close]')) closeCart();
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && drawer && !drawer.hidden) closeCart();
  });
}

function openCart(){
  if (!drawer) buildDrawer();
  renderDrawer();
  drawer.hidden = false;
  document.body.classList.add('is-locked');
}
function closeCart(){
  if (!drawer) return;
  drawer.hidden = true;
  document.body.classList.remove('is-locked');
}

function renderDrawer(){
  var items = cartLoad();
  drawerBody.innerHTML = '';
  drawerFoot.innerHTML = '';

  if (!items.length){
    var empty = document.createElement('p');
    empty.className = 'drawer__empty mono';
    empty.textContent = 'Пока пусто';
    drawerBody.appendChild(empty);
    var back = document.createElement('a');
    back.className = 'btn btn--ghost';
    back.href = 'catalog.html';
    back.textContent = 'В каталог';
    drawerFoot.appendChild(back);
    return;
  }

  items.forEach(function(it){
    var row = document.createElement('div');
    row.className = 'citem';

    var shot = document.createElement('div');
    shot.className = 'citem__shot';
    if (it.photo){
      var im = document.createElement('img');
      im.src = it.photo; im.alt = it.name; shot.appendChild(im);
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
    /* цвет важен: одна модель может идти в нескольких расцветках */
    sz.textContent = [
      it.color || '',
      it.size ? 'размер ' + it.size : 'размер не выбран'
    ].filter(Boolean).join(' · ');
    info.appendChild(sz);

    var qty = document.createElement('div');
    qty.className = 'qty';
    [['−', -1], ['+', 1]].forEach(function(pair, i){
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = pair[0];
      b.setAttribute('aria-label', pair[1] > 0 ? 'Добавить' : 'Убрать');
      b.addEventListener('click', function(){
        cartSetQty(it.key, it.qty + pair[1]);
        renderDrawer();
      });
      if (i === 0) qty.appendChild(b);
      else {
        var n = document.createElement('span');
        n.className = 'qty__n';
        n.textContent = it.qty;
        qty.appendChild(n);
        qty.appendChild(b);
      }
    });
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
    del.addEventListener('click', function(){ cartRemove(it.key); renderDrawer(); });
    right.appendChild(del);
    row.appendChild(right);

    drawerBody.appendChild(row);
  });

  var sum = document.createElement('div');
  sum.className = 'drawer__sum';
  sum.innerHTML = '<span class="mono">Итого</span><b>' + formatPrice(cartTotal()) + '</b>';
  drawerFoot.appendChild(sum);

  var go = document.createElement('a');
  go.className = 'btn btn--red btn--big';
  go.href = 'checkout.html';
  go.textContent = 'Оформить заказ';
  drawerFoot.appendChild(go);
}

/* ---------- обновление счётчика ---------- */
function cartRefresh(){
  var n = cartCount();
  if (cartBadge){
    cartBadge.textContent = n;
    cartBadge.hidden = n === 0;
  }
  if (typeof renderCheckout === 'function') renderCheckout();
}

/* ---------- сборка текста заказа ---------- */
function orderNumber(){
  var d = new Date();
  function p(n){ return String(n).padStart(2, '0'); }
  return 'CXT-' + String(d.getFullYear()).slice(2) + p(d.getMonth()+1) + p(d.getDate())
       + '-' + p(d.getHours()) + p(d.getMinutes());
}

function buildOrderText(form){
  var items = cartLoad();
  var lines = ['Заказ ' + orderNumber(), ''];
  items.forEach(function(it, i){
    lines.push((i+1) + '. ' + it.name
      + (it.color ? ', ' + it.color : '')
      + (it.size ? ', размер ' + it.size : '')
      + (it.qty > 1 ? ' × ' + it.qty : '')
      + ' — ' + formatPrice((it.price || 0) * it.qty));
  });
  lines.push('');
  lines.push('Итого: ' + formatPrice(cartTotal()));
  lines.push('');
  if (form){
    var fio = [form.firstname, form.lastname].filter(Boolean).join(' ');
    if (fio)           lines.push('Покупатель: ' + fio);
    if (form.phone)    lines.push('Телефон: ' + form.phone);
    if (form.contact)  lines.push('Связь: ' + form.contact);
    if (form.city)     lines.push('Город: ' + form.city);
    if (form.delivery) lines.push('Доставка: ' + form.delivery);
    if (form.address)  lines.push('Адрес / пункт выдачи: ' + form.address);
    if (form.note)     lines.push('Комментарий: ' + form.note);
  }
  return lines.join('\n');
}

/* ============================================================
   ОТПРАВКА ЗАКАЗА
   ------------------------------------------------------------
   Заказ уходит на сервер бота, а бот кладёт его вам в Telegram.
   Покупатель ничего никуда не пересылает и ничего не копирует.

   Один адрес на весь сайт — меняете здесь, меняется везде.
   Пустая строка выключает отправку: тогда останется только
   запасной путь с текстом для копирования.

   ВАЖНО про бесплатный Render: если на сервер долго никто не
   заходил, он засыпает и первый запрос будит его 30–60 секунд.
   Поэтому ждём до полутора минут и всё это время показываем
   покупателю, что идёт отправка. Обрывать раньше нельзя —
   заказ потеряется.
   ============================================================ */
var ORDER_API = 'https://classixtreet-bot.onrender.com/api/order';
var ORDER_TIMEOUT = 90000;

/* Заказ одной структурой. Ровно в таком виде его понимает бот —
   и с сайта, и из мини-приложения Telegram. */
function buildOrderPayload(form){
  return {
    v: 1,
    no: orderNumber(),
    items: cartLoad().map(function(it){
      return {
        id: it.id, name: it.name, color: it.color || '',
        size: it.size || '', qty: it.qty, price: it.price || 0
      };
    }),
    total: cartTotal(),
    form: form || {}
  };
}

/* Отправляет заказ и ЧЕСТНО сообщает, дошёл ли он.
   Возвращает промис: сбылся — заказ у вас, отказал — нет.
   Раньше здесь стояло «всегда считать, что дошло»: покупатель
   видел «заказ отправлен» даже когда сервер спал, и заказ
   пропадал молча. */
function sendOrder(form){
  var order = buildOrderPayload(form);

  if (!ORDER_API){
    return Promise.reject(new Error('адрес сервера не задан'));
  }

  var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
  var timer = setTimeout(function(){ if (ctrl) ctrl.abort(); }, ORDER_TIMEOUT);

  return fetch(ORDER_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
    signal: ctrl ? ctrl.signal : undefined
  })
  .then(function(res){
    if (!res.ok) throw new Error('сервер ответил ' + res.status);
    return res.json();
  })
  .then(function(data){
    if (!data || !data.ok) throw new Error('сервер не принял заказ');
    return { no: data.no || order.no };
  })
  .finally(function(){ clearTimeout(timer); });
}

/* ---------- запуск ---------- */
(function(){
  buildCartButton();
  cartRefresh();
})();

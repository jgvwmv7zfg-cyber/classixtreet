/* ============================================================
   CLASSIXTREET — сборка карточек, фильтры, таблицы размеров.
   Товары берутся из js/products.js — правьте там, не здесь.
   ============================================================ */

/* Куда ведёт кнопка «Заказать».
   На главной — к блоку «Как заказать», из каталога — на главную к нему же.
   В мини-приложении Telegram ссылки нет: клик по карточке всё равно
   перехватывается и открывает подробную панель. */
var ORDER_LINK = (function(){
  var page = document.body.getAttribute('data-page');
  if (page === 'app')     return '#';
  if (page === 'catalog') return 'index.html#order';
  return '#order';
})();

/* Подпись строки характеристик, своя для каждой категории */
var EXTRA_LABEL = {
  tee:    'Крой',
  hoodie: 'Начёс',
  zip:    'Молния',
  pants:  'Детали',
  suit:   'Комплект'
};

/* Цена: 2490 -> «2 490 ₽», null -> «— ₽» */
function formatPrice(value){
  if (value === null || value === undefined || value === '') return '— ₽';
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
}

/* Скидка в процентах: 6590 -> 5490 даёт «-17%» */
function discountPercent(p){
  if (!p.price || !p.old || p.old <= p.price) return 0;
  return Math.round((1 - p.price / p.old) * 100);
}

/* Цена со старой ценой рядом. Возвращает готовый блок */
function buildPrice(p, cls){
  var box = document.createElement('div');
  box.className = cls;

  var now = document.createElement('span');
  now.className = 'price';
  if (p.price === null || p.price === undefined || p.price === '') now.setAttribute('data-empty', '');
  now.textContent = formatPrice(p.price);
  box.appendChild(now);

  if (p.old && p.price && p.old > p.price){
    var was = document.createElement('s');
    was.className = 'price__old';
    was.textContent = formatPrice(p.old);
    box.appendChild(was);

    var off = document.createElement('span');
    off.className = 'price__off';
    off.textContent = '\u2212' + discountPercent(p) + '%';
    box.appendChild(off);
  }
  return box;
}

/* Собирает одну карточку товара и возвращает готовый элемент */
function buildCard(p){
  var card = document.createElement('article');
  card.className = 'card';
  card.setAttribute('data-cat', p.cat);
  card.setAttribute('data-col', p.col);

  /* --- фото --- */
  var shot = document.createElement('div');
  shot.className = 'card__shot';

  if (p.tag){
    var tag = document.createElement('span');
    tag.className = 'card__tag';
    tag.textContent = p.tag;
    shot.appendChild(tag);
  }
  if (p.sold){
    var sold = document.createElement('span');
    sold.className = 'card__sold';
    sold.textContent = 'Распродано';
    shot.appendChild(sold);
  }
  if (p.photo && p.photo2){
    /* Есть перёд и спина — собираем разворот. Вещь поворачивается
       при наведении, на телефоне — по нажатию. */
    var flip = document.createElement('div');
    flip.className = 'flip';

    var inner = document.createElement('div');
    inner.className = 'flip__inner';

    var face = document.createElement('img');
    face.className = 'flip__face';
    face.src = p.photo; face.alt = p.name; face.loading = 'lazy';

    var faceBack = document.createElement('img');
    faceBack.className = 'flip__face flip__face--back';
    faceBack.src = p.photo2; faceBack.alt = p.name + ' — вид сзади'; faceBack.loading = 'lazy';

    inner.appendChild(face);
    inner.appendChild(faceBack);
    flip.appendChild(inner);

    var badge = document.createElement('span');
    badge.className = 'flip__badge';
    badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'
      + '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>'
      + '<b>360</b>';
    flip.appendChild(badge);

    shot.appendChild(flip);

  } else if (p.photo){
    var img = document.createElement('img');
    img.src = p.photo;
    img.alt = p.name;
    img.loading = 'lazy';
    shot.appendChild(img);
  } else {
    var slot = document.createElement('p');
    slot.className = 'card__slot';
    slot.innerHTML = 'фото<br>1080 &times; 1350';
    shot.appendChild(slot);
  }
  card.appendChild(shot);

  /* --- текстовая часть --- */
  var body = document.createElement('div');
  body.className = 'card__body';

  var cat = document.createElement('span');
  cat.className = 'mono card__cat';
  cat.textContent = CATEGORIES[p.cat] || p.cat;
  body.appendChild(cat);

  var name = document.createElement('h3');
  name.className = 'card__name';
  name.textContent = p.name;
  body.appendChild(name);

  /* цвет — когда одна модель идёт в нескольких расцветках */
  if (p.color){
    var sub = document.createElement('span');
    sub.className = 'card__sub';
    sub.textContent = p.color;
    name.insertAdjacentElement('afterend', sub);
  }

  /* строки характеристик */
  var rows = p.cat === 'suit'
    ? [['Комплект', p.extra], ['Состав', p.comp], ['Плотность', p.dens], ['Размеры', p.sizes]]
    : [['Состав', p.comp], ['Плотность', p.dens], [EXTRA_LABEL[p.cat] || 'Детали', p.extra], ['Размеры', p.sizes]];

  var table = document.createElement('table');
  table.className = 'spec';
  rows.forEach(function(pair){
    if (!pair[1]) return;
    var tr = document.createElement('tr');
    var th = document.createElement('th');
    var td = document.createElement('td');
    th.textContent = pair[0];
    td.textContent = pair[1];
    tr.appendChild(th);
    tr.appendChild(td);
    table.appendChild(tr);
  });
  body.appendChild(table);

  /* цена и кнопка */
  var foot = document.createElement('div');
  foot.className = 'card__foot';

  foot.appendChild(buildPrice(p, 'card__price'));

  var link = document.createElement('a');
  link.href = ORDER_LINK;
  link.textContent = p.sold ? 'В лист ожидания' : 'Заказать';
  foot.appendChild(link);

  body.appendChild(foot);
  card.appendChild(body);

  /* Клик по карточке открывает подробную панель */
  card.addEventListener('click', function(e){
    e.preventDefault();
    openProduct(p);
  });
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', p.name + ' — подробнее');
  card.addEventListener('keydown', function(e){
    if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openProduct(p); }
  });

  return card;
}

/* ------------------------------------------------------------
   ТАБЛИЦЫ РАЗМЕРОВ. Строятся из SIZES в products.js —
   и в разделе «Размеры», и внутри карточки товара.
   ------------------------------------------------------------ */
function buildSizeTable(key){
  var data = SIZES[key];
  if (!data) return null;

  var table = document.createElement('table');
  table.className = 'sizes';

  var cap = document.createElement('caption');
  cap.className = 'sizes__cap';
  cap.textContent = data.title;
  table.appendChild(cap);

  var thead = document.createElement('thead');
  var htr = document.createElement('tr');
  var th0 = document.createElement('th');
  th0.textContent = 'Размер';
  htr.appendChild(th0);
  data.cols.forEach(function(c){
    var th = document.createElement('th');
    if (c[0]){
      var i = document.createElement('i');
      i.textContent = c[0];
      th.appendChild(i);
    }
    th.appendChild(document.createTextNode(c[1]));
    htr.appendChild(th);
  });
  thead.appendChild(htr);
  table.appendChild(thead);

  var tbody = document.createElement('tbody');
  data.rows.forEach(function(row){
    var tr = document.createElement('tr');
    row.forEach(function(v, i){
      var cell = document.createElement(i === 0 ? 'th' : 'td');
      cell.textContent = v;
      tr.appendChild(cell);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  /* Правило сетки, если оно есть: «ширина одна, меняется длина».
     Отдаём таблицу вместе с подписью — она видима, в отличие от
     caption, который спрятан и читается только голосовым доступом. */
  if (!data.note) return table;
  var pack = document.createDocumentFragment();
  pack.appendChild(table);
  var note = document.createElement('p');
  note.className = 'sizes__note';
  note.textContent = data.note;
  pack.appendChild(note);
  return pack;
}

(function(){
  Array.prototype.forEach.call(document.querySelectorAll('[data-sizetable]'), function(box){
    var t = buildSizeTable(box.getAttribute('data-sizetable'));
    if (t) box.appendChild(t);
  });
})();

/* Рисует список товаров в указанную сетку */
function renderGrid(grid, list){
  grid.innerHTML = '';
  list.forEach(function(p){ grid.appendChild(buildCard(p)); });
}

/* ------------------------------------------------------------
   ГЛАВНАЯ: избранные товары (те, у кого top: true)
   ------------------------------------------------------------ */
(function(){
  var grid = document.getElementById('grid-top');
  if (!grid) return;
  renderGrid(grid, PRODUCTS.filter(function(p){ return p.top; }));
})();

/* ------------------------------------------------------------
   КАТАЛОГ: фильтры по категориям и коллекциям
   ------------------------------------------------------------ */
(function(){
  var grid = document.getElementById('grid-all');
  if (!grid) return;

  var state   = { cat: 'all', col: 'all' };
  var catRow  = document.getElementById('filter-cat');
  var colRow  = document.getElementById('filter-col');
  var counter = document.getElementById('count');
  var reset   = document.getElementById('reset');
  var empty   = document.getElementById('empty');

  /* Создаёт ряд кнопок по словарю вида {код: 'Название'} */
  function buildButtons(row, dict, key){
    var all = document.createElement('button');
    all.type = 'button';
    all.textContent = 'Все';
    all.setAttribute('data-value', 'all');
    all.setAttribute('aria-pressed', 'true');
    row.appendChild(all);

    Object.keys(dict).forEach(function(code){
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = dict[code];
      b.setAttribute('data-value', code);
      b.setAttribute('aria-pressed', 'false');
      row.appendChild(b);
    });

    row.addEventListener('click', function(e){
      var btn = e.target.closest('button');
      if (!btn) return;
      state[key] = btn.getAttribute('data-value');
      Array.prototype.forEach.call(row.querySelectorAll('button'), function(b){
        b.setAttribute('aria-pressed', String(b === btn));
      });
      apply();
    });
  }

  /* Пересобирает сетку по текущему состоянию фильтров */
  function apply(){
    var list = PRODUCTS.filter(function(p){
      return (state.cat === 'all' || p.cat === state.cat)
          && (state.col === 'all' || p.col === state.col);
    });

    renderGrid(grid, list);
    grid.hidden = list.length === 0;
    if (empty) empty.hidden = list.length !== 0;

    if (counter){
      counter.textContent = list.length + ' ' + plural(list.length, ['позиция', 'позиции', 'позиций'])
        + ' из ' + PRODUCTS.length;
    }
    if (reset) reset.hidden = (state.cat === 'all' && state.col === 'all');
  }

  /* «1 позиция / 2 позиции / 5 позиций» */
  function plural(n, forms){
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  }

  if (catRow) buildButtons(catRow, CATEGORIES, 'cat');

  /* Строка коллекций нужна, только когда коллекций больше одной.
     Пока она одна — прячем весь ряд, чтобы не было кнопки без смысла. */
  if (colRow){
    if (Object.keys(COLLECTIONS).length > 1){
      buildButtons(colRow, COLLECTIONS, 'col');
    } else {
      var colRowWrap = colRow.closest('.filterbar__row');
      if (colRowWrap) colRowWrap.hidden = true;
    }
  }

  if (reset){
    reset.addEventListener('click', function(){
      state.cat = 'all';
      state.col = 'all';
      [catRow, colRow].forEach(function(row){
        if (!row) return;
        Array.prototype.forEach.call(row.querySelectorAll('button'), function(b){
          b.setAttribute('aria-pressed', String(b.getAttribute('data-value') === 'all'));
        });
      });
      apply();
    });
  }

  /* Если пришли по ссылке вида catalog.html#hoodie — сразу открыть эту категорию */
  var hash = window.location.hash.replace('#', '');
  if (hash && CATEGORIES[hash]){
    state.cat = hash;
    Array.prototype.forEach.call(catRow.querySelectorAll('button'), function(b){
      b.setAttribute('aria-pressed', String(b.getAttribute('data-value') === hash));
    });
  }

  apply();
})();

/* ------------------------------------------------------------
   ТАБЛИЦЫ РАЗМЕРОВ
   ------------------------------------------------------------ */
(function(){
  var tabs = document.getElementById('sizetabs');
  if (!tabs) return;
  var buttons = Array.prototype.slice.call(tabs.querySelectorAll('button'));
  var panels  = Array.prototype.slice.call(document.querySelectorAll('[data-panel]'));

  buttons.forEach(function(btn){
    btn.addEventListener('click', function(){
      var key = btn.getAttribute('data-size');
      buttons.forEach(function(b){ b.setAttribute('aria-pressed', String(b === btn)); });
      panels.forEach(function(p){ p.hidden = p.getAttribute('data-panel') !== key; });
    });
  });
})();

/* ============================================================
   ПОДРОБНАЯ ПАНЕЛЬ ТОВАРА
   Открывается по клику на карточку. Внутри: крупное фото с
   переключением перёд/спина, характеристики, выбор размера,
   размерная сетка этой категории и кнопка заказа.
   ============================================================ */
var modal = (function(){
  var root, img, viewsBox, catEl, nameEl, subEl, priceEl, storyEl, storyLink, specEl,
      descEl, sizesBox, addBtn, orderBtn, hintEl, chartBox, current = null, chosen = '';

  function el(tag, cls, text){
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function build(){
    root = el('div', 'modal');
    root.hidden = true;

    var backdrop = el('div', 'modal__backdrop');
    backdrop.setAttribute('data-close', '');
    root.appendChild(backdrop);

    var panel = el('div', 'modal__panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');

    var close = el('button', 'modal__close');
    close.type = 'button';
    close.setAttribute('data-close', '');
    close.setAttribute('aria-label', 'Закрыть');
    close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>';
    panel.appendChild(close);

    var grid = el('div', 'modal__grid');

    /* левая половина — фото */
    var media = el('div', 'modal__media');
    var shot = el('div', 'modal__shot');
    img = el('img');
    img.alt = '';
    shot.appendChild(img);
    media.appendChild(shot);
    viewsBox = el('div', 'filters modal__views');
    media.appendChild(viewsBox);
    grid.appendChild(media);

    /* правая половина — данные */
    var info = el('div', 'modal__info');
    catEl   = el('span', 'mono modal__cat');
    nameEl  = el('h2', 'modal__name');
    subEl   = el('span', 'mono modal__sub');
    priceEl = el('div', 'modal__price');
    storyEl = el('p', 'modal__story');
    storyLink = el('a', 'mono modal__story-link', 'Вся история');
    storyLink.href = 'about.html';
    specEl  = el('table', 'spec');
    descEl  = el('ul', 'modal__desc');
    sizesBox = el('div', 'modal__sizes');
    addBtn   = el('button', 'btn btn--red btn--big modal__order');
    addBtn.type = 'button';
    addBtn.addEventListener('click', function(){
      if (typeof cartAdd !== 'function') return;
      cartAdd(current, chosen);
      addBtn.textContent = 'Добавлено';
      setTimeout(function(){ if (typeof openCart === 'function') openCart(); }, 260);
    });
    orderBtn = el('a', 'btn btn--ghost modal__order');
    hintEl  = el('p', 'modal__hint mono');
    info.appendChild(catEl);
    info.appendChild(nameEl);
    info.appendChild(subEl);
    info.appendChild(priceEl);
    info.appendChild(storyEl);
    info.appendChild(storyLink);
    info.appendChild(specEl);
    info.appendChild(descEl);
    info.appendChild(sizesBox);
    info.appendChild(addBtn);
    info.appendChild(orderBtn);
    info.appendChild(hintEl);
    grid.appendChild(info);

    panel.appendChild(grid);

    /* размерная сетка снизу */
    chartBox = el('div', 'modal__chart');
    panel.appendChild(chartBox);

    root.appendChild(panel);
    document.body.appendChild(root);

    root.addEventListener('click', function(e){
      if (e.target.closest('[data-close]')) close_();
    });
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && !root.hidden) close_();
    });
    return root;
  }

  function setView(src, label){
    img.src = src;
    img.alt = current.name + (label ? ' — ' + label : '');
    Array.prototype.forEach.call(viewsBox.querySelectorAll('button'), function(b){
      b.setAttribute('aria-pressed', String(b.textContent === label));
    });
  }

  function updateOrder(){
    var text = 'Здравствуйте! Хочу заказать: ' + current.name
             + (current.color ? ', ' + current.color : '')
             + (chosen ? ', размер ' + chosen : '')
             + (current.price ? ' — ' + formatPrice(current.price) : '');
    if (TELEGRAM){
      orderBtn.href = 'https://t.me/' + TELEGRAM + '?text=' + encodeURIComponent(text);
      orderBtn.target = '_blank';
      orderBtn.rel = 'noopener';
    } else {
      orderBtn.href = ORDER_LINK;
      orderBtn.removeAttribute('target');
    }
    orderBtn.textContent = current.sold ? 'В лист ожидания' : 'Написать напрямую';

    /* кнопка корзины: пока размер не выбран — не даём положить */
    var needsSize = !current.sold && String(current.sizes || '').replace(/[^A-ZА-Я0-9]/gi,'').length > 0;
    addBtn.hidden = current.sold;
    addBtn.disabled = needsSize && !chosen;
    addBtn.textContent = chosen ? 'В корзину · размер ' + chosen : 'Выберите размер';
    hintEl.textContent = current.sold
      ? 'Напишите нам — поставим в лист ожидания'
      : (chosen ? 'Доставку посчитаем после подтверждения наличия' : 'Размер нужен, чтобы мы отложили именно вашу вещь');
  }

  function open(p){
    if (!root) build();
    current = p; chosen = '';

    catEl.textContent = CATEGORIES[p.cat] || p.cat;
    nameEl.textContent = p.name;
    subEl.textContent = p.color || '';
    subEl.hidden = !p.color;
    priceEl.innerHTML = '';
    priceEl.appendChild(buildPrice(p, 'modal__pricebox'));
    priceEl.classList.toggle('is-empty', !p.price);

    /* строка о смысле вещи — если она задана в products.js */
    storyEl.textContent = p.story || '';
    storyEl.hidden = !p.story;
    storyLink.hidden = !p.story;

    /* характеристики */
    specEl.innerHTML = '';
    var rows = p.cat === 'suit'
      ? [['Комплект', p.extra], ['Состав', p.comp], ['Плотность', p.dens]]
      : [['Состав', p.comp], ['Плотность', p.dens], [EXTRA_LABEL[p.cat] || 'Детали', p.extra]];
    if (p.color) rows.unshift(['Цвет', p.color]);
    rows.forEach(function(pair){
      if (!pair[1]) return;
      var tr = document.createElement('tr');
      var th = document.createElement('th'); th.textContent = pair[0];
      var td = document.createElement('td'); td.textContent = pair[1];
      tr.appendChild(th); tr.appendChild(td); specEl.appendChild(tr);
    });

    /* подробное описание списком, если оно задано */
    descEl.innerHTML = '';
    var lines = (p.desc && p.desc.length) ? p.desc : [];
    lines.forEach(function(line){
      descEl.appendChild(el('li', null, line));
    });
    descEl.hidden = !lines.length;

    /* фото: перёд и спина */
    viewsBox.innerHTML = '';
    if (p.photo){
      setView(p.photo, 'Перёд');
      if (p.photo2){
        [['Перёд', p.photo], ['Спина', p.photo2]].forEach(function(v){
          var b = el('button', null, v[0]);
          b.type = 'button';
          b.setAttribute('aria-pressed', String(v[0] === 'Перёд'));
          b.addEventListener('click', function(){ setView(v[1], v[0]); });
          viewsBox.appendChild(b);
        });
      }
    } else {
      img.removeAttribute('src');
      img.alt = 'Фото пока нет';
    }

    /* размеры */
    sizesBox.innerHTML = '';
    var label = el('span', 'mono modal__sizes-label', 'Размер');
    sizesBox.appendChild(label);
    var chips = el('div', 'filters');
    String(p.sizes || '').split('·').forEach(function(sz){
      sz = sz.trim();
      if (!sz || sz === '—') return;
      var b = el('button', null, sz);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function(){
        chosen = (chosen === sz) ? '' : sz;
        Array.prototype.forEach.call(chips.querySelectorAll('button'), function(x){
          x.setAttribute('aria-pressed', String(x.textContent === chosen));
        });
        updateOrder();
      });
      chips.appendChild(b);
    });
    sizesBox.appendChild(chips);

    updateOrder();

    /* размерная сетка этой категории */
    chartBox.innerHTML = '';
    var keys = SIZE_FOR_CAT[p.cat] || [];
    chartBox.hidden = keys.length === 0;      /* сетки нет — блока тоже нет */
    if (keys.length){
      chartBox.appendChild(el('h3', 'modal__chart-title', 'Размерная сетка'));
      keys.forEach(function(key){
        var wrap = el('div', 'tablewrap');
        var t = buildSizeTable(key);
        if (t) { wrap.appendChild(t); chartBox.appendChild(wrap); }
      });
      chartBox.appendChild(el('p', 'note',
        'Замеры по изделию, разложенному на плоскости. Погрешность 1–2 см — норма для трикотажа.'));
    }

    root.hidden = false;
    document.body.classList.add('is-locked');
    root.querySelector('.modal__close').focus();
  }

  function close_(){
    if (!root) return;
    root.hidden = true;
    document.body.classList.remove('is-locked');
  }

  return { open: open, close: close_ };
})();

function openProduct(p){ modal.open(p); }

/* ============================================================
   АФИША. Объявления берутся из js/news.js
   ============================================================ */
function findProduct(id){
  for (var i = 0; i < PRODUCTS.length; i++){
    if (PRODUCTS[i].id === id) return PRODUCTS[i];
  }
  return null;
}

(function(){
  var box = document.getElementById('news');
  if (!box || typeof NEWS === 'undefined' || !NEWS.length){
    if (box) box.hidden = true;
    return;
  }

  NEWS.forEach(function(n){
    var card = document.createElement('article');
    card.className = 'poster';

    /* фото */
    if (n.image){
      var media = document.createElement('div');
      media.className = 'poster__media';
      var im = document.createElement('img');
      im.src = n.image;
      im.alt = n.title;
      im.loading = 'lazy';
      media.appendChild(im);
      card.appendChild(media);
    } else {
      card.classList.add('poster--notext');
    }

    /* текст */
    var body = document.createElement('div');
    body.className = 'poster__body';

    var meta = document.createElement('div');
    meta.className = 'poster__meta';
    if (n.tag){
      var tag = document.createElement('span');
      tag.className = 'poster__tag';
      tag.textContent = n.tag;
      meta.appendChild(tag);
    }
    if (n.date){
      var d = document.createElement('span');
      d.className = 'mono poster__date';
      d.textContent = n.date;
      meta.appendChild(d);
    }
    body.appendChild(meta);

    var h = document.createElement('h3');
    h.className = 'poster__title';
    h.textContent = n.title;
    body.appendChild(h);

    if (n.text){
      var p = document.createElement('p');
      p.className = 'poster__text';
      p.textContent = n.text;
      body.appendChild(p);
    }

    var prod = n.product ? findProduct(n.product) : null;
    if (prod){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn--red poster__btn';
      b.textContent = n.button || 'Смотреть модель';
      b.addEventListener('click', function(){ openProduct(prod); });
      body.appendChild(b);
    }

    card.appendChild(body);
    box.appendChild(card);
  });
})();

/* ============================================================
   «КАК НОСЯТ» — фотографии покупателей из js/gallery.js
   ============================================================ */
(function(){
  var grid = document.getElementById('gallery');
  if (!grid) return;

  var list = (typeof GALLERY !== 'undefined') ? GALLERY : [];

  list.forEach(function(g){
    if (!g.photo) return;
    var fig = document.createElement('figure');
    fig.className = 'shot';

    var img = document.createElement('img');
    img.src = g.photo;
    img.alt = g.author ? 'Фото от ' + g.author : 'Фото покупателя';
    img.loading = 'lazy';
    fig.appendChild(img);

    var cap = document.createElement('figcaption');
    cap.className = 'shot__cap';
    if (g.author){
      var a = document.createElement('span');
      a.className = 'mono shot__author';
      a.textContent = g.author;
      cap.appendChild(a);
    }
    var prod = g.product ? findProduct(g.product) : null;
    if (prod){
      var n = document.createElement('span');
      n.className = 'shot__prod';
      n.textContent = prod.name;
      cap.appendChild(n);
    }
    if (cap.childNodes.length) fig.appendChild(cap);

    fig.addEventListener('click', function(){
      if (prod) openProduct(prod);
      else openShot(g.photo, img.alt);
    });
    grid.appendChild(fig);
  });

  /* Пустая сетка — это рамка вокруг пустоты. Прячем её и пишем строку.
     Кнопка «Прислать фото» живёт в разметке, рядом с подводкой. */
  var empty = document.getElementById('gallery-empty');
  var has = grid.children.length > 0;
  grid.hidden = !has;
  if (empty) empty.hidden = has;

  /* просмотр фото во весь экран */
  function openShot(src, alt){
    var box = document.createElement('div');
    box.className = 'lightbox';
    box.innerHTML = '<div class="lightbox__backdrop"></div>'
      + '<img class="lightbox__img" src="' + src + '" alt="">'
      + '<button type="button" class="lightbox__close" aria-label="Закрыть">'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg></button>';
    box.querySelector('.lightbox__img').alt = alt || '';
    document.body.appendChild(box);
    document.body.classList.add('is-locked');
    function close(){
      box.remove();
      document.body.classList.remove('is-locked');
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e){ if (e.key === 'Escape') close(); }
    box.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
  }
})();

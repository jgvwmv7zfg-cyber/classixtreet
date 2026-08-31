/* ============================================================
   CLASSIXTREET — страница «Прислать фото»
   ------------------------------------------------------------
   ВАЖНО, ЧЕСТНО И ОДИН РАЗ.

   Сайт состоит из файлов и не умеет ничего сохранять. Выбранные
   фотографии живут только в браузере посетителя: он их видит,
   а до нас они сами не доедут. Поэтому кнопка «Отправить»
   открывает Telegram с готовым текстом, а снимки человек
   прикрепляет в чате скрепкой.

   Когда появится сервер — впишите его адрес в UPLOAD_ENDPOINT
   ниже. Страница сама начнёт отправлять файлы туда, и шаг
   с Telegram исчезнет. Больше ничего менять не придётся.
   ============================================================ */

var UPLOAD_ENDPOINT = '';   /* например 'https://ваш-сайт.ру/upload.php' */

var MAX_FILES = 8;
var MAX_SIZE  = 10 * 1024 * 1024;   /* 10 МБ на файл */

(function(){
  var root = document.getElementById('upload');
  if (!root) return;

  var form     = document.getElementById('photo-form');
  var drop     = document.getElementById('drop');
  var input    = document.getElementById('files');
  var previews = document.getElementById('previews');
  var limits   = document.getElementById('limits');
  var errBox   = document.getElementById('photo-error');
  var hintBox  = document.getElementById('photo-hint');
  var fallback = document.getElementById('photo-fallback');
  var fbText   = document.getElementById('photo-fbtext');
  var copyBtn  = document.getElementById('photo-copy');
  var itemSel  = document.getElementById('p-item');

  var chosen = [];   /* {file, url} */

  /* «860 КБ» или «2.4 МБ» */
  function fileSize(bytes){
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' КБ';
    return (Math.round(bytes / 1024 / 102.4) / 10) + ' МБ';
  }

  /* ---------- список вещей ---------- */
  (function fillItems(){
    var first = document.createElement('option');
    first.value = '';
    first.textContent = 'Не выбрано';
    itemSel.appendChild(first);
    PRODUCTS.filter(function(p){ return p.photo; }).forEach(function(p){
      var o = document.createElement('option');
      o.value = p.name;
      o.textContent = p.name;
      itemSel.appendChild(o);
    });
  })();

  /* ---------- выбор файлов ---------- */
  function addFiles(fileList){
    var added = 0, skipped = [];
    Array.prototype.forEach.call(fileList, function(f){
      if (chosen.length >= MAX_FILES) { skipped.push('лимит ' + MAX_FILES); return; }
      if (!/^image\//.test(f.type))   { skipped.push(f.name + ' — не изображение'); return; }
      if (f.size > MAX_SIZE)          { skipped.push(f.name + ' — больше 10 МБ'); return; }
      chosen.push({ file: f, url: URL.createObjectURL(f) });
      added++;
    });
    renderPreviews();
    if (skipped.length){
      errBox.className = 'formerror';
      errBox.textContent = 'Не добавлено: ' + skipped.join(', ');
      errBox.hidden = false;
    } else if (added){
      errBox.hidden = true;
    }
  }

  function renderPreviews(){
    previews.innerHTML = '';
    chosen.forEach(function(item, i){
      var fig = document.createElement('figure');
      fig.className = 'preview';

      var img = document.createElement('img');
      img.src = item.url;
      img.alt = item.file.name;
      fig.appendChild(img);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'preview__del';
      del.setAttribute('aria-label', 'Убрать фото');
      del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>';
      del.addEventListener('click', function(){
        URL.revokeObjectURL(item.url);
        chosen.splice(i, 1);
        renderPreviews();
      });
      fig.appendChild(del);

      var cap = document.createElement('figcaption');
      cap.className = 'mono preview__size';
      cap.textContent = fileSize(item.file.size);
      fig.appendChild(cap);

      previews.appendChild(fig);
    });
    limits.textContent = chosen.length
      ? 'Выбрано ' + chosen.length + ' из ' + MAX_FILES
      : 'До ' + MAX_FILES + ' фотографий, каждая не больше 10 МБ';
  }

  drop.addEventListener('click', function(){ input.click(); });
  drop.addEventListener('keydown', function(e){
    if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); input.click(); }
  });
  input.addEventListener('change', function(){ addFiles(input.files); input.value = ''; });

  ['dragenter','dragover'].forEach(function(ev){
    drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add('is-over'); });
  });
  ['dragleave','drop'].forEach(function(ev){
    drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove('is-over'); });
  });
  drop.addEventListener('drop', function(e){
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  /* ---------- подсказка под кнопкой ---------- */
  hintBox.textContent = UPLOAD_ENDPOINT
    ? 'Фотографии загрузятся прямо здесь'
    : ((typeof TELEGRAM !== 'undefined' && TELEGRAM)
        ? 'Откроется чат — останется прикрепить фото скрепкой'
        : 'Заполнить: ник в Telegram в файле js/products.js');

  /* ---------- текст сообщения ---------- */
  function buildText(){
    var name = form.pname.value.trim();
    var item = itemSel.value;
    var note = form.pnote.value.trim();
    var lines = ['Фото для раздела «Как носят»'];
    lines.push('');
    if (name) lines.push('Подписать как: ' + name);
    if (item) lines.push('Вещь: ' + item);
    if (note) lines.push('Комментарий: ' + note);
    lines.push('Разрешаю публикацию на сайте и в соцсетях бренда.');
    lines.push('');
    lines.push('Фотографий: ' + chosen.length + ' — прикрепляю следующим сообщением.');
    return lines.join('\n');
  }

  /* ---------- отправка ---------- */
  form.addEventListener('submit', function(e){
    e.preventDefault();
    errBox.hidden = true;

    var problems = [];
    if (!chosen.length) problems.push('не выбрано ни одного фото');
    if (!document.getElementById('p-agree').checked) problems.push('нет разрешения на публикацию');

    if (problems.length){
      errBox.className = 'formerror';
      errBox.textContent = 'Не хватает: ' + problems.join(', ');
      errBox.hidden = false;
      return;
    }

    /* режим с сервером */
    if (UPLOAD_ENDPOINT){
      var fd = new FormData();
      chosen.forEach(function(it, i){ fd.append('photo' + (i+1), it.file, it.file.name); });
      fd.append('name', form.pname.value.trim());
      fd.append('item', itemSel.value);
      fd.append('note', form.pnote.value.trim());

      errBox.className = 'formerror';
      errBox.textContent = 'Отправляем…';
      errBox.hidden = false;

      fetch(UPLOAD_ENDPOINT, { method: 'POST', body: fd })
        .then(function(r){ if (!r.ok) throw new Error('bad response'); return r; })
        .then(function(){
          chosen.forEach(function(it){ URL.revokeObjectURL(it.url); });
          chosen = [];
          renderPreviews();
          form.reset();
          errBox.className = 'formerror formerror--ok';
          errBox.textContent = 'Спасибо! Фото получены, опубликуем в ближайшие дни.';
        })
        .catch(function(){
          errBox.className = 'formerror';
          errBox.textContent = 'Не удалось отправить. Попробуйте ещё раз или пришлите в Telegram.';
        });
      return;
    }

    /* режим без сервера — уводим в Telegram */
    var text = buildText();
    if (typeof sendOrder === 'function' && sendOrder(text)){
      errBox.className = 'formerror formerror--ok';
      errBox.textContent = 'Чат открыт — прикрепите фотографии скрепкой и отправьте.';
      errBox.hidden = false;
    } else {
      fbText.value = text;
      fallback.hidden = false;
      fallback.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
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

# -*- coding: utf-8 -*-
"""
============================================================
CLASSIXTREET — бот магазина
------------------------------------------------------------
Что делает:
  1. Показывает покупателю кнопки: каталог, размеры, доставка
  2. Открывает мини-приложение — весь ассортимент внутри Telegram
  3. Принимает оттуда заказы: складывает в bot/orders/ и
     присылает вам готовым сообщением
  4. Принимает фото от покупателей и по вашей команде
     публикует их на сайте в разделе «Как носят»

Публикация фото — только с вашего разрешения. Чужой человек
не может ничего выложить на сайт напрямую.

Что нужно: только Python. Никаких библиотек ставить не надо.
Запуск:  py bot\\bot.py       (Windows)
         python3 bot/bot.py   (Mac, Linux)

Инструкция целиком — в файле bot/README.txt
============================================================
"""

import json
import os
import re
import shutil
import sys
import time
import urllib.parse
import urllib.request

# ============================================================
# НАСТРОЙКИ — заполнить перед первым запуском
# ============================================================

# ------------------------------------------------------------
# ТОКЕН. Это пароль от бота: кто его получит, сможет писать от
# имени бота и читать сообщения покупателей.
#
# В КОДЕ ЕГО БОЛЬШЕ НЕТ — и это главное. Раньше он лежал прямо
# здесь строкой, поэтому папку bot приходилось прятать от гита,
# а из-за этого код бота не попадал на хостинг. Теперь наоборот:
# файлы можно спокойно выкладывать, а токен живёт отдельно.
#
# Берётся из двух мест, в таком порядке:
#   1. переменная окружения BOT_TOKEN — так задаём на хостинге;
#   2. файл bot/token.txt — так удобно на своём компьютере.
#      Этот файл в гит не попадает, он указан в .gitignore.
# ------------------------------------------------------------

def _read_secret(env_name, file_name):
    v = os.environ.get(env_name)
    if v and v.strip():
        return v.strip()
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), file_name)
    try:
        with open(path, encoding='utf-8') as f:
            return f.read().strip()
    except Exception:
        return ''


BOT_TOKEN = _read_secret('BOT_TOKEN', 'token.txt')

# Ваш личный chat id — сюда бот шлёт заявки и заказы.
# Можно задать переменной окружения ADMIN_CHAT_ID.
ADMIN_CHAT_ID = int(os.environ.get('ADMIN_CHAT_ID') or 1429396337)

# Адрес сайта — его бот открывает как мини-приложение.
# Обязательно начинается с https:// — ни http, ни файл с диска
# Telegram не откроет. Пример: 'https://classixtreet.ru/app.html'
#
# Пока пусто — бот работает, но вместо каталога пишет,
# что адрес не заполнен. Ничего не ломается.
WEBAPP_URL = os.environ.get('WEBAPP_URL') or 'https://classixtreet.store/app.html'

# Ссылка на канал — на неё ведёт кнопка «Наш канал».
# Пусто — кнопки не будет.
CHANNEL_URL = ''

# ============================================================

BASE     = os.path.dirname(os.path.abspath(__file__))
SITE     = os.path.dirname(BASE)                  # папка сайта
INBOX    = os.path.join(BASE, 'inbox')            # фото на модерации
ORDERS   = os.path.join(BASE, 'orders')           # заказы
STATE    = os.path.join(BASE, 'state.json')       # очередь заявок
GALLERY  = os.path.join(SITE, 'img', 'gallery')   # опубликованные фото
GALLERY_JS = os.path.join(SITE, 'js', 'gallery.js')
ORDERS_LOG = os.path.join(ORDERS, 'orders.txt')   # вся история одним файлом

API  = 'https://api.telegram.org/bot%s/' % BOT_TOKEN
FILE = 'https://api.telegram.org/file/bot%s/' % BOT_TOKEN

MARKER = '/* НОВЫЕ ФОТО ДОБАВЛЯЮТСЯ СЮДА БОТОМ */'


# ---------- мелкие помощники ----------

def api(method, **params):
    """Вызов метода Telegram. Возвращает result или None."""
    data = urllib.parse.urlencode(
        {k: v for k, v in params.items() if v is not None}
    ).encode('utf-8')
    try:
        with urllib.request.urlopen(API + method, data, timeout=60) as r:
            out = json.loads(r.read().decode('utf-8'))
        return out.get('result') if out.get('ok') else None
    except Exception as e:
        print('  ! ошибка запроса %s: %s' % (method, e))
        return None


def say(chat_id, text, markup=None):
    """Отправить сообщение. markup — готовая клавиатура (см. ниже)."""
    api('sendMessage', chat_id=chat_id, text=text, reply_markup=markup)


def load_state():
    if os.path.exists(STATE):
        try:
            with open(STATE, encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {'offset': 0, 'seq': 0, 'queue': {}}


def save_state(st):
    with open(STATE, 'w', encoding='utf-8') as f:
        json.dump(st, f, ensure_ascii=False, indent=2)


def js_escape(s):
    return (s or '').replace('\\', '\\\\').replace("'", "\\'").replace('\n', ' ')


def money(v):
    """9900 -> «9 900 ₽». Как formatPrice на сайте."""
    try:
        n = int(v)
    except (TypeError, ValueError):
        return '— ₽'
    s = '{:,}'.format(n).replace(',', ' ')
    return s + ' ₽'


# ============================================================
# КНОПКИ
# ------------------------------------------------------------
# Telegram принимает клавиатуру строкой JSON, поэтому здесь
# просто собираем нужную структуру и переводим её в текст.
# ============================================================

def kb_inline(rows):
    """Кнопки под сообщением."""
    return json.dumps({'inline_keyboard': rows}, ensure_ascii=False)


def kb_reply(rows):
    """Кнопки внизу, вместо клавиатуры. Остаются на месте."""
    return json.dumps({
        'keyboard': rows,
        'resize_keyboard': True,
        'is_persistent': True
    }, ensure_ascii=False)


def webapp_ready():
    return bool(WEBAPP_URL) and WEBAPP_URL.startswith('https://')


# Подписи кнопок внизу. Бот отвечает на них так же, как на команды,
# поэтому подписи и разбор сообщений должны совпадать — держим их
# в одном месте.
BTN_SHOP    = '🛍 Каталог'
BTN_SIZES   = '📏 Размеры'
BTN_DELIV   = '🚚 Доставка'
BTN_PHOTO   = '📷 Прислать фото'
BTN_WRITE   = '✍️ Задать вопрос'


def main_keyboard():
    """Постоянная клавиатура покупателя.

    ВАЖНО: заказ из мини-приложения доходит до бота только если
    приложение запущено кнопкой ИМЕННО с этой клавиатуры.
    Открытое из меню у поля ввода — только для просмотра.
    Так устроен Telegram, обойти нельзя.
    """
    if webapp_ready():
        first = [{'text': BTN_SHOP, 'web_app': {'url': WEBAPP_URL}}]
    else:
        first = [{'text': BTN_SHOP}]
    return kb_reply([
        first,
        [{'text': BTN_SIZES}, {'text': BTN_DELIV}],
        [{'text': BTN_PHOTO}, {'text': BTN_WRITE}],
    ])


def start_inline():
    """Кнопки под приветственным сообщением."""
    rows = []
    if webapp_ready():
        rows.append([{'text': '🛍 Открыть каталог', 'web_app': {'url': WEBAPP_URL}}])
    rows.append([
        {'text': '📏 Размеры',     'callback_data': 'sizes'},
        {'text': '🚚 Доставка',    'callback_data': 'delivery'},
    ])
    rows.append([{'text': '📷 Прислать своё фото', 'callback_data': 'photo'}])
    if CHANNEL_URL:
        rows.append([{'text': '📣 Наш канал', 'url': CHANNEL_URL}])
    return kb_inline(rows)


# ---------- готовые ответы ----------

TXT_SIZES = (
    'РАЗМЕРЫ\n\n'
    'Размер удобнее выбирать в каталоге: у каждой вещи своя таблица '
    'с замерами по изделию.\n\n'
    'Коротко:\n'
    '• футболки, худи, зип-худи — замеры по изделию, разложенному на плоскости;\n'
    '• костюмы — размер по росту, L рассчитан на 188–194;\n'
    '• штаны — пояс резинка, обхват указан в спокойном состоянии.\n\n'
    'Погрешность 1–2 см для трикотажа — норма.\n'
    'Между двумя размерами — напишите рост и обычный размер футболки, подскажем.'
)

TXT_DELIVERY = (
    'ДОСТАВКА И ОПЛАТА\n\n'
    'Отправляем по всей России: СДЭК, Почта России, Boxberry.\n'
    'По Челябинску — самовывоз, договоримся о встрече.\n\n'
    'Как проходит заказ:\n'
    '1. Вы собираете заказ в каталоге и отправляете его нам.\n'
    '2. Мы подтверждаем наличие и считаем доставку.\n'
    '3. Присылаем реквизиты, после оплаты отправляем — трек-номер в этот же чат.\n\n'
    'Отвечаем в течение дня.'
)

TXT_PHOTO = (
    'ВАШИ ФОТО\n\n'
    'Пришлите снимок в наших вещах прямо сюда — опубликуем на сайте '
    'в разделе «Как носят».\n\n'
    'В подписи к фото напишите, как вас подписать. '
    'Отмечать бренд не обязательно, но приятно.'
)

TXT_WRITE = (
    'Напишите вопрос прямо сюда — ответим в течение дня.\n\n'
    'Если вопрос про размер, укажите рост и обычный размер футболки: '
    'так подскажем точнее.'
)

TXT_NO_WEBAPP = (
    'Каталог пока не подключён.\n\n'
    'Что сделать: вписать адрес сайта в файл bot/bot.py, '
    'настройка WEBAPP_URL (нужен адрес на https://), и перезапустить бота.\n\n'
    'Подробнее — в bot/README.txt.'
)


# ---------- работа с файлами ----------

def download_photo(file_id, dest_path):
    info = api('getFile', file_id=file_id)
    if not info or 'file_path' not in info:
        return False
    try:
        urllib.request.urlretrieve(FILE + info['file_path'], dest_path)
        return True
    except Exception as e:
        print('  ! не скачалось: %s' % e)
        return False


def publish(entry):
    """Переносит фото в img/gallery/ и дописывает строку в gallery.js"""
    os.makedirs(GALLERY, exist_ok=True)
    src = os.path.join(INBOX, entry['file'])
    if not os.path.exists(src):
        return False, 'файла уже нет в inbox'

    dst_name = entry['file']
    dst = os.path.join(GALLERY, dst_name)
    n = 1
    while os.path.exists(dst):
        stem, ext = os.path.splitext(entry['file'])
        dst_name = '%s-%d%s' % (stem, n, ext)
        dst = os.path.join(GALLERY, dst_name)
        n += 1
    shutil.move(src, dst)

    line = "{ photo: 'img/gallery/%s', author: '%s'%s },\n" % (
        dst_name,
        js_escape(entry.get('author') or ''),
        (", product: '%s'" % js_escape(entry['product'])) if entry.get('product') else ''
    )

    try:
        with open(GALLERY_JS, encoding='utf-8') as f:
            src_js = f.read()
    except Exception as e:
        return False, 'не читается gallery.js: %s' % e

    if MARKER in src_js:
        src_js = src_js.replace(MARKER, line + '  ' + MARKER, 1)
    else:
        # запасной вариант: вставляем перед закрывающей скобкой массива
        i = src_js.rstrip().rfind('];')
        if i == -1:
            return False, 'не нашёл, куда вставить строку в gallery.js'
        src_js = src_js[:i] + line + src_js[i:]

    with open(GALLERY_JS, 'w', encoding='utf-8') as f:
        f.write(src_js)
    return True, dst_name


# ============================================================
# ЗАКАЗЫ ИЗ МИНИ-ПРИЛОЖЕНИЯ
# ------------------------------------------------------------
# Приложение отправляет заказ одним сообщением с полем
# web_app_data. Подделать отправителя нельзя: Telegram
# доставляет такое сообщение только из личного чата самого
# покупателя. База не нужна — заказы лежат файлами.
# ============================================================

def order_number():
    return 'CXT-' + time.strftime('%y%m%d-%H%M')


def safe_name(s):
    """Оставляем только то, что годится для имени файла."""
    return re.sub(r'[^A-Za-z0-9_-]', '', str(s or ''))[:40] or 'order'


def order_text(order, user_line):
    """Читаемый заказ. Формат тот же, что у заказов с сайта."""
    lines = ['ЗАКАЗ ' + str(order.get('no') or '—'), '']

    items = order.get('items') or []
    for i, it in enumerate(items, 1):
        parts = [str(it.get('name') or it.get('id') or 'позиция')]
        if it.get('color'):
            parts.append(str(it['color']))
        if it.get('size'):
            parts.append('размер ' + str(it['size']))
        row = '%d. %s' % (i, ', '.join(parts))

        qty = it.get('qty') or 1
        if qty and int(qty) > 1:
            row += ' × %s' % qty
        price = it.get('price')
        if price:
            row += ' — ' + money(int(price) * int(qty or 1))
        # id пригодится, чтобы найти вещь в js/products.js
        if it.get('id'):
            row += '\n   код: %s' % it['id']
        lines.append(row)

    if not items:
        lines.append('(позиции не пришли)')

    lines.append('')

    # Сумму пересчитываем сами по позициям. Присланный итог берём
    # только для сверки: если он не сходится, лучше увидеть оба
    # числа сразу, чем отправить товар не за те деньги.
    counted = 0
    for it in items:
        try:
            counted += int(it.get('price') or 0) * int(it.get('qty') or 1)
        except (TypeError, ValueError):
            pass
    lines.append('Итого: ' + money(counted))
    try:
        told = int(order.get('total'))
    except (TypeError, ValueError):
        told = None
    if told is not None and told != counted:
        lines.append('⚠️ приложение посчитало %s — проверьте заказ' % money(told))
    lines.append('')

    f = order.get('form') or {}
    fio = ' '.join([x for x in [f.get('firstname'), f.get('lastname')] if x])
    if fio:              lines.append('Покупатель: ' + fio)
    if f.get('phone'):   lines.append('Телефон: ' + str(f['phone']))
    if f.get('contact'): lines.append('Связь: ' + str(f['contact']))
    if f.get('city'):    lines.append('Город: ' + str(f['city']))
    if f.get('delivery'):lines.append('Доставка: ' + str(f['delivery']))
    if f.get('address'): lines.append('Адрес / пункт выдачи: ' + str(f['address']))
    if f.get('note'):    lines.append('Комментарий: ' + str(f['note']))

    lines.append('')
    lines.append(user_line)
    return '\n'.join(lines)


def save_order(no, payload):
    """Кладёт заказ в bot/orders/ и дописывает строку в общий список."""
    os.makedirs(ORDERS, exist_ok=True)

    path = os.path.join(ORDERS, safe_name(no) + '.json')
    n = 1
    while os.path.exists(path):
        path = os.path.join(ORDERS, '%s-%d.json' % (safe_name(no), n))
        n += 1
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('  ! заказ не записался в файл: %s' % e)
        return None
    return path


def append_log(text):
    """Вся история заказов одним файлом — чтобы не разбирать папку."""
    os.makedirs(ORDERS, exist_ok=True)
    try:
        with open(ORDERS_LOG, 'a', encoding='utf-8') as f:
            f.write('=' * 60 + '\n')
            f.write(time.strftime('%Y-%m-%d %H:%M') + '\n')
            f.write(text + '\n\n')
    except Exception as e:
        print('  ! не дописалось в orders.txt: %s' % e)


def take_order(msg, st):
    chat_id = msg['chat']['id']
    user    = msg.get('from', {})
    uname   = ('@' + user['username']) if user.get('username') else \
              (user.get('first_name') or 'без ника')
    raw     = msg['web_app_data'].get('data') or ''

    try:
        order = json.loads(raw)
        if not isinstance(order, dict):
            raise ValueError('это не заказ')
    except Exception as e:
        # Ничего не теряем: сохраняем как есть и сообщаем вам.
        no = order_number()
        save_order(no + '-broken', {'raw': raw, 'from': uname, 'chat_id': chat_id})
        print('  ! нечитаемый заказ от %s: %s' % (uname, e))
        say(chat_id, 'Заказ не прочитался. Напишите нам сообщением — оформим вручную.')
        if ADMIN_CHAT_ID:
            say(ADMIN_CHAT_ID, 'Пришёл нечитаемый заказ от %s.\n'
                               'Сохранён в bot/orders/%s-broken.json' % (uname, no))
        return

    no = str(order.get('no') or '').strip() or order_number()

    payload = dict(order)
    payload['no'] = no
    payload['from'] = uname
    payload['chat_id'] = chat_id
    payload['user_id'] = user.get('id')
    payload['received'] = time.strftime('%Y-%m-%d %H:%M')

    saved = save_order(no, payload)

    user_line = 'Из Telegram: %s (id %s)' % (uname, user.get('id') or '—')
    text = order_text(order, user_line)
    append_log(text)

    print('  + заказ %s от %s' % (no, uname))

    # покупателю — подтверждение
    say(chat_id,
        'Заказ %s принят.\n\n'
        'Проверим наличие, посчитаем доставку и напишем сюда — обычно в течение дня.'
        % no,
        main_keyboard())

    # вам — сам заказ с кнопками
    if ADMIN_CHAT_ID:
        rows = []
        if user.get('id'):
            rows.append([{'text': '✍️ Написать покупателю',
                          'url': 'tg://user?id=%s' % user['id']}])
        rows.append([
            {'text': '✅ Принят',  'callback_data': 'ord|ok|%s' % safe_name(no)},
            {'text': '✖️ Отменён', 'callback_data': 'ord|no|%s' % safe_name(no)},
        ])
        tail = ''
        if saved:
            tail = '\n\nФайл: bot/orders/%s' % os.path.basename(saved)
        api('sendMessage', chat_id=ADMIN_CHAT_ID,
            text='🛍 НОВЫЙ ЗАКАЗ\n\n' + text + tail,
            reply_markup=kb_inline(rows))


# ---------- обработка сообщений ----------

def handle(msg, st):
    chat_id = msg['chat']['id']
    user    = msg.get('from', {})
    uname   = ('@' + user['username']) if user.get('username') else \
              (user.get('first_name') or 'без ника')
    text    = (msg.get('text') or '').strip()

    is_admin = ADMIN_CHAT_ID and chat_id == ADMIN_CHAT_ID

    # --- заказ из мини-приложения ---
    if msg.get('web_app_data'):
        take_order(msg, st)
        return

    # --- команды ---
    if text.startswith('/start'):
        hello = ('CLASSIXTREET\n'
                 'Классика в сердце. Улица в крови.\n\n'
                 'Нажмите «%s» — откроется весь ассортимент: '
                 'фото со всех сторон, составы, размеры. '
                 'Заказ соберёте там же.' % BTN_SHOP)
        if not webapp_ready():
            hello = ('CLASSIXTREET\n\n'
                     'Пришлите фото в наших вещах — опубликуем на сайте '
                     'в разделе «Как носят». В подписи можно указать, '
                     'как вас подписать.\n\n'
                     'Ваш chat id: %d' % chat_id)
        say(chat_id, hello, main_keyboard())
        if webapp_ready():
            say(chat_id, 'Что вас интересует?', start_inline())
        print('  chat id пользователя %s: %d' % (uname, chat_id))
        return

    if text.startswith('/help'):
        say(chat_id,
            'Кнопки внизу:\n\n'
            '%s — весь ассортимент и заказ\n'
            '%s — как выбрать размер\n'
            '%s — сроки, службы, оплата\n'
            '%s — прислать своё фото для сайта\n'
            '%s — любой вопрос\n\n'
            'Если кнопок не видно — отправьте /start.'
            % (BTN_SHOP, BTN_SIZES, BTN_DELIV, BTN_PHOTO, BTN_WRITE),
            main_keyboard())
        return

    if text.startswith('/menu') or text.startswith('/shop') or text.startswith('/catalog'):
        if webapp_ready():
            say(chat_id, 'Каталог открывается кнопкой «%s» внизу.' % BTN_SHOP,
                main_keyboard())
        else:
            say(chat_id, TXT_NO_WEBAPP)
        return

    # --- нажатия кнопок внизу (это обычные текстовые сообщения) ---
    if text == BTN_SHOP:
        if webapp_ready():
            # Кнопка сама открывает приложение. Сюда попадаем, только
            # если её нажали, когда адрес ещё не был вписан.
            say(chat_id, 'Нажмите кнопку «%s» ещё раз — каталог откроется '
                         'прямо здесь.' % BTN_SHOP, main_keyboard())
        else:
            say(chat_id, TXT_NO_WEBAPP)
        return

    if text == BTN_SIZES:
        say(chat_id, TXT_SIZES, main_keyboard())
        return

    if text == BTN_DELIV:
        say(chat_id, TXT_DELIVERY, main_keyboard())
        return

    if text == BTN_PHOTO:
        say(chat_id, TXT_PHOTO, main_keyboard())
        return

    if text == BTN_WRITE:
        say(chat_id, TXT_WRITE, main_keyboard())
        return

    # --- админские команды ---
    if is_admin and text.startswith('/queue'):
        q = st['queue']
        if not q:
            say(chat_id, 'Очередь пуста.')
        else:
            lines = ['В очереди %d:' % len(q)]
            for k, e in sorted(q.items(), key=lambda x: int(x[0])):
                lines.append('#%s — %s — %s' % (k, e['from'], e['file']))
            lines.append('\n/ok <номер> — опубликовать\n/no <номер> — отклонить')
            say(chat_id, '\n'.join(lines))
        return

    if is_admin and text.startswith('/orders'):
        try:
            files = sorted(f for f in os.listdir(ORDERS) if f.endswith('.json'))
        except OSError:
            files = []
        if not files:
            say(chat_id, 'Заказов пока нет.')
        else:
            last = files[-10:]
            say(chat_id, 'Всего заказов: %d. Последние:\n\n%s\n\n'
                         'Все они лежат в папке bot/orders/, '
                         'вся история одним файлом — bot/orders/orders.txt'
                         % (len(files), '\n'.join(last)))
        return

    if is_admin and text.startswith('/broadcast'):
        # Рассылка всем пользователям (кроме владельца)
        msg_text = text[len('/broadcast'):].strip()
        if not msg_text:
            say(chat_id, 'Использование: /broadcast <текст сообщения>\n\n'
                         'Сообщение будет отправлено всем пользователям бота, кроме вас.')
            return

        # Собираем chat_id из заказов и заявок на фото
        recipients = set()

        # Из заказов
        try:
            for fname in os.listdir(ORDERS):
                if fname.endswith('.json'):
                    try:
                        with open(os.path.join(ORDERS, fname), encoding='utf-8') as f:
                            order = json.load(f)
                            if order.get('chat_id') and order['chat_id'] != ADMIN_CHAT_ID:
                                recipients.add(order['chat_id'])
                    except Exception:
                        pass
        except OSError:
            pass

        # Из очереди фото
        for entry in st['queue'].values():
            if entry.get('chat_id') and entry['chat_id'] != ADMIN_CHAT_ID:
                recipients.add(entry['chat_id'])

        if not recipients:
            say(chat_id, 'Нет пользователей для рассылки.\n\n'
                         'Пользователи появятся после первого заказа или фото.')
            return

        # Отправляем
        sent = 0
        failed = 0
        for recipient_id in recipients:
            result = api('sendMessage', chat_id=recipient_id, text=msg_text)
            if result:
                sent += 1
            else:
                failed += 1
            time.sleep(0.05)  # Небольшая задержка между отправками

        say(chat_id, 'Рассылка завершена.\n\n'
                     'Отправлено: %d\n'
                     'Не доставлено: %d (пользователь заблокировал бота или удалил аккаунт)'
                     % (sent, failed))
        return

    if is_admin and (text.startswith('/ok') or text.startswith('/no')):
        parts = text.split()
        if len(parts) < 2:
            say(chat_id, 'Укажите номер: /ok 3')
            return
        key = parts[1].lstrip('#')
        entry = st['queue'].get(key)
        if not entry:
            say(chat_id, 'Заявки #%s нет в очереди.' % key)
            return

        if text.startswith('/no'):
            try:
                os.remove(os.path.join(INBOX, entry['file']))
            except OSError:
                pass
            del st['queue'][key]
            save_state(st)
            say(chat_id, 'Заявка #%s отклонена, файл удалён.' % key)
            return

        # /ok — при желании можно дописать ник: /ok 3 @nickname
        if len(parts) > 2:
            entry['author'] = ' '.join(parts[2:])
        ok, res = publish(entry)
        if ok:
            del st['queue'][key]
            save_state(st)
            say(chat_id, 'Опубликовано: %s\nСтрока добавлена в gallery.js — '
                         'обновите страницу сайта.' % res)
            if entry.get('chat_id'):
                say(entry['chat_id'], 'Ваше фото опубликовано на сайте, спасибо!')
        else:
            say(chat_id, 'Не получилось: %s' % res)
        return

    # --- фотография ---
    photo = None
    if msg.get('photo'):
        photo = msg['photo'][-1]['file_id']          # самый большой размер
    elif msg.get('document', {}).get('mime_type', '').startswith('image/'):
        photo = msg['document']['file_id']

    if photo:
        os.makedirs(INBOX, exist_ok=True)
        st['seq'] += 1
        key = str(st['seq'])
        fname = 'usr-%s-%s.jpg' % (time.strftime('%y%m%d'), key)
        if not download_photo(photo, os.path.join(INBOX, fname)):
            say(chat_id, 'Не удалось получить фото, попробуйте ещё раз.')
            return

        caption = (msg.get('caption') or '').strip()
        st['queue'][key] = {
            'file': fname,
            'from': uname,
            'chat_id': chat_id,
            'author': caption or uname,
            'product': '',
            'date': time.strftime('%Y-%m-%d %H:%M')
        }
        save_state(st)

        say(chat_id, 'Фото получил, спасибо! Посмотрим и опубликуем — '
                     'обычно в течение пары дней.', main_keyboard())
        print('  + заявка #%s от %s (%s)' % (key, uname, fname))

        if ADMIN_CHAT_ID:
            api('sendPhoto', chat_id=ADMIN_CHAT_ID, photo=photo,
                caption='Заявка #%s\nОт: %s\nПодпись: %s'
                        % (key, uname, caption or '—'),
                reply_markup=kb_inline([[
                    {'text': '✅ Опубликовать', 'callback_data': 'ph|ok|%s' % key},
                    {'text': '✖️ Отклонить',    'callback_data': 'ph|no|%s' % key},
                ]]))
        return

    # --- всё остальное: обычный вопрос ---
    if text:
        say(chat_id, 'Сообщение получил — ответим в течение дня.\n\n'
                     'Пока можете посмотреть каталог или размеры кнопками внизу.',
            main_keyboard())
        if ADMIN_CHAT_ID and not is_admin:
            rows = []
            if user.get('id'):
                rows.append([{'text': '✍️ Ответить',
                              'url': 'tg://user?id=%s' % user['id']}])
            api('sendMessage', chat_id=ADMIN_CHAT_ID,
                text='💬 Вопрос от %s:\n\n%s' % (uname, text),
                reply_markup=kb_inline(rows) if rows else None)


# ---------- нажатия кнопок под сообщениями ----------

def handle_callback(cq, st):
    """Инлайн-кнопки. Ответить нужно обязательно, иначе у человека
    крутится часик на кнопке."""
    cq_id   = cq['id']
    data    = cq.get('data') or ''
    msg     = cq.get('message') or {}
    chat_id = (msg.get('chat') or {}).get('id')
    from_id = (cq.get('from') or {}).get('id')
    is_admin = ADMIN_CHAT_ID and from_id == ADMIN_CHAT_ID

    def done(note=''):
        api('answerCallbackQuery', callback_query_id=cq_id, text=note or None)

    # --- покупателю ---
    if data == 'sizes':
        done()
        say(chat_id, TXT_SIZES, main_keyboard())
        return
    if data == 'delivery':
        done()
        say(chat_id, TXT_DELIVERY, main_keyboard())
        return
    if data == 'photo':
        done()
        say(chat_id, TXT_PHOTO, main_keyboard())
        return

    # --- вам: решение по фото ---
    if data.startswith('ph|'):
        if not is_admin:
            done('Эта кнопка только для владельца')
            return
        _, action, key = (data.split('|') + ['', ''])[:3]
        entry = st['queue'].get(key)
        if not entry:
            done('Заявки #%s больше нет' % key)
            return

        if action == 'no':
            try:
                os.remove(os.path.join(INBOX, entry['file']))
            except OSError:
                pass
            del st['queue'][key]
            save_state(st)
            done('Отклонено, файл удалён')
            say(chat_id, 'Заявка #%s отклонена.' % key)
            return

        ok, res = publish(entry)
        if ok:
            del st['queue'][key]
            save_state(st)
            done('Опубликовано')
            say(chat_id, 'Опубликовано: %s\nСтрока добавлена в gallery.js — '
                         'обновите страницу сайта.' % res)
            if entry.get('chat_id'):
                say(entry['chat_id'], 'Ваше фото опубликовано на сайте, спасибо!')
        else:
            done('Не получилось')
            say(chat_id, 'Не получилось: %s' % res)
        return

    # --- вам: отметка по заказу ---
    if data.startswith('ord|'):
        if not is_admin:
            done('Эта кнопка только для владельца')
            return
        _, action, no = (data.split('|') + ['', ''])[:3]
        mark = 'принят' if action == 'ok' else 'отменён'
        append_log('Заказ %s — отметка: %s' % (no, mark))
        done('Заказ %s' % mark)
        say(chat_id, 'Заказ %s отмечен как «%s». Запись добавлена в orders.txt.'
                     % (no, mark))
        return

    done()


# ---------- запуск ----------

def setup_menu_button():
    """Кнопка каталога у поля ввода. Из неё приложение открывается
    для просмотра; заказы уходят только с кнопки на клавиатуре."""
    if webapp_ready():
        api('setChatMenuButton', menu_button=json.dumps({
            'type': 'web_app',
            'text': 'Каталог',
            'web_app': {'url': WEBAPP_URL}
        }, ensure_ascii=False))
    else:
        api('setChatMenuButton', menu_button=json.dumps({'type': 'commands'}))


def setup_commands():
    api('setMyCommands', commands=json.dumps([
        {'command': 'start', 'description': 'Каталог и кнопки'},
        {'command': 'help',  'description': 'Что умеет бот'},
    ], ensure_ascii=False))


def main():
    if not BOT_TOKEN:
        print('Не заполнен BOT_TOKEN в начале файла bot/bot.py.')
        print('Получите его у @BotFather в Telegram и впишите сюда.')
        sys.exit(1)

    me = api('getMe')
    if not me:
        print('Токен не подошёл — проверьте, что скопировали его целиком.')
        sys.exit(1)

    st = load_state()
    os.makedirs(INBOX, exist_ok=True)
    os.makedirs(ORDERS, exist_ok=True)

    setup_commands()
    setup_menu_button()

    print('Бот @%s запущен. Остановить — Ctrl+C.' % me.get('username', '?'))

    if not ADMIN_CHAT_ID:
        print('ADMIN_CHAT_ID не заполнен: напишите боту /start,')
        print('он ответит вашим chat id — впишите его в настройки и перезапустите.')

    if not WEBAPP_URL:
        print('WEBAPP_URL не заполнен: кнопка каталога работать не будет.')
        print('Впишите адрес сайта вида https://ваш-домен/app.html — см. bot/README.txt.')
    elif not WEBAPP_URL.startswith('https://'):
        print('WEBAPP_URL должен начинаться с https:// — Telegram другие адреса не откроет.')
        print('Сейчас там: %s' % WEBAPP_URL)
    else:
        print('Каталог: %s' % WEBAPP_URL)

    while True:
        updates = api('getUpdates', offset=st['offset'], timeout=30,
                      allowed_updates=json.dumps(['message', 'callback_query']))
        if updates is None:
            time.sleep(3)
            continue
        for u in updates:
            st['offset'] = u['update_id'] + 1
            msg = u.get('message') or u.get('channel_post')
            cq  = u.get('callback_query')
            try:
                if msg:
                    handle(msg, st)
                elif cq:
                    handle_callback(cq, st)
            except Exception as e:
                print('  ! сбой при обработке: %s' % e)
            save_state(st)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nБот остановлен.')

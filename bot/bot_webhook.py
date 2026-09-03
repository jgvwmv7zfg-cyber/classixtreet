# -*- coding: utf-8 -*-
"""
============================================================
CLASSIXTREET — бот на вебхуках (для Render и любого хостинга)
------------------------------------------------------------
Здесь только транспорт: принять запрос и передать дальше.
Вся логика — заказы, фото, кнопки, ответы — лежит в bot.py.

Так сделано намеренно. Раньше это был отдельный, урезанный
бот со своей копией логики, и копии разошлись: он не понимал
заказы из мини-приложения (Telegram шлёт их как web_app_data)
и отвечал на них «используйте кнопки ниже». Заказ пропадал.
Теперь версия одна.

Два входа:
  POST /           — обновления от Telegram
  POST /api/order  — заказ с сайта, обычным запросом из браузера
  GET  /           — проверка, что сервер жив

Запуск локально:  py bot\\bot_webhook.py
На Render: команда запуска  python bot/bot_webhook.py
============================================================
"""

import json
import os
import time
import hashlib
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

import bot   # вся логика бота

# ============================================================
# НАСТРОЙКИ
# ============================================================

# Токен можно не держать в коде: если на хостинге задать
# переменную окружения BOT_TOKEN, возьмётся она. Это надёжнее —
# файл с токеном тогда никуда не уезжает.
if os.environ.get('BOT_TOKEN'):
    bot.BOT_TOKEN = os.environ['BOT_TOKEN'].strip()
    bot.API  = 'https://api.telegram.org/bot%s/' % bot.BOT_TOKEN
    bot.FILE = 'https://api.telegram.org/file/bot%s/' % bot.BOT_TOKEN
if os.environ.get('ADMIN_CHAT_ID'):
    bot.ADMIN_CHAT_ID = int(os.environ['ADMIN_CHAT_ID'])

# Откуда разрешено принимать заказы. Звёздочку не ставим:
# иначе заявки к вам сможет слать кто угодно с любого сайта.
ALLOWED_ORIGINS = [
    'https://classixtreet.store',
    'https://www.classixtreet.store',
    'https://jgvwmv7zfg-cyber.github.io',
    # для проверки с компьютера через Live Server в VS Code
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    # страница, открытая двойным щелчком по файлу (file://), шлёт
    # именно такую строку. Нужно, чтобы вы могли проверять сайт
    # прямо с рабочего стола, не поднимая сервер.
    'null',
]

# Адрес сервера. Render подставляет его сам.
WEBHOOK_URL = os.environ.get('RENDER_EXTERNAL_URL', '')

# Пароль вебхука: Telegram будет присылать его в заголовке.
# Без него любой, кто узнает адрес, сможет прислать боту
# поддельное обновление.
SECRET = hashlib.sha256(('cxt:' + bot.BOT_TOKEN).encode()).hexdigest()[:32]


# ============================================================
# ЗАКАЗ С САЙТА
# ============================================================

def take_web_order(data, ip):
    """Заказ из браузера. Кладём так же, как заказ из Telegram."""
    if not isinstance(data, dict):
        raise ValueError('это не заказ')

    items = data.get('items') or []
    if not items:
        raise ValueError('пустая корзина')

    no = str(data.get('no') or '').strip() or bot.order_number()

    payload = dict(data)
    payload['no'] = no
    payload['from'] = 'сайт'
    payload['ip'] = ip
    payload['received'] = time.strftime('%Y-%m-%d %H:%M')

    saved = bot.save_order(no, payload)
    text = bot.order_text(data, 'Пришло с сайта (не из Telegram)')
    bot.append_log(text)

    if bot.ADMIN_CHAT_ID:
        # Кнопки те же, что у заказов из мини-приложения. Кнопки
        # «написать покупателю» здесь нет: человек заказал из
        # браузера, его telegram-id мы не знаем. Связь — из формы.
        rows = [[
            {'text': '✅ Принят',  'callback_data': 'ord|ok|%s' % bot.safe_name(no)},
            {'text': '✖️ Отменён', 'callback_data': 'ord|no|%s' % bot.safe_name(no)},
        ]]
        tail = '\n\nФайл: bot/orders/%s' % os.path.basename(saved) if saved else ''
        bot.api('sendMessage', chat_id=bot.ADMIN_CHAT_ID,
                text='🛍 НОВЫЙ ЗАКАЗ С САЙТА\n\n' + text + tail,
                reply_markup=bot.kb_inline(rows))

    print('  + заказ с сайта %s' % no)
    return no


# ============================================================
# HTTP
# ============================================================

class Handler(BaseHTTPRequestHandler):

    def _cors(self):
        origin = self.headers.get('Origin', '')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.end_headers()
        self.wfile.write('CLASSIXTREET бот работает'.encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '86400')
        self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > 2 * 1024 * 1024:
            self._json(400, {'ok': False, 'error': 'bad length'})
            return
        body = self.rfile.read(length)

        # ---------- заказ с сайта ----------
        if path == '/api/order':
            origin = self.headers.get('Origin', '')
            if origin and origin not in ALLOWED_ORIGINS:
                print('  ! заказ с чужого адреса: %s' % origin)
                self._json(403, {'ok': False, 'error': 'origin'})
                return
            try:
                data = json.loads(body.decode('utf-8'))
                no = take_web_order(data, self.client_address[0])
            except Exception as e:
                print('  ! заказ с сайта не принят: %s' % e)
                self._json(400, {'ok': False, 'error': str(e)})
                return
            self._json(200, {'ok': True, 'no': no})
            return

        # ---------- обновление от Telegram ----------
        if self.headers.get('X-Telegram-Bot-Api-Secret-Token') != SECRET:
            print('  ! обновление без пароля — отброшено')
            self._json(403, {'ok': False})
            return

        try:
            update = json.loads(body.decode('utf-8'))
        except Exception as e:
            print('  ! нечитаемое обновление: %s' % e)
            self._json(200, {'ok': True})
            return

        st = bot.load_state()
        msg = update.get('message') or update.get('channel_post')
        cq  = update.get('callback_query')
        try:
            if msg:
                bot.handle(msg, st)
            elif cq:
                bot.handle_callback(cq, st)
        except Exception as e:
            print('  ! сбой при обработке: %s' % e)
        bot.save_state(st)

        self._json(200, {'ok': True})

    def log_message(self, *args):
        pass


def setup():
    if not WEBHOOK_URL:
        print('RENDER_EXTERNAL_URL не задан — вебхук не ставлю.')
        print('Локально это нормально: Telegram сюда не достучится,')
        print('но /api/order с сайта работать будет.')
        return
    url = WEBHOOK_URL.rstrip('/') + '/'
    ok = bot.api('setWebhook', url=url, secret_token=SECRET,
                 allowed_updates=json.dumps(['message', 'callback_query']),
                 drop_pending_updates='false')
    print(('вебхук поставлен: ' + url) if ok else 'вебхук поставить не удалось')
    bot.setup_menu_button()
    bot.setup_commands()


if __name__ == '__main__':
    print('CLASSIXTREET — бот на вебхуках')
    me = bot.api('getMe')
    print(('бот @%s' % me.get('username')) if me else 'токен не подошёл')
    setup()
    port = int(os.environ.get('PORT', 10000))
    print('слушаю порт %d' % port)
    try:
        HTTPServer(('0.0.0.0', port), Handler).serve_forever()
    except KeyboardInterrupt:
        print('\nостановлен')

release: pipenv run upgrade
# Tanda 7F — worker gthread con muchos threads: cada cliente Socket.IO
# (long-polling o WebSocket via simple-websocket) ocupa un thread
# mientras está conectado; con el worker sync de antes (1 thread) un
# solo cliente bloquearía toda la API. -w 1 porque Socket.IO en modo
# threading no comparte estado entre procesos.
web: gunicorn -k gthread --threads 100 -w 1 wsgi --chdir ./src/

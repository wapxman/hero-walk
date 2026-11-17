#!/bin/bash
# Сторож игрового сервера Duel Arena на хостинге: cron запускает его каждую минуту,
# он поднимает сервер, если тот не работает. Сервер: ~/game/server/server.js, порт 30777, wss.
G="$HOME/game"
NODE=/opt/alt/alt-nodejs22/root/usr/bin/node
PID="$G/server.pid"
if [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; then exit 0; fi
# журнал не даём разрастись
if [ -f "$G/server.log" ] && [ "$(stat -c %s "$G/server.log")" -gt 5000000 ]; then mv -f "$G/server.log" "$G/server.log.1"; fi
cd "$G/server" || exit 1
TLS_CERT="$G/cert/fullchain.pem" TLS_KEY="$G/cert/key.pem" nohup "$NODE" --max-old-space-size=192 server.js 30777 >> "$G/server.log" 2>&1 &
echo $! > "$PID"
echo "$(date '+%F %T') запущен, pid $!" >> "$G/server.log"

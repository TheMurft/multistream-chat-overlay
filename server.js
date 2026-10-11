const path = require('path');
const net = require('net');
const express = require('express');
const { Server } = require('socket.io');
const { createServer } = require('http');
const WebSocket = require('ws');
const { LiveChat } = require('youtube-chat');
const { Impit } = require('impit');

// Cliente HTTP que imita la huella TLS/headers de un navegador real (Chrome).
// Es el equivalente en Node de `curl_cffi` (impersonate="chrome") que usaba
// la version en Python: Kick esta detras de Cloudflare y bloquea clientes
// HTTP "normales" (fetch nativo, axios, etc.) por su fingerprint TLS.
const kickHttpClient = new Impit({ browser: 'chrome', ignoreTlsErrors: true });

module.exports = (isDev) => {
  const PORT = process.env.PORT || 5000;

  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: '*' } });

  // En desarrollo, los archivos estáticos están en la raíz. En producción,
  // están dentro de la carpeta 'app.asar' en 'resources'.
  const staticPath = !isDev
    ? path.join(process.resourcesPath, 'app.asar')
    : __dirname;
  app.use(express.static(staticPath));
  app.get('/', (req, res) => res.sendFile(path.join(staticPath, 'index.html')));

  // sesiones activas: sid -> { twitch, tiktok, kick, youtube } (cada valor tiene un metodo stop())
  const activeSessions = new Map();

  function log(sid, platform, msg) {
    console.log(`[${sid}][${platform}] ${msg}`);
  }

  function emitStatus(sid, platform, status, extra = {}) {
    io.to(sid).emit('status_update', { platform, status, ...extra });
  }

  function emitMessage(sid, platform, username, message) {
    io.to(sid).emit('chat_message', { platform, username, message });
  }

  // ---------------------------------------------------------------------------
  // Twitch: conexion IRC anonima directa (misma logica que el server.py original,
  // reimplementada sobre `net` en vez de asyncio streams)
  // ---------------------------------------------------------------------------
  function startTwitch(sid, channelName) {
    const state = { stopped: false, socket: null, retryTimer: null };

    const connect = () => {
      if (state.stopped) return;

      const nickname = `justinfan${Date.now() % 100000}`;
      const channel = `#${channelName.toLowerCase()}`;
      let buffer = '';

      log(sid, 'Twitch', `Conectando a irc.chat.twitch.tv:6667 de forma anonima...`);
      const socket = net.createConnection({ host: 'irc.chat.twitch.tv', port: 6667 }, () => {
        socket.write(`PASS asdf\r\n`);
        socket.write(`NICK ${nickname}\r\n`);
        socket.write(`JOIN ${channel}\r\n`);
        log(sid, 'Twitch', `Conectado a chat de Twitch: ${channel}`);
        emitStatus(sid, 'Twitch', 'connected', { channel: channelName });
      });
      state.socket = socket;

      socket.on('data', (data) => {
        buffer += data.toString('utf8');
        const lines = buffer.split('\r\n');
        buffer = lines.pop(); // resto incompleto

        for (const line of lines) {
          try {
            if (!line) continue;
            if (line.startsWith('PING')) {
              socket.write('PONG :tmi.twitch.tv\r\n');
            } else if (line.includes('PRIVMSG')) {
              const parts = line.split(' PRIVMSG ');
              if (parts.length >= 2) {
                const userPart = parts[0];
                const msgPart = parts.slice(1).join(' PRIVMSG ');
                const username = userPart.split('!')[0].slice(1);
                const idx = msgPart.indexOf(' :');
                if (idx !== -1) {
                  const msg = msgPart.slice(idx + 2);
                  log(sid, 'Twitch', `${username}: ${msg}`);
                  emitMessage(sid, 'Twitch', username, msg);
                }
              }
            }
          } catch (err) {
            log(sid, 'Twitch', `Error procesando linea IRC: ${err.message}`);
          }
        }
      });

      socket.on('error', (err) => {
        log(sid, 'Twitch', `Error: ${err.message}`);
        emitStatus(sid, 'Twitch', `error: ${err.message}`);
      });

      socket.on('close', () => {
        if (!state.stopped) {
          state.retryTimer = setTimeout(connect, 5000);
        }
      });
    };

    connect();

    return {
      stop() {
        state.stopped = true;
        if (state.retryTimer) clearTimeout(state.retryTimer);
        if (state.socket) state.socket.destroy();
      },
    };
  }

  // ---------------------------------------------------------------------------
  // TikTok: usa tiktok-live-connector (equivalente JS de la libreria TikTokLive)
  // ---------------------------------------------------------------------------
  function startTikTok(sid, username) {
    const state = { stopped: false, retryTimer: null, connection: null };

    const connect = async () => {
      if (state.stopped) return;
      try {
        log(sid, 'TikTok', `Conectando a @${username}...`);
        const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await import('tiktok-live-connector');
        const connection = new TikTokLiveConnection(username, {});
        state.connection = connection;

        connection.on(WebcastEvent.CHAT, (data) => {
          const uname = data.user?.nickname || data.user?.uniqueId || 'desconocido';
          log(sid, 'TikTok', `${uname}: ${data.comment}`);
          emitMessage(sid, 'TikTok', uname, data.comment);
        });

        connection.on(ControlEvent.DISCONNECTED, () => {
          if (!state.stopped) {
            emitStatus(sid, 'TikTok', 'error: desconectado, reintentando...');
            state.retryTimer = setTimeout(connect, 5000);
          }
        });

        await connection.connect();
        log(sid, 'TikTok', `Conectado al usuario: ${username}`);
        emitStatus(sid, 'TikTok', 'connected', { channel: username });
      } catch (err) {
        log(sid, 'TikTok', `Error: ${err.message}`);
        emitStatus(sid, 'TikTok', `error: ${err.message}`);
        if (!state.stopped) state.retryTimer = setTimeout(connect, 5000);
      }
    };

    connect();

    return {
      stop() {
        state.stopped = true;
        if (state.retryTimer) clearTimeout(state.retryTimer);
        if (state.connection) {
          try { state.connection.disconnect(); } catch (_) { }
        }
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Kick: resuelve el chatroom ID via la API publica de Kick y se suscribe
  // al websocket de Pusher, igual que el server.py original.
  // ---------------------------------------------------------------------------
  const KICK_WS_URL = 'wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=7.6.0&flash=false';

  async function resolveKickChatroomId(sid, kickInput, attempt = 1) {
    if (/^\d+$/.test(kickInput)) return kickInput;

    const res = await kickHttpClient.fetch(`https://kick.com/api/v2/channels/${kickInput}`, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      const text = await res.text();
      const isSecurityBlock = text.includes('security policy');

      // El bloqueo "Request blocked by security policy" de Kick es un WAF de
      // Cloudflare a nivel de reputacion de IP (afecta sobre todo IPs de
      // datacenter/VPN/cloud), y es intermitente en muchos casos: reintentamos
      // un par de veces con backoff antes de rendirnos.
      if (isSecurityBlock && attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
        return resolveKickChatroomId(sid, kickInput, attempt + 1);
      }

      if (isSecurityBlock) {
        throw new Error(
          `canal '${kickInput}' bloqueado por el WAF de Kick (HTTP 403, security policy). ` +
          `Esto suele pasar cuando el servidor corre desde una IP de datacenter/VPN/cloud, ` +
          `no es un bug del codigo. Solucion: obtene el chatroom_id numerico abriendo el chat ` +
          `de Kick en tu navegador (F12 -> Network -> buscar "chatrooms." en la URL del websocket) ` +
          `y pegalo directamente en el campo "Usuario Kick" en vez del nombre de usuario.`
        );
      }

      throw new Error(`canal '${kickInput}' no encontrado (HTTP ${res.status}): ${text.slice(0, 150)}`);
    }

    const data = await res.json();
    const chatroom = data.chatroom;
    if (!chatroom || !chatroom.id) {
      throw new Error(`canal '${kickInput}' encontrado pero sin chatroom`);
    }
    return String(chatroom.id);
  }

  function connectKickSocket(sid, chatroomId, state) {
    if (state.stopped) return;

    log(sid, 'Kick', `Conectando a chatroom ${chatroomId}...`);
    const ws = new WebSocket(KICK_WS_URL);
    state.ws = ws;

    ws.on('open', () => {
      ws.send(JSON.stringify({
        event: 'pusher:subscribe',
        data: { auth: '', channel: `chatrooms.${chatroomId}.v2` },
      }));
      log(sid, 'Kick', `Conectado al chatroom de Kick: ${chatroomId}`);
      emitStatus(sid, 'Kick', 'connected', { channel: chatroomId });
    });

    ws.on('message', (raw) => {
      let data;
      try {
        data = JSON.parse(raw.toString());
      } catch (_) {
        return;
      }
      const eventName = data.event;

      // Kick renombro el evento de mensajes de "App\Events\ChatMessageEvent" a
      // "App\Events\ChatMessageSentEvent", y el payload paso de estar anidado
      // en "message"/"user" a un formato plano (content + sender).
      if (eventName === 'App\\Events\\ChatMessageSentEvent' || eventName === 'App\\Events\\ChatMessageEvent') {
        try {
          const payload = JSON.parse(data.data);
          const sender = payload.sender || payload.user || {};
          const username = sender.username || '???';

          // El payload puede tener `content` (nuevo) o `message` (antiguo).
          // El campo `message` puede ser un string o un objeto { content, ... }.
          const content = payload.content || (typeof payload.message === 'object' ? payload.message.content : payload.message) || '';

          log(sid, 'Kick', `${username}: ${content}`);
          emitMessage(sid, 'Kick', username, content);
        } catch (err) {
          log(sid, 'Kick', `No se pudo parsear el mensaje: ${err.message}`);
        }
      } else if (eventName === 'pusher_internal:subscription_succeeded') {
        log(sid, 'Kick', `Suscripcion confirmada: ${data.channel}`);
      } else if (eventName && !eventName.startsWith('pusher')) {
        log(sid, 'Kick', `Evento no manejado: ${eventName}`);
      }
    });

    ws.on('error', (err) => {
      log(sid, 'Kick', `Error: ${err.message}`);
      emitStatus(sid, 'Kick', `error: ${err.message}`);
    });

    ws.on('close', () => {
      if (!state.stopped) {
        state.retryTimer = setTimeout(() => connectKickSocket(sid, chatroomId, state), 5000);
      }
    });
  }

  function startKick(sid, kickInput) {
    const state = { stopped: false, ws: null, retryTimer: null };

    (async () => {
      try {
        const chatroomId = await resolveKickChatroomId(sid, kickInput);
        log(sid, 'Server', `Kick '${kickInput}' -> chatroom ID '${chatroomId}'`);
        connectKickSocket(sid, chatroomId, state);
      } catch (err) {
        log(sid, 'Server', `Error resolviendo Kick '${kickInput}': ${err.message}`);
        emitStatus(sid, 'Kick', `error: ${err.message}`);
      }
    })();

    return {
      stop() {
        state.stopped = true;
        if (state.retryTimer) clearTimeout(state.retryTimer);
        if (state.ws) state.ws.close();
      },
    };
  }

  // ---------------------------------------------------------------------------
  // YouTube: usa youtube-chat (equivalente JS de pytchat) sobre el liveId (video id)
  // ---------------------------------------------------------------------------
  function startYouTube(sid, videoId) {
    const state = { stopped: false, retryTimer: null, liveChat: null };

    const connect = async () => {
      if (state.stopped) return;
      try {
        log(sid, 'YouTube', `Conectando al video ${videoId}...`);
        const liveChat = new LiveChat({ liveId: videoId });
        state.liveChat = liveChat;

        liveChat.on('start', () => {
          log(sid, 'YouTube', `Conectado al video: ${videoId}`);
          emitStatus(sid, 'YouTube', 'connected', { channel: videoId });
        });

        liveChat.on('chat', (chatItem) => {
          const message = chatItem.message.map((m) => m.text || m.emojiText || '').join('');
          log(sid, 'YouTube', `${chatItem.author.name}: ${message}`);
          emitMessage(sid, 'YouTube', chatItem.author.name, message);
        });

        liveChat.on('end', (reason) => {
          if (!state.stopped) {
            emitStatus(sid, 'YouTube', `error: transmision finalizada (${reason || 'sin motivo'}), reintentando...`);
            state.retryTimer = setTimeout(connect, 5000);
          }
        });

        liveChat.on('error', (err) => {
          log(sid, 'YouTube', `Error: ${err.message || err}`);
          emitStatus(sid, 'YouTube', `error: ${err.message || err}`);
        });

        const ok = await liveChat.start();
        if (!ok && !state.stopped) {
          state.retryTimer = setTimeout(connect, 5000);
        }
      } catch (err) {
        log(sid, 'YouTube', `Error: ${err.message}`);
        emitStatus(sid, 'YouTube', `error: ${err.message}`);
        if (!state.stopped) state.retryTimer = setTimeout(connect, 5000);
      }
    };

    connect();

    return {
      stop() {
        state.stopped = true;
        if (state.retryTimer) clearTimeout(state.retryTimer);
        if (state.liveChat) {
          try { state.liveChat.stop(); } catch (_) { }
        }
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Socket.IO: rutas equivalentes a las de Flask-SocketIO
  // ---------------------------------------------------------------------------
  function stopUserStreams(sid) {
    const session = activeSessions.get(sid);
    if (!session) return;
    for (const key of Object.keys(session)) {
      const handle = session[key];
      if (handle && typeof handle.stop === 'function') {
        try { handle.stop(); } catch (err) {
          log(sid, 'Server', `Error deteniendo ${key}: ${err.message}`);
        }
      }
    }
    activeSessions.delete(sid);
  }

  io.on('connection', (socket) => {
    const sid = socket.id;
    console.log(`Nuevo cliente Socket.IO conectado: ${sid}`);
    socket.emit('status_update', {
      platform: 'Server',
      status: 'ready',
      message: 'Conectado. Ingresa tus canales para iniciar.',
    });

    socket.on('start_streams', (data = {}) => {
      stopUserStreams(sid);

      const twitch = (data.twitch || '').trim();
      const tiktok = (data.tiktok || '').trim();
      const kick = (data.kick || '').trim();
      const youtube = (data.youtube || '').trim();

      const session = {};
      if (twitch) session.twitch = startTwitch(sid, twitch);
      if (tiktok) session.tiktok = startTikTok(sid, tiktok);
      if (kick) session.kick = startKick(sid, kick);
      if (youtube) session.youtube = startYouTube(sid, youtube);

      activeSessions.set(sid, session);

      socket.emit('status_update', {
        platform: 'Server',
        status: 'starting',
        message: 'Conectando a canales seleccionados...',
      });
    });

    socket.on('disconnect', () => {
      console.log(`Cliente desconectado: ${sid}. Deteniendo conexiones...`);
      stopUserStreams(sid);
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
  });

  // Se exporta para que main.js (Electron) pueda hacer un apagado prolijo
  // del servidor al cerrar la app desde el icono de la bandeja.
  return { httpServer, io, PORT };
};
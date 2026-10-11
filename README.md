# MultiStream Chat Overlay

Overlay de escritorio para reunir en una sola ventana los mensajes de chat de Twitch, TikTok, Kick y YouTube. Está construido con Node.js, Express, Socket.IO y Electron, y puede usarse junto con OBS.

## Instalación rápida en Windows

1. Descarga **MultiStream Chat Overlay Setup 1.0.0.exe** desde [la última versión publicada](https://github.com/TheMurft/multistream-chat-overlay/releases/latest).
2. Abre el instalador y sigue los pasos. Puedes elegir dónde instalar la aplicación; el asistente también crea accesos directos en el escritorio y el menú Inicio.
3. Abre **MultiStream Chat Overlay** desde uno de esos accesos directos.
4. En OBS, añade una fuente de navegador y usa `http://localhost:5000`. Mantén la aplicación abierta mientras uses el overlay.

El instalador incluye lo necesario para usar la aplicación; no tienes que instalar Node.js ni ejecutar comandos.

## Requisitos

- Node.js 20 o posterior y npm.
- Windows para generar el instalador incluido en este proyecto.

## Instalación y uso

```bash
npm install
npm start
```

Abre `http://localhost:5000` en el navegador para usar el overlay. Para abrir la aplicación de escritorio:

```bash
npm run electron
```

En OBS, agrega una fuente de navegador con la dirección del overlay local. Consulta la interfaz del proyecto para las opciones de plataformas y apariencia disponibles.

## Desarrollo

```bash
npm run dev
```

## Crear el instalador de Windows

```bash
npm run build
```

## Archivos principales

- `server.js`: servidor web, conexiones en tiempo real e integración con los chats.
- `index.html`: interfaz del overlay.
- `main.js`: proceso principal de Electron.
- `preload.js`: puente seguro entre Electron y la interfaz.

## Licencia

Este proyecto declara la licencia MIT en `package.json`.

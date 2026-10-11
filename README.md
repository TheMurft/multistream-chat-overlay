# MultiStream Chat Overlay

A desktop overlay that brings Twitch, TikTok, Kick, and YouTube chat together in one window. Built with Node.js, Express, Socket.IO, and Electron for use with OBS.

## Install on Windows

1. Download **MultiStream Chat Overlay Setup 1.0.0.exe** from the [latest release](https://github.com/TheMurft/multistream-chat-overlay/releases/latest).
2. Open the installer and follow the setup steps. You can choose the installation folder; the installer also creates shortcuts on the desktop and in the Start menu.
3. Open **MultiStream Chat Overlay** from either shortcut.
4. In OBS, add a Browser source and enter `http://localhost:5000`. Keep the app running while you use the overlay.

The installer includes everything needed to run the app. You do not need to install Node.js or run commands.

## Requirements for running from source

- Node.js 20 or later and npm.
- Windows to build the installer included with this project.

## Run from source

```bash
npm install
npm start
```

Open `http://localhost:5000` in a browser to use the overlay. To open the desktop app during development:

```bash
npm run electron
```

In OBS, add a Browser source pointing to the local overlay. The interface provides the available platform and appearance options.

## Development

```bash
npm run dev
```

## Build the Windows installer

```bash
npm run build
```

## Main files

- `server.js`: web server, real-time connections, and chat integrations.
- `index.html`: overlay interface.
- `main.js`: Electron main process.
- `preload.js`: secure bridge between Electron and the interface.

## License

This project declares the MIT license in `package.json`.

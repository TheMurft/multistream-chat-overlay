# MultiStream Chat Overlay

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Electron](https://img.shields.io/badge/Electron-desktop%20app-47848F?logo=electron&logoColor=white)
![Chat platforms](https://img.shields.io/badge/chat-Twitch%20%7C%20TikTok%20%7C%20Kick%20%7C%20YouTube-9146FF)

A lightweight desktop overlay that brings Twitch, TikTok, Kick, and YouTube live chat into one window. Connect the channels you want, switch to a transparent overlay, and capture the window in OBS.

## ✨ Features

- **Four chat platforms:** Twitch, TikTok, Kick, and YouTube Live.
- **Transparent overlay:** Keep the chat visible over your stream without a solid background.
- **OBS-ready:** Capture the app window with OBS Window Capture.
- **System tray controls:** Hide the window while keeping the local chat server running, or reopen it when needed.
- **Remembered channels:** Your channel entries are saved on your computer for the next time you launch the app.
- **No coding required:** The Windows installer includes the app and its runtime dependencies.

## 📥 Download and install on Windows

1. Open the [latest release](https://github.com/TheMurft/multistream-chat-overlay/releases/latest).
2. Download **MultiStream.Chat.Overlay.Setup.1.0.0.exe** from the Assets section.
3. Open the installer and follow the setup steps. You can choose where to install the app; shortcuts are added to the desktop and Start menu.
4. Launch **MultiStream Chat Overlay** from a shortcut.

The installer is for 64-bit Windows. It is not digitally signed, so Windows may show an “unrecognized publisher” warning.

## 🚀 Quick start

1. Enter the channel or username for each platform you want to display. Leave other fields blank. No account tokens are required.
2. For YouTube, enter the **video ID** of a live stream. For example, in `https://www.youtube.com/watch?v=dQw4w9WgXcQ`, the video ID is `dQw4w9WgXcQ`.
3. Check **Overlay Mode (Transparent Background)**.
4. Select **Connect Chats**. The setup panel hides and chat messages appear in the transparent window.
5. In OBS, add a **Window Capture** source and select **MultiStream Chat Overlay**. Keep the app running while you stream.

To edit the channels or reposition the window later, press **F9** or choose **Edit Mode** from the app’s system tray menu.

## 📺 OBS setup

1. Add a **Window Capture** source to your scene.
2. Select the **MultiStream Chat Overlay** window.
3. Resize and position the source where you want chat to appear.
4. Keep the app running. Closing its window hides it to the system tray; use the tray menu to quit the app completely.

## 🧩 Supported platforms

| Platform | What to enter |
| --- | --- |
| Twitch | Channel name |
| TikTok | LIVE creator username |
| Kick | Channel username or numeric chatroom ID |
| YouTube Live | Live video ID |

Only chats that are available from their platforms can connect. Kick may reject requests from some networks; if a Kick connection error persists, try again later or contact support.

## 🧰 Run from source

### Requirements

- Windows
- Node.js 20 or later and npm

### Start the desktop app

```bash
npm install
npm run electron
```

The desktop app starts its local server automatically.

### Build the Windows installer

```bash
npm run build
```

The installer is created in the `dist/` directory.

## 📁 Project structure

```text
.
├── index.html       # Overlay interface and chat display
├── main.js          # Electron window, tray menu, and app lifecycle
├── preload.js       # Secure bridge between Electron and the interface
├── server.js        # Local server and platform chat connections
├── package.json     # Dependencies and Windows installer settings
├── icon.ico         # App icon
└── tray-icon.png    # System tray icon
```

## 💬 Support

For questions or help, join the [Discord support server](https://discord.gg/6C5t995jC6).

## 📄 License

This project is licensed under the MIT License.

Made with ❤️ by [TheMurft](https://github.com/TheMurft).

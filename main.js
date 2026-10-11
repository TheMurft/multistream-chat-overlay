const path = require('path');
const { app, BrowserWindow, Tray, Menu, shell, nativeImage, globalShortcut, ipcMain } = require('electron');
const windowStateKeeper = require('electron-window-state');

// Arranca el servidor Express/Socket.IO en el mismo proceso. Esto hace que
// http://localhost:5000 este disponible tanto para la ventana de esta app
// como para OBS (Browser Source), independientemente de si la ventana
// esta abierta, minimizada o escondida en la bandeja.
const { httpServer, PORT } = require('./server.js')(!app.isPackaged);
const APP_URL = `http://localhost:${PORT}`;
const isDev = !app.isPackaged;

let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
    // Determina la ruta correcta para los íconos y el preload.
    const assetsPath = isDev ? path.join(__dirname, 'build') : path.join(process.resourcesPath, 'build');
    const preloadPath = path.join(__dirname, 'preload.js');

    const mainWindowState = windowStateKeeper({
        defaultWidth: 480,
        defaultHeight: 780,
    });

    mainWindow = new BrowserWindow({
        minWidth: 380,
        minHeight: 500,
        x: mainWindowState.x,
        y: mainWindowState.y,
        width: mainWindowState.width,
        height: mainWindowState.height,
        title: 'MultiStream Chat Overlay',
        icon: path.join(assetsPath, 'icon.ico'),
        autoHideMenuBar: true,
        frame: false, // La ventana no tendrá la barra de título, bordes, etc.
        transparent: true, // La ventana DEBE iniciarse transparente para que el CSS la controle.
        alwaysOnTop: true, // La ventana siempre estará por encima de otras.
        hasShadow: true, // Le devolvemos la sombra a la ventana.
        webPreferences: {
            contextIsolation: true,
            preload: preloadPath,
        },
    });

    mainWindowState.manage(mainWindow);

    mainWindow.loadURL(APP_URL);

    // Al cerrar la ventana (la X), la ocultamos a la bandeja en vez de matar
    // el proceso: el servidor tiene que seguir vivo para que OBS lo siga leyendo.
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Registramos el atajo F9 solo después de que la ventana haya cargado
    // completamente la página. Esto asegura que el webContents está listo
    // para recibir el evento.
    mainWindow.webContents.on('did-finish-load', () => {
        globalShortcut.register('F9', () => mainWindow.webContents.send('toggle-drag-mode'));
    });
}

function createTray() {
    // La ruta a los recursos es diferente en desarrollo y en producción.
    const assetsPath = isDev ? path.join(__dirname, 'build') : path.join(process.resourcesPath, 'build');
    const trayIcon = nativeImage.createFromPath(path.join(assetsPath, 'tray-icon.png'));
    tray = new Tray(trayIcon);
    tray.setToolTip('MultiStream Chat Overlay — servidor activo');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Mostrar ventana',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
            },
        },
        {
            label: 'Modo Edición',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
                mainWindow.webContents.send('toggle-drag-mode');
            },
        },
        { type: 'separator' },
        {
            label: 'Cerrar',
            click: () => {
                quitApp();
            },
        },
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

function quitApp() {
    isQuitting = true;
    httpServer.close(() => {
        app.quit();
    });
    // Por si el servidor tarda en cerrar (conexiones abiertas de chats), forzamos
    // la salida a los 2s para no dejar la app colgada.
    setTimeout(() => app.quit(), 2000);
}

app.whenReady().then(() => {
    createWindow();
    createTray();

    // Deshabilita explícitamente el "Modo de Eficiencia" de Windows.
    app.setHighEfficiencyMode(false);

    // Escucha desde el renderer para cambiar la opacidad de la ventana.
    ipcMain.on('set-transparent', (event, isTransparent) => {
        mainWindow.setTransparent(isTransparent);
    });
});

app.on('window-all-closed', () => {
    // No cerramos la app al cerrar la ventana: sigue viva en la bandeja.
});

app.on('before-quit', () => {
    isQuitting = true;
    globalShortcut.unregisterAll(); // Limpia los atajos al salir
});

app.on('activate', () => {
    if (mainWindow) {
        mainWindow.show();
    } else {
        createWindow();
    }
});
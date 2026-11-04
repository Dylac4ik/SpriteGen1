import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IPC } from '@shared/ipc';
import type { MenuCommand } from '@shared/types';

export function buildMenu(getWindow: () => BrowserWindow | null, isDev: boolean): Menu {
  const send = (cmd: MenuCommand) => () => getWindow()?.webContents.send(IPC.menuCommand, cmd);
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: '&File',
      submenu: [
        { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: send('new-project') },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: send('open-project') },
        { label: 'Save Project', accelerator: 'CmdOrCtrl+S', click: send('save-project') },
        { label: 'Save Project As…', accelerator: 'CmdOrCtrl+Shift+S', click: send('save-project-as') },
        { type: 'separator' },
        { label: 'Export PNG…', accelerator: 'CmdOrCtrl+E', click: send('export-png') },
        { label: 'Export Sprite Sheet…', accelerator: 'CmdOrCtrl+Shift+E', click: send('export-sheet') },
        { label: 'Copy Sprite to Clipboard', accelerator: 'CmdOrCtrl+Shift+C', click: send('copy-image') },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: send('open-settings') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
        { label: 'Redo', accelerator: isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y', click: send('redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Reset Sprite to Original', click: send('reset-original') },
      ],
    },
    {
      label: '&Generate',
      submenu: [{ label: 'Generate', accelerator: 'CmdOrCtrl+Enter', click: send('generate') }, { label: 'Cancel Generation', click: send('cancel-generation') }],
    },
    {
      label: '&View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: send('zoom-in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: send('zoom-out') },
        { label: 'Zoom to Fit', accelerator: 'CmdOrCtrl+9', click: send('zoom-fit') },
        { label: 'Actual Pixels (1×)', accelerator: 'CmdOrCtrl+0', click: send('zoom-actual') },
        { type: 'separator' },
        { label: 'Toggle Pixel Grid', accelerator: "CmdOrCtrl+'", click: send('toggle-grid') },
        { label: 'Toggle Before/After Compare', accelerator: 'CmdOrCtrl+B', click: send('toggle-compare') },
        ...(isDev ? ([{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] as MenuItemConstructorOptions[]) : []),
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '&Help',
      submenu: [{ label: `SpriteGen ${app.getVersion()}`, enabled: false }],
    },
  ];
  return Menu.buildFromTemplate(template);
}

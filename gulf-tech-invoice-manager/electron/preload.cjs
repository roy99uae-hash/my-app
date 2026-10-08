/**
 * Preload script: exposes a small, explicit API to the UI as `window.gulftech`.
 * The renderer cannot reach Node.js or arbitrary IPC channels; every method maps
 * to one whitelisted channel handled in electron/ipc/registerHandlers.js.
 */
const { contextBridge, ipcRenderer } = require('electron');

/** Invoke a channel and unwrap the { ok, data } envelope into a promise. */
function call(channel, arg) {
  return ipcRenderer.invoke(channel, arg).then((res) => {
    if (!res || !res.ok) {
      const err = new Error(res?.error || 'Unexpected error');
      err.code = res?.code || 'ERROR';
      throw err;
    }
    return res.data;
  });
}

const api = {
  info: () => call('app:info'),
  settings: {
    get: () => call('app:settings:get'),
    update: (partial) => call('app:settings:update', partial),
  },
  security: {
    status: () => call('security:status'),
    unlock: (pin) => call('security:unlock', { pin }),
    lock: () => call('security:lock'),
    setPin: (currentPin, newPin) => call('security:setPin', { currentPin, newPin }),
    removePin: (currentPin) => call('security:removePin', { currentPin }),
  },
  businesses: {
    list: () => call('business:list'),
    get: (id) => call('business:get', { id }),
    save: (data) => call('business:save', data),
    remove: (id) => call('business:delete', { id }),
  },
  customers: {
    list: (filters) => call('customer:list', filters || {}),
    get: (id) => call('customer:get', { id }),
    save: (data) => call('customer:save', data),
    remove: (id) => call('customer:delete', { id }),
    history: (id) => call('customer:history', { id }),
  },
  products: {
    list: (filters) => call('product:list', filters || {}),
    get: (id) => call('product:get', { id }),
    byCode: (code) => call('product:byCode', { code }),
    save: (data) => call('product:save', data),
    remove: (id) => call('product:delete', { id }),
    categories: () => call('product:categories'),
  },
  invoices: {
    list: (filters) => call('invoice:list', filters || {}),
    get: (id) => call('invoice:get', { id }),
    save: (payload) => call('invoice:save', payload),
    remove: (id) => call('invoice:delete', { id }),
    previewNumber: () => call('invoice:previewNumber'),
    numberFor: (date) => call('invoice:numberFor', { date }),
  },
  dashboard: {
    get: () => call('dashboard:get'),
  },
  reports: {
    get: (period, anchor) => call('report:get', { period, anchor }),
  },
  backup: {
    list: () => call('backup:list'),
    export: (format, password) => call('backup:export', { format, password }),
    pickFile: () => call('backup:pickFile'),
    restore: (path, password) => call('backup:restore', { path, password }),
    runNow: () => call('backup:runNow'),
    chooseFolder: () => call('backup:chooseFolder'),
  },
  pdf: {
    print: (html, pageSize) => call('pdf:print', { html, pageSize }),
    export: (html, pageSize, fileBase) => call('pdf:export', { html, pageSize, fileBase }),
    save: (html, pageSize, fileBase) => call('pdf:save', { html, pageSize, fileBase }),
    chooseFolder: () => call('pdf:chooseFolder'),
  },
  share: {
    reveal: (path) => call('share:reveal', { path }),
    open: (path) => call('share:open', { path }),
    copyPath: (path) => call('share:copyPath', { path }),
    email: (to, subject, body) => call('share:email', { to, subject, body }),
    whatsapp: (number, message) => call('share:whatsapp', { number, message }),
  },
  files: {
    pickImage: () => call('file:pickImage'),
    saveText: (defaultName, content, filters) => call('file:saveText', { defaultName, content, filters }),
  },
};

contextBridge.exposeInMainWorld('gulftech', api);

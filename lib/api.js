"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

/**
 * A module for interfacing with the printer side of a SATO Web AEP application
 * @module sato
 */
// const DEBUG = true;
let baseURL;
let wsURL;
let isLocalClient = false;
let originalIsPrinter;

function setBaseURL(ip) {
  if (ip == 'localhost') {
    ip = '127.0.0.1';
  }

  if (ip == '127.0.0.1') {
    isLocalClient = true;
    baseURL = `http://${ip}`;
    wsURL = `ws://${ip}/statusd`;
  } else {
    baseURL = `https://${ip}`;
    wsURL = `wss://${ip}/statusd`;
  }
}

if (typeof sato == 'object') {
  setBaseURL('localhost'); // eslint-disable-next-line no-undef

  originalIsPrinter = sato.isPrinter;
} else {
  setBaseURL(window.location.host);
} // Scan queue


const SCAN_QUEUE_SIZE = 10;
const scanData = []; // Cached translated error messages

const errors = {}; // Global callbacks

let printDoneCallback;
let scannerCallback;
let errorCallback;
let variablesCallback;
let userDataCallback; // Batch callbacks

let labelCountCallback;
let batchDoneCallback;
let batchErrorCallback;

function hookBatchCallbacks(options) {
  if (typeof options.labelCount == "function") {
    labelCountCallback = options.labelCount;
  }

  if (typeof options.batchDone == "function") {
    batchDoneCallback = options.batchDone;
  }

  if (typeof options.batchError == "function") {
    batchErrorCallback = options.batchError;
  }
}

function unhookBatchCallbacks() {
  labelCountCallback = undefined;
  batchDoneCallback = undefined;
  batchErrorCallback = undefined;
}

function get(_x) {
  return _get.apply(this, arguments);
}

function _get() {
  _get = _asyncToGenerator(function* (url, options = {}) {
    url = new URL(baseURL + url);

    for (const attr in options) {
      if (Array.isArray(options[attr])) {
        for (const elem of options[attr]) {
          url.searchParams.append(attr + "[]", elem);
        }
      } else {
        url.searchParams.append(attr, options[attr]);
      }
    }

    const raw = yield fetch(url);
    const res = yield raw.json();

    if (raw.ok) {
      if (typeof options.success == "function") {
        options.success(raw);
      }
    } else {
      if (typeof options.error == "function") {
        options.error(raw);
      }
    }

    return res;
  });
  return _get.apply(this, arguments);
}

function post(_x2) {
  return _post.apply(this, arguments);
}

function _post() {
  _post = _asyncToGenerator(function* (url, options = {}) {
    const raw = yield fetch(baseURL + url, {
      method: 'POST',
      body: JSON.stringify(options)
    });
    const res = yield raw.json();

    if (raw.ok) {
      if (typeof options.success == "function") {
        options.success(raw);
      }
    } else {
      if (typeof options.error == "function") {
        options.error(raw);
      }
    }

    return res;
  });
  return _post.apply(this, arguments);
}

let msgType = {};

function handleMessage(_x3) {
  return _handleMessage.apply(this, arguments);
}

function _handleMessage() {
  _handleMessage = _asyncToGenerator(function* (msg) {
    switch (msg.type) {
      case msgType.TLABELCOUNT:
        if (typeof labelCountCallback == "function") {
          labelCountCallback(msg.v);
        }

        if (msg.v == 0) {
          if (typeof printDoneCallback == "function") {
            printDoneCallback();
          }

          if (typeof batchDoneCallback == "function") {
            batchDoneCallback();
          }

          unhookBatchCallbacks();
        }

        break;

      case msgType.ERROR:
        {
          if (errors[msg.data] == null) {
            const localized = yield get('/localization', {
              strings: [msg.data]
            });
            errors[msg.data] = localized[msg.data];
          }

          const error = {
            code: msg.data,
            message: errors[msg.data]
          };

          if (typeof errorCallback == "function") {
            errorCallback(error);
          }

          if (typeof batchErrorCallback == "function") {
            batchErrorCallback(error);
          }

          break;
        }

      case msgType.extKey:
        break;

      case msgType.extChar:
        {
          let chars = msg.data;
          if (!Array.isArray(chars)) chars = [chars];
          const string = chars.map(c => String.fromCharCode(c)).join("");

          if (typeof scannerCallback == "function") {
            scannerCallback(string);
          } else {
            if (scanData.length >= SCAN_QUEUE_SIZE) scanData.shift();
            scanData.push(string);
          }

          break;
        }

      case msgType.webAepVariables:
        {
          let variables = msg.data;

          if (typeof variablesCallback == "function") {
            variablesCallback(variables);
          }

          break;
        }

      case msgType.webAepUserData:
        {
          let data = msg.data;

          if (typeof userDataCallback == "function") {
            userDataCallback(data);
          }

          break;
        }

      case msgType.ARRAY:
        for (const d of msg.data) {
          handleMessage({
            type: d[0],
            data: d[1]
          });
        }

        break;
    }
  });
  return _handleMessage.apply(this, arguments);
}

function onMessage(msg) {
  const messages = msg.data.trim().split('\n');

  for (let msg of messages) {
    msg = JSON.parse(msg);
    msg.etype = msgType[msg.type];
    const dbgIgnore = {
      "BATTERY_StatusbarUpdate": true,
      "WLAN_ENABLE": true,
      "TIME_UPDATE": true,
      "runState": true,
      "dataRecv": true
    };

    if (typeof DEBUG != "undefined" && !dbgIgnore[msg.etype]) {
      // eslint-disable-next-line no-console
      console.log(msg);
    }

    handleMessage(msg);
  }
}

let websocket;

function wsConnect() {
  return new Promise((resolve, reject) => {
    const server = new WebSocket(wsURL);

    server.onopen = () => resolve(server);

    server.onerror = err => reject(err);
  });
}

function connect() {
  return _connect.apply(this, arguments);
}

function _connect() {
  _connect = _asyncToGenerator(function* () {
    if (typeof websocket != 'undefined') {
      websocket.close();
    }

    const enums = yield get('/rest/enums');
    msgType = enums.messageTypeEnum;
    websocket = yield wsConnect();

    if (isLocalClient) {
      // Tell backend we're a local client (don't worry, this makes perfect sense)
      websocket.send(JSON.stringify({
        type: msgType.KBDSLEEP,
        data: "l:1"
      }));
    }

    websocket.onmessage = onMessage;
  });
  return _connect.apply(this, arguments);
}

var _default = {
  /**
   * Indicates whether the application is running in the printer's web browser or not.
   * @type {boolean}
   * @example
   * if (sato.isPrinter) {
   *     // do something
   * } else {
   *     // do something else
   * }
   */
  isPrinter: originalIsPrinter === true,

  /**
   * Set printer IP and open a WebSocket connection.
   * If no IP is specified the connection will be made either to `localhost` if running locally, otherwise to `window.location.host`.
   * @param {string} ip Printer IP.
   */
  connect(ip) {
    if (typeof ip != 'undefined') {
      setBaseURL(ip);
    }

    return connect();
  },

  /**
   * @callback batchDoneCallback
   */

  /**
   * Callback called whenever a batch finishes printing.
   * @param {batchDoneCallback} callback
   */
  setPrintDoneCallback(callback) {
    printDoneCallback = callback;
  },

  /**
   * @callback printerErrorCallback
   * @param {Object} error
   * @param {number} error.code Error code.
   * @param {string} error.message Localized error message.
   */

  /**
   * Callback called whenever an error occurs.
   * @param {printerErrorCallback} callback
   */
  setErrorCallback(callback) {
    errorCallback = callback;
  },

  /**
   * @callback scannerCallback
   * @param {string} scanData The scanned text.
   */

  /**
   * Callback called when a barcode is scanned with scanner connected to printer.
   * @param {scannerCallback} callback
   */
  setScannerCallback(callback) {
    scannerCallback = callback;
  },

  /**
   * Checks if there's data in the scan buffer.
   * @returns {boolean} Whether there is data in the scan buffer.
   */
  hasScanData() {
    return scanData.length > 0;
  },

  /**
   * Get scan data.
   * @returns {string} Data at the front of scan buffer.
   */
  getScanData() {
    return scanData.shift();
  },

  /**
   * @callback variablesCallback
   * @param {Object} variables Key-value pairs of modified variables.
   */

  /**
   * Callback called when a live variable has been modified.
   * @param {variablesCallback} callback
   */
  setVariablesCallback(callback) {
    variablesCallback = callback;
  },

  /**
   * @callback userDataCallback
   * @param {*} data User data.
   */

  /**
   * Callback called when user data is sent from the Lua layer.
   * @param {userDataCallback} callback
   */
  setUserDataCallback(callback) {
    userDataCallback = callback;
  },

  /**
   * Retrieves variables from printer.
   * @returns {Object} Key-value pairs of all application variables.
   */
  fetchVariables() {
    return _asyncToGenerator(function* () {
      const vars = yield get('/webaep/data');
      return vars;
    })();
  },

  /**
   * Sets, evaluates and retrieves variables from printer.
   * @param {Object} variables Key-value pairs of variables to set and evaluate.
   * @returns {Object} Key-value pairs of all application variables.
   */
  saveVariables(variables) {
    return _asyncToGenerator(function* () {
      const vars = yield post('/webaep/data', variables);
      return vars;
    })();
  },

  /**
   * @callback successCallback
   * @param {Object} result Fetch request object.
   */

  /**
   * @callback errorCallback
   * @param {Object} result Fetch request object.
   */

  /**
   * Called after each label in batch.
   * @callback labelCountCallback
   * @param {number} labelCount Number of labels left in queue.
   */

  /**
   * Print pre-installed format with name `formatName`.
   * @param {string} formatName Name of pre-installed format to print.
   * @param {number} options.quantity Number of labels to print.
   * @param {Object} options.data Key-value pairs of application variables to set and evaluate.
   * @param {successCallback} options.success Print request successful callback.
   * @param {errorCallback} options.error Print request error callback.
   * @param {labelCountCallback} options.labelCount Label printed callback.
   * @param {batchDoneCallback} options.batchDone Batch done callback.
   * @param {printerErrorCallback} options.batchError Callback for each error that occurs until batch done.
   * @returns {Object} Request result.
   */
  printByName(formatName, options = {}) {
    return _asyncToGenerator(function* () {
      var _options$quantity;

      options.formatName = formatName;
      options.quantity = (_options$quantity = options.quantity) !== null && _options$quantity !== void 0 ? _options$quantity : 1;
      const success = options.success;

      options.success = raw => {
        if (raw.ok) {
          hookBatchCallbacks(options);
        }

        if (typeof success == "function") {
          success(raw);
        }
      };

      const res = yield post('/webaep/print', options);
      return res;
    })();
  },

  /**
   * Print format `formatData`.
   * @param {(Object|Object[])} formatData Format or array of formats to print as JSON.
   * @param {number} options.quantity Number of labels to print.
   * @param {Object} options.data Key-value pairs of application variables to set and evaluate.
   * @param {successCallback} options.success Print request successful callback.
   * @param {errorCallback} options.error Print request error callback.
   * @param {labelCountCallback} options.labelCount Label printed callbck.
   * @param {batchDoneCallback} options.batchDone Batch done callback.
   * @param {printerErrorCallback} options.batchError Callback for each error that occurs until batch done.
   * @returns {Object} Request result.
   */
  print(formatData, options = {}) {
    return _asyncToGenerator(function* () {
      var _options$quantity2;

      options.formatData = formatData;
      options.quantity = (_options$quantity2 = options.quantity) !== null && _options$quantity2 !== void 0 ? _options$quantity2 : 1;
      const success = options.success;

      options.success = raw => {
        if (raw.ok) {
          hookBatchCallbacks(options);
        }

        if (typeof success == "function") {
          success(raw);
        }
      };

      const res = yield post('/webaep/print', options);
      return res;
    })();
  },

  /**
   * Preview pre-installed format with name `formatName`.
   * @param {string} formatName Name of pre-installed format to preview.
   * @param {Object} options.data Key-value pairs of application variables to set and evaluate.
   * @returns {string} Label bitmap as a base64 string.
   */
  previewByName(formatName, options = {}) {
    return _asyncToGenerator(function* () {
      options.formatName = formatName;
      const res = yield post('/webaep/preview', options);
      return res.image;
    })();
  },

  /**
   * Preview format `formatData`.
   * @param {Object} formatData Format to print as JSON.
   * @param {Object} options.data Key-value pairs of application variables to set and evaluate.
   * @returns {string} Label bitmap as a base64 string.
   */
  preview(formatData, options = {}) {
    return _asyncToGenerator(function* () {
      options.formatData = formatData;
      const res = yield post('/webaep/preview', options);
      return res.image;
    })();
  },

  /**
   * Retrieve rows from table with name `tableName`.
   * @param {string} tableName Name of table to fetch rows from.
   * @options {Object} Query parameters.
   * @returns {Object[]} Array of rows as key-value pairs `[{ "column": "value", ...}, ...]`.
   */
  fetchTableRows(tableName, options = {}) {
    return _asyncToGenerator(function* () {
      options.tableName = tableName;
      const res = yield get('/webaep/table', options);
      return res;
    })();
  }

};
exports.default = _default;
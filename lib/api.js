/*! webaep-api - v2.0.1 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

/**
 * A module for interfacing with the printer side of a SATO Web AEP application
 * @module webaep
 */
// const DEBUG = true;
let baseURL;
let wsURL;
let isLocalClient = false;

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

if (typeof sato !== 'undefined' && sato.isPrinter === true) {
  setBaseURL('localhost');
} else {
  setBaseURL(window.location.host);
} // Printer state


let printerState = "ready";
let internalState = {}; // Scan queue

const SCAN_QUEUE_SIZE = 10;
const scanData = []; // Cached translated error messages

const errors = {}; // Global callbacks

let stateCallback;
let labelCountCallback;
let printDoneCallback;
let scannerCallback;
let errorCallback;
let variablesCallback;
let userDataCallback; // Batch callbacks

let batchLabelCountCallback;
let batchDoneCallback;
let batchErrorCallback;

function setPrinterState(status) {
  let newState = printerState;
  const isPrinting = status.processing || status.motion || status.printQty > 0;

  switch (status.currentState) {
    case "ONLINE":
      if (isPrinting) {
        newState = "printing";
      } else {
        newState = "ready";
      }

      break;

    case "OFFLINE":
      if (isPrinting) {
        newState = "paused";
      } else {
        newState = "busy";
      }

      break;

    case "ERROR":
      newState = "error";
      break;

    default:
      newState = "busy";
  }

  if (newState != printerState) {
    var _stateCallback;

    printerState = newState;
    (_stateCallback = stateCallback) === null || _stateCallback === void 0 ? void 0 : _stateCallback(printerState);
  }
}

function hookBatchCallbacks(options) {
  if (typeof options.labelCount == "function") {
    batchLabelCountCallback = options.labelCount;
  }

  if (typeof options.batchDone == "function") {
    batchDoneCallback = options.batchDone;
  }

  if (typeof options.batchError == "function") {
    batchErrorCallback = options.batchError;
  }
}

function unhookBatchCallbacks() {
  batchLabelCountCallback = undefined;
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
      var _options$success;

      (_options$success = options.success) === null || _options$success === void 0 ? void 0 : _options$success.call(options, raw);
    } else {
      var _options$error;

      (_options$error = options.error) === null || _options$error === void 0 ? void 0 : _options$error.call(options, raw);
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
      var _options$success2;

      (_options$success2 = options.success) === null || _options$success2 === void 0 ? void 0 : _options$success2.call(options, raw);
    } else {
      var _options$error2;

      (_options$error2 = options.error) === null || _options$error2 === void 0 ? void 0 : _options$error2.call(options, raw);
    }

    return res;
  });
  return _post.apply(this, arguments);
}

let msgType = {};
let keysEnum = {};
let statusEnum = {};

function handleMessage(_x3) {
  return _handleMessage.apply(this, arguments);
}

function _handleMessage() {
  _handleMessage = _asyncToGenerator(function* (msg) {
    var _labelCountCallback, _batchLabelCountCallb;

    switch (msg.type) {
      case msgType.STATUS:
        internalState.currentState = statusEnum[msg.v];
        setPrinterState(internalState);
        break;

      case msgType.PROCESSING:
        internalState.processing = !!msg.v;
        setPrinterState(internalState);
        break;

      case msgType.MOTION:
        internalState.motion = !!msg.v;
        setPrinterState(internalState);
        break;

      case msgType.TLABELCOUNT:
        (_labelCountCallback = labelCountCallback) === null || _labelCountCallback === void 0 ? void 0 : _labelCountCallback(msg.v);
        (_batchLabelCountCallb = batchLabelCountCallback) === null || _batchLabelCountCallb === void 0 ? void 0 : _batchLabelCountCallb(msg.v);

        if (msg.v == 0) {
          var _printDoneCallback, _batchDoneCallback;

          (_printDoneCallback = printDoneCallback) === null || _printDoneCallback === void 0 ? void 0 : _printDoneCallback();
          (_batchDoneCallback = batchDoneCallback) === null || _batchDoneCallback === void 0 ? void 0 : _batchDoneCallback();
          unhookBatchCallbacks();
        }

        internalState.printQty = msg.v;
        setPrinterState(internalState);
        break;

      case msgType.ERROR:
        {
          var _errorCallback, _batchErrorCallback;

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
          (_errorCallback = errorCallback) === null || _errorCallback === void 0 ? void 0 : _errorCallback(error);
          (_batchErrorCallback = batchErrorCallback) === null || _batchErrorCallback === void 0 ? void 0 : _batchErrorCallback(error);
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
          var _variablesCallback;

          let variables = msg.data;
          (_variablesCallback = variablesCallback) === null || _variablesCallback === void 0 ? void 0 : _variablesCallback(variables);
          break;
        }

      case msgType.webAepUserData:
        {
          var _userDataCallback;

          let data = msg.data;
          (_userDataCallback = userDataCallback) === null || _userDataCallback === void 0 ? void 0 : _userDataCallback(data);
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
    keysEnum = enums.keysEnum;
    statusEnum = enums.status;
    internalState = yield get('/rest/state');
    setPrinterState(internalState); // PSim can't rewrite the WebSocket URL on its own so we need to give it some help.
    // eslint-disable-next-line no-undef

    if (typeof psim !== 'undefined' && typeof psim.getPort === 'function') {
      // eslint-disable-next-line no-undef
      const port = yield psim.getPort();
      wsURL = wsURL.replace('ws://127.0.0.1/', `wss://127.0.0.1:${port}/`);
    }

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
   * if (webaep.isPrinter()) {
   *     // do something
   * } else {
   *     // do something else
   * }
   */
  isPrinter() {
    return typeof sato !== 'undefined' && sato.isPrinter === true;
  },

  /**
   * Set printer IP and open a WebSocket connection to receive status callbacks.
   * If no IP is specified the connection will be made to `localhost` if running locally on a SATO printer, otherwise to `window.location.host`.
   * @param {string} ip Printer IP.
   * @example
   * // Web app hosted on the printer, connect to localhost or window.location.host
   * webaep.connect()
   *
   * // When debugging a web app hosted on your PC or an external server it can be useful to specify the IP
   * const IP = webaep.isPrinter() ? undefined : "192.168.0.123"
   * webaep.connect(IP)
   */
  connect(ip) {
    if (typeof ip != 'undefined') {
      setBaseURL(ip);
    }

    return connect();
  },

  /**
   * Get current printer state, where state is one of
   * "ready", "printing", "paused", "busy", "error"
   * @returns {string} Printer state
   */
  getPrinterState() {
    return printerState;
  },

  /**
   * @callback stateCallback
   * @param {string} state Printer state
   */

  /**
   * Callback called when printer state changes.
   * Where state is one of "ready", "printing", "paused", "busy", "error"
   * @param {stateCallback} callback
   * @example
   * webaep.setStateCallback((state) => console.log("Printer state is: " + state))
   */
  setStateCallback(callback) {
    stateCallback = callback;
  },

  /**
   * Get number of labels in queue
   * @returns {number} Number of labels in queue
   * @example
   * console.log("Labels in queue: " + webaep.getLabelCount())
   */
  getLabelCount() {
    return internalState.printQty;
  },

  /**
   * @callback labelCountCallback
   * @param {number} labelCount Number of labels left in queue.
   */

  /**
   * Callback called after each label in batch.
   * @param {labeCountCallback} callback
   * @example
   * webaep.setLabelCountCallback((labelCount) => console.log("Labels in queue: " + labelCount))
   */
  setLabelCountCallback(callback) {
    labelCountCallback = callback;
  },

  /**
   * @callback batchDoneCallback
   */

  /**
   * Callback called whenever a batch finishes printing.
   * @param {batchDoneCallback} callback
   * @example
   * webaep.setPrintDoneCallback(() => console.log("Print job finished!"))
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
   * @example
   * webaep.setErrorCallback(error => {
   *     console.log(error.message + '\nCode: ' + error.code)
   * })
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
   * Make sure to empty the scan buffer using `hasScanData` and `getScanData` methods before setting a callback.
   * After a callback has been set, incoming scan data will no longer be buffered.
   * Call with `undefined` or `null` to clear the callback and start buffring data again.
   * @param {scannerCallback} callback
   * @example
   * // Empty buffer
   * while (webaep.hasScanData()) {
   *     console.log(webaep.getScanData())
   * }
   *
   * // Set a scanner callback.
   * webaep.setScannerCallback(scanData => console.log(scanData))
   *
   * // Make sure to remove the callback when leaving the screen
   * webaep.setScannerCallback(undefined)
   */
  setScannerCallback(callback) {
    scannerCallback = callback;
  },

  /**
   * Checks if there's data in the scan buffer.
   * Note that if a callback is set with `setScannerCallback` incoming scanner data will no longer be buffered.
   * @returns {boolean} Whether there is data in the scan buffer.
   */
  hasScanData() {
    return scanData.length > 0;
  },

  /**
   * Get scan data.
   * Note that if a callback is set with `setScannerCallback` incoming scanner data will no longer be buffered.
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
   * Callback called when a live variable has been modified in the Lua layer.
   * @param {variablesCallback} callback
   * @example
   * // In Lua
   * // LiveVar has the checkbox "Propagate changes automatically" ticked in AEP Works 3
   * Variables.LiveVar = "Hello World!"
   *
   * // In JavaScript
   * webaep.setVariablesCallback(variables => console.log(variables.LiveVar))
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
   * @example
   * // In Lua
   * local messageType = systemMgmt.getGuiEnums().messageTypeEnum
   * local data = {
   *     type = messageType.webAepUserData,
   *     data = "Hello World!"
   * }
   * device.sendto(device.path.ima, json.encode(data) .. "\n")
   *
   * // In JavaScript
   * webaep.setUserDataCallback(data => console.log(data))
   */
  setUserDataCallback(callback) {
    userDataCallback = callback;
  },

  /**
   * Retrieves variables from printer.
   * @returns {Object} Key-value pairs of all application variables.
   * @example
   * const variables = await webaep.fetchVariables()
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
   * @example
   * webaep.saveVariables({
   *     Var1: "Hello",
   *     Var2: "World!"
   * })
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
   * @example
   * webaep.printByName("Label1", {
   *     quantity: 2
   * })
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

        success === null || success === void 0 ? void 0 : success(raw);
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
   * @example
   * webaep.print({
   *     name: "Label1",
   *     type: "label",
   *     design_width: 960,
   *     design_height: 960,
   *     fields: [{
   *             fieldtype: "text",
   *             name: "Text1",
   *             value: "Hello",
   *             hPos: 320,
   *             vPos: 230
   *         }, {
   *             fieldtype: "text",
   *             name: "Text2",
   *             value: "World!",
   *             hPos: 320,
   *             vPos: 390
   *         }
   *     ]
   * })
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

        success === null || success === void 0 ? void 0 : success(raw);
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
   * @example
   * const imgData = await webaep.previewByName("Label1")
   * document.getElementById("preview").src = imgData
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
   * @example
   * const imgData = await webaep.preview({
   *     name: "Label1",
   *     type: "label",
   *     design_width: 960,
   *     design_height: 960,
   *     fields: [{
   *             fieldtype: "text",
   *             name: "Text1",
   *             value: "Hello",
   *             hPos: 320,
   *             vPos: 230
   *         }, {
   *             fieldtype: "text",
   *             name: "Text2",
   *             value: "World!",
   *             hPos: 320,
   *             vPos: 390
   *         }
   *     ]
   * })
   * document.getElementById("preview").src = imgData
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
   * @param {Object} options Query parameters.
   * @param {number} options.rows Number of rows to retrieve. (Default: 30)
   * @param {number} options.offset Use to fetch more rows in conjukction with rows. (Default: 0)
   * @param {string} options.index Index column.
   * @param {string} options.sortBy Alphabetically sort by this column.
   * @param {string} options.search Search term for index or sortBy columns.
   * @param {string} options.filter Filter expression. See STL00426.
   * @param {boolean} options.distinct Whether to only retrieve unique rows.
   * @returns {Object[]} Array of rows as key-value pairs `[{ "column": "value", ...}, ...]`.
   * @example
   * // Fetch the first 30 rows from "ProductTable"
   * const rows = await webaep.fetchTableRows("ProductTable")
   *
   * // Fetch another 30 rows
   * const rows = await webaep.fetchTableRows("ProductTable", {
   *     offset: 30
   * })
   *
   * // Fetch rows matching search string
   * const rows = await webaep.fetchTableRows("ProductTable", {
   *     index: "Desc1",
   *     search: "Danish"
   * })
   *
   * // Fetch unique categories
   * const rows = await webaep.fetchTableRows("ProductTable", {
   *     columns: ["Category"],
   *     distinct: true
   * })
   *
   * // Fetch rows in category
   * const rows = await webaep.fetchTableRows("ProductTable", {
   *     filter: "IN('Category', 'Pastries')"
   * })
   */
  fetchTableRows(tableName, options = {}) {
    return _asyncToGenerator(function* () {
      options.tableName = tableName;
      const res = yield get('/webaep/table', options);
      return res;
    })();
  },

  /**
   * Get list of available keys
   * @returns Keys enum
   */
  getKeysEnum() {
    return keysEnum;
  },

  /**
   * Send keypress to printer
   * @param {number} key
   * @example
   * const keys = webaep.getKeysEnum()
   *
   * // Pause current print job
   * webaep.sendKey(keys.OFFLINE)
   * ...
   * // Resume print job
   * webaep.sendKey(keys.ONLINE)
   * ...
   * // Cancel print job
   * webaep.sendKey(keys.CANCEL)
   */
  sendKey(key) {
    if (typeof key == "number" && keysEnum[key] != null) {
      websocket.send(JSON.stringify({
        type: msgType.vkey,
        data: key
      }));
    }
  }

};
exports.default = _default;

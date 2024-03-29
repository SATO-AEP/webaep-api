/**
 * A module for interfacing with the printer side of a SATO Web AEP application
 * @module sato
 */

// const DEBUG = true;
let baseURL;
let wsURL;
let isLocalClient = false;

let originalIsPrinter

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
	setBaseURL('localhost');
	// eslint-disable-next-line no-undef
	originalIsPrinter = sato.isPrinter;
} else {
	setBaseURL(window.location.host);
}

// Scan queue
const SCAN_QUEUE_SIZE = 10;
const scanData = [];

// Cached translated error messages
const errors = {};

// Global callbacks
let printDoneCallback;
let scannerCallback;
let errorCallback;
let variablesCallback;
let userDataCallback;

// Batch callbacks
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

async function get(url, options = {}) {
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

	const raw = await fetch(url);
	const res = await raw.json();

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
}

async function post(url, options = {}) {
	const raw = await fetch(baseURL + url, {
		method: 'POST',
		body: JSON.stringify(options)
	});
	const res = await raw.json();

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
}

let msgType = {};
async function handleMessage(msg) {
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

		case msgType.ERROR: {
			if (errors[msg.data] == null) {
				const localized = await get('/localization', {
					strings: [msg.data]
				});
				errors[msg.data] = localized[msg.data];
			}
			const error = { code: msg.data, message: errors[msg.data] }
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

		case msgType.extChar: {
			let chars = msg.data;
			if (!Array.isArray(chars))
				chars = [chars];
			const string = chars.map(c => String.fromCharCode(c)).join("");
			if (typeof scannerCallback == "function") {
				scannerCallback(string);
			} else {
				if (scanData.length >= SCAN_QUEUE_SIZE)
					scanData.shift();
				scanData.push(string);
			}
			break;
		}

		case msgType.webAepVariables: {
			let variables = msg.data;
			if (typeof variablesCallback == "function") {
				variablesCallback(variables);
			}
			break;
		}

		case msgType.webAepUserData: {
			let data = msg.data;
			if (typeof userDataCallback == "function") {
				userDataCallback(data);
			}
			break;
		}

		case msgType.ARRAY:
			for (const d of msg.data) {
				handleMessage({type: d[0], data: d[1]});
			}
			break;
	}
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
		}

		if(typeof DEBUG != "undefined" && !dbgIgnore[msg.etype]) {
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

async function connect() {
	if (typeof websocket != 'undefined') {
		websocket.close();
	}

	const enums = await get('/rest/enums');
	msgType = enums.messageTypeEnum;

	websocket = await wsConnect();
	if (isLocalClient) {
		// Tell backend we're a local client (don't worry, this makes perfect sense)
		websocket.send(JSON.stringify({type: msgType.KBDSLEEP, data: "l:1"}));
	}
	websocket.onmessage = onMessage;
}

export default {
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
	 * Set printer IP and open a WebSocket connection to receive status callbacks.
	 * If no IP is specified the connection will be made to `localhost` if running locally on a SATO printer, otherwise to `window.location.host`.
	 * @param {string} ip Printer IP.
	 * @example
	 * // Web app hosted on the printer, connect to localhost or window.location.host
	 * sato.connect()
	 *
	 * // When debugging a web app hosted on your PC or an external server it can be useful to specify the IP
	 * const IP = sato.isPrinter ? undefined : "192.168.0.123"
	 * sato.connect(IP)
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
	 * @example
	 * sato.setPrintDoneCallback(() => console.log("Print job finished!"))
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
	 * sato.setErrorCallback(error => {
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
	 * while (sato.hasScanData()) {
	 *     console.log(sato.getScanData())
	 * }
	 *
	 * // Set a scanner callback.
	 * sato.setScannerCallback(scanData => console.log(scanData))
	 *
	 * // Make sure to remove the callback when leaving the screen
	 * sato.setScannerCallback(undefined)
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
	 * sato.setVariablesCallback(variables => console.log(variables.LiveVar))
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
	 * sato.setUserDataCallback(data => console.log(data))
	 */
	setUserDataCallback(callback) {
		userDataCallback = callback;
	},

	/**
	 * Retrieves variables from printer.
	 * @returns {Object} Key-value pairs of all application variables.
	 * @example
	 * const variables = await sato.fetchVariables()
	 */
	async fetchVariables() {
		const vars = await get('/webaep/data');
		return vars;
	},

	/**
	 * Sets, evaluates and retrieves variables from printer.
	 * @param {Object} variables Key-value pairs of variables to set and evaluate.
	 * @returns {Object} Key-value pairs of all application variables.
	 * @example
	 * sato.saveVariables({
	 *     Var1: "Hello",
	 *     Var2: "World!"
	 * })
	 */
	async saveVariables(variables) {
		const vars = await post('/webaep/data', variables);
		return vars;
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
	 * @example
	 * sato.printByName("Label1", {
	 *     quantity: 2
	 * })
	 */
	async printByName(formatName, options = {}) {
		options.formatName = formatName;
		options.quantity = options.quantity ?? 1;
		const success = options.success;
		options.success = raw => {
			if (raw.ok) {
				hookBatchCallbacks(options);
			}
			if (typeof success == "function") {
				success(raw);
			}
		}
		const res = await post('/webaep/print', options);

		return res;
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
	 * sato.print({
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
	async print(formatData, options = {}) {
		options.formatData = formatData;
		options.quantity = options.quantity ?? 1;
		const success = options.success;
		options.success = raw => {
			if (raw.ok) {
				hookBatchCallbacks(options);
			}
			if (typeof success == "function") {
				success(raw);
			}
		}
		const res = await post('/webaep/print', options);

		return res;
	},

	/**
	 * Preview pre-installed format with name `formatName`.
	 * @param {string} formatName Name of pre-installed format to preview.
	 * @param {Object} options.data Key-value pairs of application variables to set and evaluate.
	 * @returns {string} Label bitmap as a base64 string.
	 * @example
	 * const imgData = await sato.previewByName("Label1")
	 * document.getElementById("preview").src = imgData
	 */
	async previewByName(formatName, options = {}) {
		options.formatName = formatName;
		const res = await post('/webaep/preview', options);
		return res.image;
	},

	/**
	 * Preview format `formatData`.
	 * @param {Object} formatData Format to print as JSON.
	 * @param {Object} options.data Key-value pairs of application variables to set and evaluate.
	 * @returns {string} Label bitmap as a base64 string.
	 * @example
	 * const imgData = await sato.preview({
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
	async preview(formatData, options = {}) {
		options.formatData = formatData;
		const res = await post('/webaep/preview', options);
		return res.image;
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
	 * const rows = await sato.fetchTableRows("ProductTable")
	 *
	 * // Fetch another 30 rows
	 * const rows = await sato.fetchTableRows("ProductTable", {
	 *     offset: 30
	 * })
	 *
	 * // Fetch rows matching search string
	 * const rows = await sato.fetchTableRows("ProductTable", {
	 *     index: "Desc1",
	 *     search: "Danish"
	 * })
	 *
	 * // Fetch unique categories
	 * const rows = await sato.fetchTableRows("ProductTable", {
	 *     columns: ["Category"],
	 *     distinct: true
	 * })
	 *
	 * // Fetch rows in category
	 * const rows = await sato.fetchTableRows("ProductTable", {
	 *     filter: "IN('Category', 'Pastries')"
	 * })
	 */
	async fetchTableRows(tableName, options = {}) {
		options.tableName = tableName;
		const res = await get('/webaep/table', options);
		return res;
	}
}

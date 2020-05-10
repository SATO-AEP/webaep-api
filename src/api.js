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
	originalIsPrinter = sato.isPrinter;
} else {
	setBaseURL(window.location.hostname);
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
	 * Set printer IP and open a WebSocket connection.
	 * If no IP is specified the connection will be made either to `localhost` if running locally, otherwise to `window.location.hostname`.
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
	 * Retrieves variables from printer.
	 * @returns {Object} Key-value pairs of all application variables.
	 */
	async fetchVariables() {
		const vars = await get('/webaep/data');
		return vars;
	},

	/**
	 * Sets, evaluates and retrieves variables from printer.
	 * @param {Object} variables Key-value pairs of variables to set and evaluate.
	 * @returns {Object} Key-value pairs of all application variables.
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
	 * @param {Object} formatData Format to print as JSON.
	 * @param {number} options.quantity Number of labels to print.
	 * @param {Object} options.data Key-value pairs of application variables to set and evaluate.
	 * @param {successCallback} options.success Print request successful callback.
	 * @param {errorCallback} options.error Print request error callback.
	 * @param {labelCountCallback} options.labelCount Label printed callbck.
	 * @param {batchDoneCallback} options.batchDone Batch done callback.
	 * @param {printerErrorCallback} options.batchError Callback for each error that occurs until batch done.
	 * @returns {Object} Request result.
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
	 */
	async preview(formatData, options = {}) {
		options.formatData = formatData;
		const res = await post('/webaep/preview', options);
		return res.image;
	},

	/**
	 * Retrieve rows from table with name `tableName`.
	 * @param {string} tableName Name of table to fetch rows from.
	 * @options {Object} Query parameters.
	 * @returns {Object[]} Array of rows as key-value pairs `[{ "column": "value", ...}, ...]`.
	 */
	async fetchTableRows(tableName, options = {}) {
		options.tableName = tableName;
		const res = await get('/webaep/table', options);
		return res;
	}
}

# SATO Web AEP API

A JavaScript wrapper for the Web AEP HTTP API, with additional functions for receiving printer status and scanner data.

## Usage
### Projects with a build system
If you have a project setup with npm and webpack or similar.

Add a dependency to your `package.json`.

`npm install SATO-AEP/webaep-api`

And then import where needed.

`import api from 'webaep-api'`

*Alternatively*, if you prefer working with the untranspiled code, simply copy the `src/api.js` file from this repo into your project and import it. E.g.:

`import api from 'libs/api.js'`

**Note:** The printer browser is running Chrome version 53 so make sure to configure Babel accordingly.

### Project without a build system
To use the library without a build system, grab the latest pre-built version from the release section, or see the build instructions below.

The pre-built version can be included in your project as a script tag in your `index.html`. E.g.:

`<script src="libs/webaep-api.min.js"></script>`

This will attach the API to the global `webaep` object.

## Build

Make sure that node is installed. Then enter the project directory and run `npm install` to download all dependencies.

To build a pre-transpiled, minified library, run `npm run build`.

To build a non-minified development library, run `npm run dev`.

## Documentation

The API is documented using jsdoc. The compiled documentation comes in two versions, HTML and Markdown.

To build the HTML documentation, run `npm run jsdoc`.

To build the Markdown documentation, run `npm run jsdoc2md`.

## Changelog

### 2.0.0
* Breaking API change. `isPrinter` is now a function and needs to be called as such. I.e. replace all occurences of `isPrinter` with `isPrinter()`.
* Breaking change for pre-built libraries. The API now attaches to `window.webaep` since `window.sato` is read-only in certain environments. The documentation has been updated to reflect this.
### 1.2.1
* Use the correct WebSocket port when running in PSim.
### 1.2.0
* Additions to help when implementing a custom printing screen:

    * Methods for retrieving printer state: `getPrinterState` and `getLabelCount`
    * Method to trigger key presses to pause/resume/cancel print job: `sendKey` and `getKeysEnum`
    * New callbacks: `setStateCallback` and `setLabelCountCallback`
### 1.1.1
* Changed default IP from `window.location.hostname` to `window.location.host` which includes the port.

### 1.1.0

* Added `setVariablesCallback` and `setUserDataCallback`.

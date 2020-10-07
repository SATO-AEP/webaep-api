# SATO Web AEP API

A JavaScript wrapper for the Web AEP HTTP API, with additional functions for receiving printer status and scanner data.

## Usage
### Projects with a build system
If you have a project setup with webpack or similar, with a transpilation step using Babel, copy the `src/api.js` file into your project and import it. E.g.:

`import api as * from 'libs/api.js';`

**Note:** The printer browser is running Chrome version 53 so make sure to configure Babel accordingly.

### Project without a build system
To use the library without Babel, grab the latest pre-transpiled version from the release section, or see the build instructions below.

The pre-transpiled version can be included in your project as a script tag in your `index.html`. E.g.:

`<script src="libs/sato-api.min.js">`

This will attach the API to the global `sato` object.

## Build

Make sure that node is installed. Then enter the project directory and run `npm install` to download all dependencies.

To build a pre-transpiled, minified library, run `npm run build`.

To build a non-minified development library, run `npm run dev`.

## Documentation

The API is documented using jsdoc. The compiled documentation comes in two versions, HTML and Markdown.

To build the HTML documentation, run `npm run jsdoc`.

To build the Markdown documentation, run `npm run jsdoc2md`.

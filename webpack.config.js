const path = require('path');
const webpack = require('webpack');

const PACKAGE = require('./package.json');
const banner = PACKAGE.name + ' - v' + PACKAGE.version;

const config = {
	output: {
		filename: PACKAGE.name + '.js',
		path: path.resolve(__dirname, 'dist')
	},
	entry: [
		'./src/index.js'
	],
	devtool: false,
	module: {
		rules: [
			{
				test: /\.js$/,
				exclude: /node_modules/,
				loader: 'babel-loader'
			}
		]
	},
	plugins: [
		new webpack.BannerPlugin(banner)
	]
};

module.exports = (env, argv) => {
	if (argv.mode === 'production') {
		config.output.filename = PACKAGE.name + '.min.js';
	}
	return config;
}

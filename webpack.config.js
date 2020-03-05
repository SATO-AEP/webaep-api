const path = require('path');

module.exports = {
	entry: [
		'./src/index.js'
	],
	output: {
		filename: 'sato-api.js',
		path: path.resolve(__dirname, 'dist')
    },
    devtool: false,
	module: {
		rules: [
			{
				test: /\.js$/,
				exclude: /node_modules/,
				loader: 'babel-loader'
			}
		]
	}
};

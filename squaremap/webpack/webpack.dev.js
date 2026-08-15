/**
 * webpack.dev.js
 * -----------------------------------
 * Development config. Runs webpack-dev-server on port 80.
 * Proxies /tiles and /nodes to the local squaremap web server (default :8080)
 * so tiles and the nodes json files load from a running server.
 */

const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const path = require('path');

const BABEL_OPTIONS = {
	presets: [
		'@babel/preset-env',
		'@babel/preset-react',
	],
	plugins: [
		'@babel/plugin-syntax-dynamic-import',
		'react-refresh/babel',
	],
};

let mainConfig = merge(common, {
	entry: [
		'./bootstrap.js'
	],
	mode: 'development',
	devtool: 'inline-source-map',
	devServer: {
		static: {
			publicPath: '/nodes-editor/',
			directory: path.resolve(__dirname, '..'),
		},
		compress: true,
		port: 80,
		hot: true,
		proxy: [
			{ context: ['/tiles', '/nodes'], target: 'http://localhost:8080' },
		],
	},
	output: {
		path: path.resolve(__dirname, '../build'),
		publicPath: 'http://localhost/nodes-editor/',
		filename: 'js/nodes.js',
		chunkFilename: 'js/nodes.[name].[id].[chunkhash].js',
		library: 'Nodes',
		libraryTarget: 'var',
		libraryExport: 'default'
	},
	module: {
		rules: [
			{
				test: /\.(js|jsx)$/,
				exclude: /node_modules/,
				use: {
					loader: 'babel-loader',
					options: BABEL_OPTIONS,
				}
			},
			{
				test: /\.(png|jpg|gif)$/,
				loader: 'file-loader',
				options: {
					publicPath: 'http://localhost/nodes-editor/images/nodes',
					outputPath: 'images/nodes',
					name: '[name].[ext]'
				}
			},
		]
	},
	plugins: [
		new ReactRefreshWebpackPlugin(),
	]

});

module.exports = mainConfig;

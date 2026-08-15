/**
 * webpack.common.js
 * -----------------------------------
 * Shared config for the squaremap nodes editor.
 * Shared React components are reused from the dynmap editor via
 * resolve.modules (../../dynmap/src); the geometry module is the pure-JS
 * port `src/wasm_main.js`, which shadows `dynmap/wasm/wasm_main.js`
 * (squaremap/src comes before dynmap/wasm in the resolve order) so no
 * Rust/wasm toolchain is needed for the squaremap build.
 */

const path = require('path');
const webpack = require('webpack');

module.exports = {
	context: path.resolve(__dirname, '../src'),
	resolve: {
		modules: [
			path.resolve(__dirname, '../node_modules'), // absolute, so shared ../dynmap/src modules find react etc.
			'node_modules',
			path.resolve(__dirname, '../src'),           // squaremap overrides first
			path.resolve(__dirname, '../../dynmap/src'), // shared react components
			path.resolve(__dirname, '../../dynmap/wasm'), // wasm_bindgen output
		]
	},
	output: {
		globalObject: 'self'
	},
	resolveLoader: {
		modules: [
			path.resolve(__dirname, '../node_modules'),
			'node_modules',
		]
	},
	experiments: {
		asyncWebAssembly: true,
	},
	module: {
		rules: [
			{
				test: /\.css$/,
				use: [
					{ loader: "style-loader" },
					{ loader: "css-loader" }
				]
			},
			{
				test: /\.(svg)$/,
				use: {
					loader: 'svg-url-loader',
					options: {
						noquotes: true
					}
				}
			},
		]
	},
	plugins: [
		new webpack.ProvidePlugin({
			React: 'react',
			FileSaver: 'file-saver',
		})
	],
};

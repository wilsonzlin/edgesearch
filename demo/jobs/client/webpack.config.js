'use strict';

const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const OomlBabelPlugin = require('ooml-babel-plugin');
const OptimizeCssAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const ScriptExtHtmlWebpackPlugin = require('script-ext-html-webpack-plugin');
const StyleExtHtmlWebpackPlugin = require('style-ext-html-webpack-plugin');
const TerserJsPlugin = require('terser-webpack-plugin');
const {join} = require('path');

const resolveRelativeToProject = relativePath => join(__dirname, relativePath);

const TSCONFIG = resolveRelativeToProject('tsconfig.json');
const SRC = resolveRelativeToProject('src');
const SRC_INDEX_TSX = resolveRelativeToProject('src/index.tsx');
const PUBLIC_INDEX_HTML = resolveRelativeToProject('public/index.html');
const BUILD = resolveRelativeToProject('build');

module.exports = (env, options) => ({
  devtool: false,
  entry: SRC_INDEX_TSX,
  output: {
    path: BUILD,
    // Required to fix https://github.com/numical/style-ext-html-webpack-plugin/issues/50, change this value as appropriate.
    publicPath: '/',
    filename: 'index.js',
  },
  resolve: {
    extensions: [
      '.ts',
      '.tsx',
      '.js',
    ],
  },
  module: {
    strictExportPresence: true,
    rules: [
      {
        test: /\.css$/,
        include: SRC,
        use: [
          {loader: MiniCssExtractPlugin.loader},
          {loader: 'css-loader', options: {modules: true}},
        ],
      },
      {
        test: /\.tsx?$/,
        include: SRC,
        use: [
          {
            loader: 'babel-loader',
            options: {
              plugins: [
                '@babel/plugin-syntax-jsx',
                OomlBabelPlugin,
              ],
            },
          },
          {
            loader: 'ts-loader',
            options: {
              configFile: TSCONFIG,
            },
          },
        ],
      },
    ],
  },
  optimization: {
    minimizer: [
      new TerserJsPlugin({
        parallel: true,
        extractComments: false,
        terserOptions: {
          output: {
            comments: false,
          },
        },
      }),
      new OptimizeCssAssetsPlugin({}),
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      inject: true,
      template: PUBLIC_INDEX_HTML,
    }),
    new MiniCssExtractPlugin({
      filename: 'index.css',
    }),
    // We don't want these in development mode, as we use webpack-dev-server with
    // HMR and it won't regenerate the index.html because it doesn't change.
    ...(options.mode === 'development' ? [] : [
      new ScriptExtHtmlWebpackPlugin({
        inline: ['index.js'],
      }),
      new StyleExtHtmlWebpackPlugin(),
    ]),
  ],
});

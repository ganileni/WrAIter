const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  entry: {
    popup: './src/popup/popup.js',
    options: './src/options/options.js',
    content: './src/content/content.js',
    background: './src/background/background.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].bundle.js',
    publicPath: '' // Changed from './' to ensure assets are loaded correctly from extension root
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader', // We'll need to install babel-loader and presets
          options: {
            presets: ['@babel/preset-env']
          }
        }
      },
      {
        test: /\.css$/i,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
        generator: {
            filename: 'assets/icons/[name][ext]'
        },
        exclude: /logo_original\.png$/
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/popup/popup.html',
      filename: 'popup.html',
      chunks: ['popup'],
      inject: 'body'
    }),
    new HtmlWebpackPlugin({
      template: './src/options/options.html',
      filename: 'options.html',
      chunks: ['options'],
      inject: 'body'
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: './src/manifest.json', to: 'manifest.json' },
        { from: './src/content/content.css', to: 'content.css' },
        {
          from: './src/assets/icons/*',
          to: 'assets/icons/[name][ext]',
          globOptions: {
            ignore: ['**/logo_original.png']
          }
        }
      ],
    }),
    new MiniCssExtractPlugin({
        filename: '[name].css'
    })
  ],
  devtool: 'cheap-module-source-map', // Recommended for development
  resolve: {
    extensions: ['.js'] // Ensure .js files are resolved
  }
}; 
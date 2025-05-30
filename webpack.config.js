const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MarkdownIt = require('markdown-it');
const md = new MarkdownIt();
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
        },
        {
          from: './MANUAL.md',
          to: 'MANUAL.html',
          transform(content) {
            const htmlContent = md.render(content.toString());
            // Wrap the markdown HTML in a basic HTML page structure
            return `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>WrAIter User Manual</title>
                  <style>
                      body {
                          font-family: sans-serif;
                          line-height: 1.6;
                          margin: 20px;
                          max-width: 800px;
                          margin: 20px auto;
                          padding: 0 15px;
                          color: #333;
                      }
                      h1, h2, h3, h4, h5, h6 {
                          color: #222;
                          margin-top: 1.5em;
                      }
                      code {
                          font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
                          background-color: #f4f4f4;
                          padding: 2px 4px;
                          border-radius: 4px;
                      }
                      pre code {
                          display: block;
                          padding: 10px;
                          overflow-x: auto;
                          background-color: #f4f4f4;
                          border: 1px solid #ddd;
                          border-radius: 5px;
                      }
                      a {
                          color: #0066cc;
                          text-decoration: none;
                      }
                      a:hover {
                          text-decoration: underline;
                      }
                      ul, ol {
                          margin-bottom: 1em;
                      }
                  </style>
              </head>
              <body>
                  ${htmlContent}
              </body>
              </html>
            `;
          },
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
const path = require('path');

module.exports = {
  mode: 'development',
  devtool: 'cheap-module-source-map',
  entry: './popup/popup.jsx',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'popup'),
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
          },
        },
      },
      {
        // Rule for CSS files (including Tailwind)
        test: /\.css$/,
        use: [
          'style-loader', // Injects CSS into the DOM
          'css-loader',   // Interprets @import and url() like import/require()
          {
            loader: 'postcss-loader', // Processes CSS with PostCSS (Tailwind, Autoprefixer)
            options: {
              postcssOptions: {
                config: path.resolve(__dirname, 'postcss.config.js'), // Point to our PostCSS config
              },
            },
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx'],
  },
};

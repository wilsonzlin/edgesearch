const fs = require('fs');
const path = require('path');
const terser = require('terser');

const src = fs.readFileSync(path.join(__dirname, 'dist', 'main.js'), 'utf8');

const {error, warnings, code} = terser.minify(`(() => {${src}})()`, {
  mangle: true,
  compress: {
    booleans: true,
    collapse_vars: true,
    comparisons: true,
    conditionals: true,
    dead_code: true,
    drop_console: true,
    drop_debugger: true,
    evaluate: true,
    hoist_funs: true,
    hoist_vars: false,
    if_return: true,
    join_vars: true,
    keep_fargs: false,
    keep_fnames: false,
    loops: true,
    negate_iife: true,
    properties: true,
    reduce_vars: true,
    sequences: true,
    unsafe: true,
    unused: true,
  },
  warnings: true,
});

if (error) {
  throw error;
}
if (warnings) {
  warnings.forEach(console.warn);
}
fs.writeFileSync(path.join(__dirname, 'dist', 'main.js'), code);

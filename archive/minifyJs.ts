import terser from 'terser';

export const minifyJs = (js: string): string => {
  const {error, warnings, code} = terser.minify(js, {
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

  if (!code) {
    throw new Error(`Failed to minify`);
  }

  if (warnings) {
    warnings.forEach(console.log);
  }

  return code;
};

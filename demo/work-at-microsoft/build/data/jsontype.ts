import * as fs from 'fs';

const tsProp = (raw: string) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(raw) ? `["${raw}"]` : raw;

export const generateTypeDefinition = (val: unknown): string => {
  switch (typeof val) {
  case 'undefined':
  case 'boolean':
  case 'number':
  case 'string':
  case 'function':
  case 'symbol':
  case 'bigint':
    return typeof val;
  case 'object':
    if (val == null) {
      return 'null';
    }
    if (Array.isArray(val)) {
      if (val.length == 0) {
        console.warn(`Found empty array`);
      }
      return `${generateTypeDefinition(val[0])}[]`;
    }
    if (Object.getPrototypeOf(val) == Object.prototype) {
      return `{\n${Object.entries(val).map(([prop, val]) => `${tsProp(prop)}: ${generateTypeDefinition(val)}`).join(';\n')}\n}`;
    }
    // Fall through.
  default:
    throw new TypeError(`Unrecognised value of type ${typeof val}: ${JSON.stringify(val)}`);
  }
};

if (require.main === module) {
  console.log(generateTypeDefinition(JSON.parse(fs.readFileSync(0, 'utf-8'))));
}

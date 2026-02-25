import { camelCase } from 'lodash';

const moduleName = './plugins/runtime-plugin.js';

export function run(input) {
  return camelCase(input);
}

export async function loadRuntimePlugin() {
  return import(moduleName);
}

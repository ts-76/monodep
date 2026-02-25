import chalk from 'chalk';
import { camelCase } from 'lodash';

export function fromA(value) {
  return chalk.green(camelCase(value));
}

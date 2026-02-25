import chalk from 'chalk';
import { kebabCase } from 'lodash';

export function fromB(value) {
  return chalk.blue(kebabCase(value));
}

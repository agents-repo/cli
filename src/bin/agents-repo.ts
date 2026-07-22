#!/usr/bin/env node
import { runCli } from '../modules/cli/presentation/runCli.js';

try {
  await runCli(process.argv);
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
}

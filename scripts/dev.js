import { spawn } from 'node:child_process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(label, args) {
  const child = spawn(npmCmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  child.on('exit', (code) => {
    if (code && !shuttingDown) process.exitCode = code;
  });

  return child;
}

let shuttingDown = false;
const children = [
  run('backend', ['--prefix', 'backend', 'run', 'dev']),
  run('frontend', ['--prefix', 'frontend', 'run', 'dev'])
];

function stop() {
  shuttingDown = true;
  for (const child of children) child.kill();
}

process.on('SIGINT', () => {
  stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stop();
  process.exit(0);
});

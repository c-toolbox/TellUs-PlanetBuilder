import { exec } from 'child_process';
import WriteNeuConfig from './write-neu-config';

WriteNeuConfig();
const vite = exec('vite');
vite.stdout?.pipe(process.stdout);

const neu = exec('neu run -- --window-enable-inspector=true');
neu.stdout?.pipe(process.stdout);
neu.stderr?.pipe(process.stderr);
neu.on('close', () => {
	vite.kill();
	process.exit();
});

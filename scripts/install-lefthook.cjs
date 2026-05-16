const { execSync } = require('child_process');

try {
	execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
	execSync('lefthook install', { stdio: 'inherit' });
} catch (error) {
	console.log('Skipping lefthook install: not a git repository');
}

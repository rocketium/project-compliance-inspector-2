#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = fs.realpathSync(path.resolve(__dirname, '..'));
const ignoredDirectories = new Set(['node_modules', '.git']);

const dependencyFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const nonRegistrySpecPattern =
	/^(?:file:|link:|workspace:|github:|git\+|https?:|npm:(?:@[^/]+\/)?[^@]+@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?).*/;

const violations = [];

const isInsideRepo = filePath => {
	const relativePath = path.relative(repoRoot, filePath);
	return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
};

const assertSafePackageJsonPath = packageJsonPath => {
	const resolvedPath = fs.realpathSync(packageJsonPath);

	if (!isInsideRepo(resolvedPath) || path.basename(resolvedPath) !== 'package.json') {
		throw new Error(`Refusing to read unsafe package.json path: ${packageJsonPath}`);
	}

	return resolvedPath;
};

const findPackageJsonFiles = directory => {
	const packageJsonFiles = [];

	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const entryPath = path.resolve(directory, entry.name);
		const relativePath = path.relative(directory, entryPath);

		if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) continue;

		if (entry.isDirectory()) {
			if (!ignoredDirectories.has(entry.name)) packageJsonFiles.push(...findPackageJsonFiles(entryPath));
			continue;
		}

		if (entry.isFile() && entry.name === 'package.json') packageJsonFiles.push(entryPath);
	}

	return packageJsonFiles;
};

const checkVersion = (path, version) => {
	if (exactVersionPattern.test(version) || nonRegistrySpecPattern.test(version)) return;

	violations.push(`${path}: ${version}`);
};

const checkOverrideVersions = (overrides, pathPrefix) => {
	for (const [name, value] of Object.entries(overrides)) {
		const childPath = `${pathPrefix}.${name}`;

		if (typeof value === 'string') {
			checkVersion(childPath, value);
			continue;
		}

		checkOverrideVersions(value, childPath);
	}
};

const checkPackageJson = packageJsonPath => {
	const safePackageJsonPath = assertSafePackageJsonPath(packageJsonPath);
	const packageJson = JSON.parse(fs.readFileSync(safePackageJsonPath, 'utf8'));
	const relativePackageJsonPath = path.relative(repoRoot, safePackageJsonPath) || 'package.json';

	for (const field of dependencyFields) {
		const dependencies = packageJson[field];

		if (!dependencies) continue;

		for (const [name, version] of Object.entries(dependencies)) {
			checkVersion(`${relativePackageJsonPath}.${field}.${name}`, version);
		}
	}

	if (packageJson.overrides) checkOverrideVersions(packageJson.overrides, `${relativePackageJsonPath}.overrides`);
};

for (const packageJsonPath of findPackageJsonFiles(repoRoot)) {
	checkPackageJson(packageJsonPath);
}

if (violations.length > 0) {
	console.error('package.json dependency versions must be exact (no ^, ~, *, ranges, latest):');
	console.error(violations.map(violation => `  - ${violation}`).join('\n'));
	process.exit(1);
}

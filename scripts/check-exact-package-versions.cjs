#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = fs.realpathSync(path.resolve(__dirname, '..'));
const ignoredDirectories = new Set(['node_modules', '.git']);
const maxDirectoryDepth = 100;
const maxOverrideDepth = 100;

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
	const directoriesToVisit = [{ directory, depth: 0 }];
	const visitedDirectories = new Set();

	while (directoriesToVisit.length > 0) {
		const { directory: currentDirectory, depth } = directoriesToVisit.pop();
		const realDirectory = fs.realpathSync(currentDirectory);

		if (!isInsideRepo(realDirectory)) {
			throw new Error(`Refusing to scan unsafe directory path: ${currentDirectory}`);
		}

		if (visitedDirectories.has(realDirectory)) continue;
		visitedDirectories.add(realDirectory);

		if (depth > maxDirectoryDepth) {
			throw new Error(`Refusing to scan directory tree deeper than ${maxDirectoryDepth}: ${currentDirectory}`);
		}

		for (const entry of fs.readdirSync(currentDirectory, { withFileTypes: true })) {
			const entryPath = path.resolve(currentDirectory, entry.name);
			const relativePath = path.relative(currentDirectory, entryPath);

			if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) continue;

			if (entry.isDirectory()) {
				if (!ignoredDirectories.has(entry.name)) directoriesToVisit.push({ directory: entryPath, depth: depth + 1 });
				continue;
			}

			if (entry.isFile() && entry.name === 'package.json') packageJsonFiles.push(entryPath);
		}
	}

	return packageJsonFiles;
};

const checkVersion = (path, version) => {
	if (exactVersionPattern.test(version) || nonRegistrySpecPattern.test(version)) return;

	violations.push(`${path}: ${version}`);
};

const checkOverrideVersions = (overrides, pathPrefix) => {
	const objectsToCheck = [{ value: overrides, pathPrefix, depth: 0 }];
	const visitedObjects = new WeakSet();

	while (objectsToCheck.length > 0) {
		const { value: currentValue, pathPrefix: currentPathPrefix, depth } = objectsToCheck.pop();

		if (!currentValue || typeof currentValue !== 'object') continue;

		if (visitedObjects.has(currentValue)) continue;
		visitedObjects.add(currentValue);

		if (depth > maxOverrideDepth) {
			throw new Error(`Refusing to scan overrides deeper than ${maxOverrideDepth}: ${currentPathPrefix}`);
		}

		for (const [name, value] of Object.entries(currentValue)) {
			const childPath = `${currentPathPrefix}.${name}`;

			if (typeof value === 'string') {
				checkVersion(childPath, value);
				continue;
			}

			objectsToCheck.push({ value, pathPrefix: childPath, depth: depth + 1 });
		}
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

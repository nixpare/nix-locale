#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import url from 'url';

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = (await inquirer.prompt([
	{
		type: 'input',
		name: 'projectRoot',
		message: `Project root`,
		default: 'src'
	},
])).projectRoot

const helperModuleDir = `${projectRoot}/nix-locale`

const importPath = (await inquirer.prompt([
	{
		type: 'input',
		name: 'importPath',
		message: `Import path for exported locale defininitions (import { DEFAULT_LOCALE, useLocale, type LocaleType })`,
		default: `${projectRoot}/hooks/locale`
	},
])).importPath

const templatePath = path.resolve(__dirname, '../src/templates/helper.tpl.tsx')
const helperModulePath = `${helperModuleDir}/helper.tsx`

if (!fs.existsSync(helperModuleDir)) {
	fs.mkdirSync(helperModuleDir, { recursive: true })
}

let template = fs.readFileSync(templatePath, 'utf8')
template = template.replace('__LOCALE_IMPORT_PATH__', importPath)

fs.writeFileSync(helperModulePath, template, 'utf8');

// Log a success message to the console
console.log(`✅ Helper file successfully created at ${helperModulePath}`);

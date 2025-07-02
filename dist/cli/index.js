#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import url from 'url';
import { relativePath } from '../utils/path.js';
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = (await inquirer.prompt([
    {
        type: 'input',
        name: 'projectRoot',
        message: `Project root:`,
        default: 'src'
    },
])).projectRoot;
const helperModuleDir = path.resolve(`${projectRoot}/nix-locale`);
if (!fs.existsSync(helperModuleDir)) {
    fs.mkdirSync(helperModuleDir, { recursive: true });
}
const importPath = (await inquirer.prompt([
    {
        type: 'input',
        name: 'importPath',
        message: `Import path for exported locale defininitions:`,
        default: `${projectRoot}/hooks/locale`
    },
])).importPath;
const templatePathPrefix = '../../src/templates/helper.tpl';
const helperModulePathPrefix = `${helperModuleDir}/helper`;
const relativeImportPath = relativePath(path.resolve(helperModuleDir), path.resolve(importPath));
const tsTemplatePath = path.resolve(__dirname, `${templatePathPrefix}.ts`);
const tsHelperModulePath = `${helperModulePathPrefix}.ts`;
const jsTemplatePath = path.resolve(__dirname, `${templatePathPrefix}.js`);
const jsHelperModulePath = `${helperModulePathPrefix}.js`;
const typesTemplatePath = path.resolve(__dirname, `${templatePathPrefix}.d.ts`);
const typesHelperModulePath = `${helperModulePathPrefix}.d.ts`;
const isTS = (await inquirer.prompt([
    {
        type: 'list',
        name: 'isTS',
        message: `Choose language:`,
        choices: ['TypeScript', 'JavaScript']
    },
])).isTS === 'TypeScript';
if (isTS) {
    let template = fs.readFileSync(tsTemplatePath, 'utf8');
    template = template.replace('__LOCALE_IMPORT_PATH__', relativeImportPath);
    fs.writeFileSync(tsHelperModulePath, template, 'utf8');
}
else {
    let template = fs.readFileSync(jsTemplatePath, 'utf8');
    template = template.replace('__LOCALE_IMPORT_PATH__', relativeImportPath);
    fs.writeFileSync(jsHelperModulePath, template, 'utf8');
    template = fs.readFileSync(typesTemplatePath, 'utf8');
    template = template.replace('__LOCALE_IMPORT_PATH__', relativeImportPath);
    fs.writeFileSync(typesHelperModulePath, template, 'utf8');
}
// Log a success message to the console
console.log(`✅ Helper file successfully created at ${helperModulePathPrefix}`);

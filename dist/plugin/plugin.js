import { parse } from '@babel/parser';
import { default as traverse } from '@babel/traverse';
import { generate } from '@babel/generator';
import * as t from '@babel/types';
import { createFilter } from '@rollup/pluginutils';
import path from 'path';
import fs from 'fs';
import url from 'url';
import fg from 'fast-glob';
import { relativePath } from '../utils/path.js';
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// @ts-ignore
if (!globalThis.__NIX_LOCALE_STATE__)
    globalThis.__NIX_LOCALE_STATE__ = {
        version: 0,
        translations: new Map()
    };
const staticHelper = 't';
const hookHelper = 'useT';
const componentHelper = 'T';
const useLocaleName = 'useLocale';
const componentPrefix = "NixLocale";
const hookPrefix = "useNixLocale";
const reactImportAlias = t.identifier("NixLocale_React");
const useLocaleImportAlias = t.identifier("NixLocale_useLocale");
const virtualModulePrefix = 'virtual:@nixpare/nix-locale';
export default function nixLocalePlugin(options) {
    let root;
    const includeOption = options.include || ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'];
    const filter = createFilter(includeOption, options.exclude || 'node_modules/**/*');
    const locales = options.locales;
    const defaultLocale = options.default;
    const useLocaleImportPath = path.resolve(options.useLocaleImportPath || 'src/hooks/locale');
    const virtualModules = {};
    // @ts-ignore
    const context = globalThis.__NIX_LOCALE_STATE__;
    locales.forEach(locale => {
        if (!context.translations.has(locale)) {
            context.translations.set(locale, new Map());
        }
    });
    const generateLocalesModules = async (...files) => {
        if (files.length == 0) {
            files = await fg(includeOption, { cwd: root, absolute: true });
        }
        for (const id of files) {
            if (!filter(id))
                continue;
            const code = await fs.promises.readFile(id, 'utf-8');
            const ast = parse(code, {
                sourceType: 'module',
                plugins: ['typescript', 'jsx'],
            });
            let translationCount = 0;
            // @ts-ignore
            traverse.default(ast, {
                JSXElement(nodePath) {
                    if (!t.isJSXIdentifier(nodePath.node.openingElement.name, { name: componentHelper })) {
                        return;
                    }
                    const [componentBase, key] = componentKey(id, translationCount++, context.version);
                    // locale => localized_value
                    const translationElements = {};
                    let scope = '';
                    nodePath.node.openingElement.attributes.forEach(attr => {
                        if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) {
                            return;
                        }
                        if (attr.name.name === 'scope') {
                            if (!t.isStringLiteral(attr.value)) {
                                console.error(`[@nixpare/nix-locale] Error at ${id}:${attr.loc?.start.line ?? 'undefined'} : scope attribute must be a string literal`);
                                return;
                            }
                            scope = attr.value.value;
                            return;
                        }
                        if (!locales.includes(attr.name.name)) {
                            return;
                        }
                        if (t.isStringLiteral(attr.value) || t.isJSXElement(attr.value) || t.isJSXFragment(attr.value)) {
                            translationElements[attr.name.name] = attr.value;
                        }
                        else if (t.isJSXExpressionContainer(attr.value) && !t.isJSXEmptyExpression(attr.value.expression)) {
                            translationElements[attr.name.name] = attr.value.expression;
                        }
                        else {
                            console.error(`[@nixpare/nix-locale] Error at ${id}:${attr.loc?.start.line ?? 'undefined'} : invalid expression ${attr.value?.type}`);
                            return;
                        }
                    });
                    Object.entries(translationElements).forEach(([locale, expr]) => {
                        const localeMap = context.translations.get(locale);
                        if (!localeMap.has(scope)) {
                            localeMap.set(scope, new Map());
                        }
                        localeMap.get(scope).set(componentBase, { key, value: expr });
                    });
                },
                CallExpression(nodePath) {
                    if (!t.isIdentifier(nodePath.node.callee, { name: hookHelper })) {
                        return;
                    }
                    if (!t.isObjectExpression(nodePath.node.arguments[0])) {
                        return;
                    }
                    const [componentBase, key] = componentKey(id, translationCount++, context.version);
                    // locale => localized_value
                    const translationElements = {};
                    nodePath.node.arguments[0].properties.forEach(prop => {
                        if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) {
                            return;
                        }
                        if (!locales.includes(prop.key.name)) {
                            return;
                        }
                        if (t.isExpression(prop.value)) {
                            translationElements[prop.key.name] = prop.value;
                        }
                        else {
                            console.error(`[@nixpare/nix-locale] Error at ${id}:${prop.loc?.start.line ?? 'undefined'} : invalid expression ${prop.value?.type}`);
                            return;
                        }
                    });
                    let scope = '';
                    const scopeArg = nodePath.node.arguments[2];
                    if (scopeArg != undefined) {
                        if (!t.isStringLiteral(scopeArg)) {
                            console.error(`[@nixpare/nix-locale] Error at ${id}:${scopeArg.loc?.start.line ?? 'undefined'} : scope argument must be a string literal`);
                            return;
                        }
                        scope = scopeArg.value;
                    }
                    Object.entries(translationElements).forEach(([locale, expr]) => {
                        const localeMap = context.translations.get(locale);
                        if (!localeMap.has(scope)) {
                            localeMap.set(scope, new Map());
                        }
                        localeMap.get(scope).set(componentBase, { key, value: expr });
                    });
                }
            });
        }
        context.translations.forEach((localeMap, locale) => {
            localeMap.forEach((scopeMap, scope) => {
                const exports = [];
                scopeMap.forEach(({ key, value: expr }) => {
                    if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) {
                        exports.push(t.exportNamedDeclaration(t.variableDeclaration("const", [t.variableDeclarator(t.identifier(key), expr)])));
                    }
                    else {
                        exports.push(t.exportNamedDeclaration(t.variableDeclaration("const", [t.variableDeclarator(t.identifier(key), t.arrowFunctionExpression([], expr))])));
                    }
                });
                const programNode = t.program(exports, [], "module");
                const fileNode = t.file(programNode);
                const module = generate(fileNode);
                virtualModules[localesModuleId(locale, scope).value + '.jsx'] = module;
            });
        });
    };
    return {
        name: 'vite-nix-locale',
        enforce: 'pre',
        configResolved(config) {
            root = config.root;
        },
        async buildStart() {
            await generateLocalesModules();
        },
        resolveId(source) {
            if (source.startsWith(`${virtualModulePrefix}/`)) {
                return source + '.jsx';
            }
        },
        resolveDynamicImport(_, importer) {
            if (importer.startsWith(`${virtualModulePrefix}/`)) {
                return importer + '.jsx';
            }
        },
        load(id) {
            if (id in virtualModules) {
                return virtualModules[id];
            }
        },
        transform(code, id) {
            if (!filter(id))
                return null;
            const ast = parse(code, {
                sourceType: 'module',
                plugins: ['typescript', 'jsx'],
            });
            let modified = false;
            let translationCount = 0;
            // @ts-ignore
            traverse.default(ast, {
                JSXElement(nodePath) {
                    if (!t.isJSXIdentifier(nodePath.node.openingElement.name, { name: componentHelper })) {
                        return;
                    }
                    const [_, key] = componentKey(id, translationCount++, context.version);
                    const argAttr = nodePath.node.openingElement.attributes.find(attr => {
                        return t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'arg';
                    });
                    const scopeAttr = nodePath.node.openingElement.attributes.find((attr) => {
                        return t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'scope';
                    });
                    const scope = (scopeAttr && t.isStringLiteral(scopeAttr.value) && scopeAttr.value.value) || '';
                    const importCall = (locale) => {
                        const importDecl = t.callExpression(t.import(), [localesModuleId(locale, scope)]);
                        const importWithThenDecl = t.callExpression(t.memberExpression(importDecl, t.identifier('then')), [
                            t.arrowFunctionExpression([t.identifier('module')], t.parenthesizedExpression(t.objectExpression([
                                t.objectProperty(t.identifier('default'), t.memberExpression(t.identifier('module'), t.identifier(key)))
                            ])))
                        ]);
                        return t.callExpression(t.memberExpression(reactImportAlias, t.identifier('lazy')), [t.arrowFunctionExpression([], importWithThenDecl)]);
                    };
                    const compName = `${componentPrefix}_${key}`;
                    const componentsImports = locales.map(locale => {
                        const compId = t.identifier(`${compName}_${locale}`);
                        if (locale === defaultLocale) {
                            return t.importDeclaration([t.importSpecifier(compId, t.identifier(key))], localesModuleId(locale, scope));
                        }
                        return t.variableDeclaration("const", [t.variableDeclarator(compId, importCall(locale))]);
                    });
                    const mapId = t.identifier('Map');
                    const mapDecl = t.variableDeclaration('const', [
                        t.variableDeclarator(mapId, t.objectExpression(locales.map(locale => t.objectProperty(t.identifier(locale), t.identifier(`${compName}_${locale}`)))))
                    ]);
                    const localeId = t.identifier('locale');
                    const useLocaleDecl = t.variableDeclaration("const", [
                        t.variableDeclarator(localeId, t.callExpression(useLocaleImportAlias, []))
                    ]);
                    const prevLocaleId = t.identifier('prevLocaleRef');
                    const usePrevLocaleDecl = t.variableDeclaration('const', [t.variableDeclarator(prevLocaleId, t.callExpression(t.memberExpression(reactImportAlias, t.identifier('useRef')), [t.identifier('locale')]))]);
                    const useEffectUpdatePrevDecl = t.expressionStatement(t.callExpression(t.memberExpression(reactImportAlias, t.identifier('useEffect')), [
                        t.arrowFunctionExpression([], t.blockStatement([
                            t.expressionStatement(t.assignmentExpression('=', t.memberExpression(t.identifier('prevLocaleRef'), t.identifier('current')), t.identifier('locale')))
                        ])),
                        t.arrayExpression([t.identifier('locale')])
                    ]));
                    const selectedDecl = t.variableDeclaration('const', [
                        t.variableDeclarator(t.identifier('Selected'), t.logicalExpression('||', t.memberExpression(mapId, localeId, true), t.arrowFunctionExpression([], t.stringLiteral('NixLocale error: Component not found'))))
                    ]);
                    const fallbackName = 'Fallback';
                    const fallbackDecl = t.variableDeclaration('const', [t.variableDeclarator(t.identifier(fallbackName), t.logicalExpression('||', t.memberExpression(t.identifier('Map'), t.memberExpression(t.identifier('prevLocaleRef'), t.identifier('current')), true), t.arrowFunctionExpression([], t.stringLiteral('NixLocale error: Fallback component not found'))))]);
                    const propsId = argAttr && t.identifier('arg');
                    const returnStmt = t.returnStatement(t.jsxElement(t.jsxOpeningElement(t.jsxMemberExpression(t.jsxIdentifier(reactImportAlias.name), t.jsxIdentifier('Suspense')), [t.jsxAttribute(t.jsxIdentifier('fallback'), t.jsxExpressionContainer(t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier(fallbackName), propsId ? [t.jsxSpreadAttribute(propsId)] : [], true), null, [], true)))], false), t.jsxClosingElement(t.jsxMemberExpression(t.jsxIdentifier(reactImportAlias.name), t.jsxIdentifier('Suspense'))), [
                        t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier('Selected'), propsId ? [t.jsxSpreadAttribute(propsId)] : [], true), null, [], true)
                    ], false));
                    const functionId = t.identifier(compName);
                    const functionDecl = t.functionDeclaration(functionId, propsId ? [t.objectPattern([
                            t.objectProperty(propsId, propsId, false, true)
                        ])] : [], t.blockStatement([
                        mapDecl,
                        useLocaleDecl,
                        usePrevLocaleDecl,
                        useEffectUpdatePrevDecl,
                        selectedDecl,
                        fallbackDecl,
                        returnStmt
                    ]));
                    nodePath.getFunctionParent().insertBefore(componentsImports);
                    nodePath.getFunctionParent().insertBefore(functionDecl);
                    nodePath.replaceWith(t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier(compName), argAttr ? [argAttr] : [], true), null, [], true));
                    modified = true;
                },
                CallExpression(nodePath) {
                    if (!t.isIdentifier(nodePath.node.callee)) {
                        return;
                    }
                    if (nodePath.node.callee.name === staticHelper) {
                        if (!t.isObjectExpression(nodePath.node.arguments[0])) {
                            return;
                        }
                        const argAttr = nodePath.node.arguments[1];
                        const selection = nodePath.node.arguments[0].properties.reduce((prev, prop) => {
                            if (prev) {
                                return prev;
                            }
                            if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) {
                                return;
                            }
                            if (!locales.includes(prop.key.name) || prop.key.name !== defaultLocale) {
                                return;
                            }
                            if (t.isExpression(prop.value)) {
                                return prop.value;
                            }
                            else {
                                console.error('invalid', prop.value);
                                return undefined;
                            }
                        }, undefined);
                        if (selection == undefined) {
                            return;
                        }
                        if (t.isArrowFunctionExpression(selection) || t.isFunctionExpression(selection)) {
                            nodePath.replaceWith(t.callExpression(selection, argAttr != undefined ? [argAttr] : []));
                        }
                        else {
                            nodePath.replaceWith(selection);
                        }
                        return;
                    }
                    if (nodePath.node.callee.name !== hookHelper) {
                        return;
                    }
                    if (!t.isObjectExpression(nodePath.node.arguments[0])) {
                        return;
                    }
                    const [_, key] = componentKey(id, translationCount++, context.version);
                    const argAttr = nodePath.node.arguments[1];
                    let scope = '';
                    const scopeArg = nodePath.node.arguments[2];
                    if (scopeArg != undefined) {
                        if (!t.isStringLiteral(scopeArg)) {
                            console.error(`[@nixpare/nix-locale] Error at ${id}:${scopeArg.start ?? 'undefined'} : scope argument must be a string literal`);
                            return;
                        }
                        scope = scopeArg.value;
                    }
                    const importCall = (locale) => {
                        const importDecl = t.callExpression(t.import(), [localesModuleId(locale, scope)]);
                        const importWithThenDecl = t.callExpression(t.memberExpression(importDecl, t.identifier('then')), [
                            t.arrowFunctionExpression([t.identifier('module')], t.memberExpression(t.identifier('module'), t.identifier(key)))
                        ]);
                        return t.arrowFunctionExpression([], importWithThenDecl);
                    };
                    const hookName = `${hookPrefix}_${key}`;
                    const hooksImports = locales.map(locale => {
                        const hookId = t.identifier(`${hookName}_${locale}`);
                        if (locale === defaultLocale) {
                            return t.importDeclaration([t.importSpecifier(hookId, t.identifier(key))], localesModuleId(locale, scope));
                        }
                        else {
                            return t.variableDeclaration("const", [t.variableDeclarator(hookId, importCall(locale))]);
                        }
                    });
                    const mapId = t.identifier('map');
                    const mapDecl = t.variableDeclaration('const', [
                        t.variableDeclarator(mapId, t.objectExpression(locales.map(locale => t.objectProperty(t.identifier(locale), t.identifier(`${hookName}_${locale}`)))))
                    ]);
                    const localeId = t.identifier('locale');
                    const useLocaleDecl = t.variableDeclaration("const", [
                        t.variableDeclarator(localeId, t.callExpression(useLocaleImportAlias, []))
                    ]);
                    const propsId = argAttr && t.identifier('props');
                    const selectedId = t.identifier('selected');
                    const setSelectedId = t.identifier('setSelected');
                    const useStateSelectedDecl = t.variableDeclaration('const', [t.variableDeclarator(t.arrayPattern([selectedId, setSelectedId]), t.callExpression(t.memberExpression(reactImportAlias, t.identifier('useState')), 
                        // THIS IS DONE BECAUSE React.useState, IF IT SEES A FUNCTION BEING PASSED TO IT,
                        // IT CALLS THAT FUNCTION AUTOMATICALLY AND ASSIGNS TO THE NEW STATE THE RESULT
                        // OF THAT FUNCTION. FUCK YOU REACT!
                        [t.arrowFunctionExpression([], t.memberExpression(mapId, t.stringLiteral(defaultLocale), true))]))]);
                    const useEffectAsyncFetch = t.expressionStatement(t.callExpression(t.memberExpression(reactImportAlias, t.identifier('useEffect')), [
                        t.arrowFunctionExpression([], t.blockStatement((() => {
                            const loaderId = t.identifier('loader');
                            const loaderDecl = t.variableDeclaration('const', [t.variableDeclarator(loaderId, t.memberExpression(mapId, localeId, true))]);
                            const defaultLocaleEarlyReturnIf = t.ifStatement(t.binaryExpression("===", localeId, t.stringLiteral(defaultLocale)), t.blockStatement([
                                t.expressionStatement(t.callExpression(setSelectedId, [t.arrowFunctionExpression([], loaderId)])),
                                t.returnStatement()
                            ]));
                            const cancelledId = t.identifier('cancelled');
                            const cancelledDecl = t.variableDeclaration('let', [t.variableDeclarator(cancelledId, t.booleanLiteral(false))]);
                            const loadId = t.identifier('load');
                            const loadDecl = t.variableDeclaration('const', [t.variableDeclarator(loadId, t.arrowFunctionExpression([], t.blockStatement((() => {
                                    const resultId = t.identifier('result');
                                    const resultDecl = t.variableDeclaration('const', [t.variableDeclarator(resultId, t.awaitExpression(t.callExpression(loaderId, [])))]);
                                    return [
                                        resultDecl,
                                        t.ifStatement(t.unaryExpression('!', cancelledId), t.expressionStatement(t.callExpression(setSelectedId, [t.arrowFunctionExpression([], resultId)])))
                                    ];
                                })()), true))]);
                            return [
                                loaderDecl,
                                defaultLocaleEarlyReturnIf,
                                cancelledDecl,
                                loadDecl,
                                t.expressionStatement(t.callExpression(loadId, [])),
                                t.returnStatement(t.arrowFunctionExpression([], t.blockStatement([
                                    t.expressionStatement(t.assignmentExpression('=', cancelledId, t.booleanLiteral(true)))
                                ])))
                            ];
                        })())),
                        t.arrayExpression([localeId, t.memberExpression(mapId, localeId, true)])
                    ]));
                    const returnStmt = t.returnStatement(t.callExpression(selectedId, propsId ? [propsId] : []));
                    const hookId = t.identifier(hookName);
                    const functionDecl = t.functionDeclaration(hookId, propsId ? [propsId] : [], t.blockStatement([
                        useLocaleDecl,
                        mapDecl,
                        useStateSelectedDecl,
                        useEffectAsyncFetch,
                        returnStmt
                    ]));
                    nodePath.getFunctionParent().insertBefore(hooksImports);
                    nodePath.getFunctionParent().insertBefore(functionDecl);
                    nodePath.replaceWith(t.callExpression(hookId, argAttr ? [argAttr] : []));
                    modified = true;
                }
            });
            if (!modified) {
                return;
            }
            const relativeUseLocaleImportPath = relativePath(path.dirname(id), useLocaleImportPath);
            ast.program.body.unshift(t.importDeclaration([t.importDefaultSpecifier(reactImportAlias)], t.stringLiteral("react")), t.importDeclaration([t.importSpecifier(useLocaleImportAlias, t.identifier(useLocaleName))], t.stringLiteral(relativeUseLocaleImportPath)));
            const output = generate(ast, {}, code);
            return output;
        },
        // 5) Handle Hot Module Reload
        async handleHotUpdate({ file, server, modules }) {
            if (!filter(file)) {
                return modules;
            }
            context.version++;
            await generateLocalesModules(file);
            const invalidatedModules = [...modules];
            for (const modId of Object.keys(virtualModules)) {
                const mod = server.moduleGraph.getModuleById(modId);
                invalidatedModules.push(mod);
            }
            return invalidatedModules;
        }
    };
}
function localesModuleId(locale, scope) {
    const scopeSuffix = scope === '' ? '' : `-${scope}`;
    return t.stringLiteral(`${virtualModulePrefix}/${locale}/${locale}${scopeSuffix}`);
}
function componentKey(id, count, version) {
    const relativeDir = path.relative(__dirname, id).replaceAll('\\', '/').replaceAll('../', '');
    const [baseName] = relativeDir.replaceAll('.', '_').replaceAll('-', '_').replaceAll('/', '_').split('?');
    const componentBase = `${baseName}__${count}`;
    return [componentBase, `${componentBase}_${version}`];
}
function consoleLogStatement(...args) {
    return t.expressionStatement(t.callExpression(t.memberExpression(t.identifier('console'), t.identifier('log')), args));
}

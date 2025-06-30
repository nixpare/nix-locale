import { type Plugin } from 'vite';
import { parse } from '@babel/parser';
import { default as traverse } from '@babel/traverse';
import { generate, type GeneratorResult } from '@babel/generator';
import * as t from '@babel/types';
import { createFilter } from '@rollup/pluginutils';
import path from 'path';
import fs from 'fs';
import fg from 'fast-glob';

export interface AutoLocaleOptions {
	/**
	 * Include pattern for filtering the files to be parsed.
	 * @default
	 * ['**\/*.js', '**\/*.jsx', '**\/*.ts', '**\/*.tsx']
	 */
	include?: string | string[];
	/**
	 * Exclude pattern for filtering the files to be parsed.
	 * @default
	 * 'node_modules/**\/*'
	 */
	exclude?: string | string[];
	/**
	 * The list of languages to be parsed.
	 * @example
	 * ['en', 'it', 'de', 'default', 'something not standard']
	 */
	locales: string[];
	/**
	 * The language from the `locales` option to be considered the default loaded language.
	 * The other ones are lazily loaded
	 */
	default: string;
	/**
	 * The static helper function name. This must match the function defined in the helper file.
	 * @default
	 * 't'
	 */
	staticHelperName?: string
	/**
	 * The hook helper function name. This must match the function defined in the helper file.
	 * @default
	 * 'useT'
	 */
	hookHelperName?: string;
	/**
	 * The component helper function name. This must match the function defined in the helper file.
	 * @default
	 * 'T'
	 */
	componentHelperName?: string;
	/**
	 * The name of the hook responsible of signaling any language change. This function used in the hook function
	 * and component to determine the current language and listen to any changes. Use this property in conjunction with
	 * the `useLocaleImportPath` option.
	 * @default
	 * 'useLocale'
	 */
	useLocaleName?: string;
	/**
	 * The import path of the hook responsible of signaling any language change. Use this property in conjunction with
	 * the `useLocaleName` option.
	 */
	useLocaleImportPath: string;
}

type TranslationsMap<T> = Map<string, Map<string, {
	key: string;
	value: T;
}>>

type ContextType = {
	version: number
	translations: TranslationsMap<t.Expression>
}

// @ts-ignore
if (!globalThis.__AUTO_LOCALE_STATE__) globalThis.__AUTO_LOCALE_STATE__ = {
	version: 0,
	translations: new Map()
} satisfies ContextType;

export default function autoLocalePlugin(options: AutoLocaleOptions): Plugin {
	let root: string;
	const includeOption = options.include || ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx']
	const filter = createFilter(includeOption, options.exclude || 'node_modules/**/*');
	
	const locales = options.locales;
	const defaultLocale = options.default;
	const staticHelper = options.staticHelperName || 't';
	const hookHelper = options.hookHelperName || 'useT';
	const componentHelper = options.componentHelperName || 'T';
	const useLocaleName = options.useLocaleName || 'useLocale';
	const useLocaleImportPath = options.useLocaleImportPath;

	const componentPrefix = "AutoLocale"
	const hookPrefix = "useAutoLocale"
	const reactImportAlias = t.identifier("AutoLocale_React")
	const useLocaleImportAlias = t.identifier("AutoLocale_useLocale")

	const virtualModules: Record<string, GeneratorResult> = {}
	
	// @ts-ignore
	const context = globalThis.__AUTO_LOCALE_STATE__ as ContextType;
	locales.forEach(locale => {
		if (!context.translations.has(locale)) {
			context.translations.set(locale, new Map())
		}
	});

	const componentKey = (id: string, count: number): [string, string] => {
		const relativeDir = path.relative(__dirname, id).replaceAll('\\', '/').replaceAll('../', '')
		const [baseName] = relativeDir.replaceAll('.', '_').replaceAll('-', '_').replaceAll('/', '_').split('?');
		const componentBase = `${baseName}__${count}`;
		return [componentBase, `${componentBase}_${context.version}`];
	}

	const virtualModulePrefix = 'virtual:auto-locale'
	const localesModuleId = (locale: string) => t.stringLiteral(`${virtualModulePrefix}/${locale}`)

	const generateLocalesModules = async (...files: string[]) => {
		if (files.length == 0) {
			files = await fg(includeOption, { cwd: root, absolute: true })
		}
		
		for (const id of files) {
			if (!filter(id)) continue

			const code = await fs.promises.readFile(id, 'utf-8')
			const ast = parse(code, {
				sourceType: 'module',
				plugins: ['typescript', 'jsx'],
			});

			let translationCount = 0;

			// @ts-ignore
			(traverse.default as typeof traverse)(ast, {
				JSXElement(nodePath) {
					if (!t.isJSXIdentifier(nodePath.node.openingElement.name, { name: componentHelper })) {
						return;
					}

					const [componentBase, key] = componentKey(id, translationCount++);

					nodePath.node.openingElement.attributes.forEach(attr => {
						if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) {
							return
						}

						if (!locales.includes(attr.name.name) || !t.isJSXIdentifier(attr.name)) {
							return
						}

						if (t.isStringLiteral(attr.value) || t.isJSXElement(attr.value) || t.isJSXFragment(attr.value)) {
							context.translations.get(attr.name.name)!.set(componentBase, { key, value: attr.value });
						} else if (t.isJSXExpressionContainer(attr.value) && !t.isJSXEmptyExpression(attr.value.expression)) {
							context.translations.get(attr.name.name)!.set(componentBase, { key, value: attr.value.expression });
						} else {
							console.error('invalid expression', attr.value)
						}
					});
				},
				CallExpression(nodePath) {
					if (!t.isIdentifier(nodePath.node.callee, { name: hookHelper })) {
						return;
					}

					if (!t.isObjectExpression(nodePath.node.arguments[0])) {
						return;
					}

					const [componentBase, key] = componentKey(id, translationCount++);

					nodePath.node.arguments[0].properties.forEach(prop => {
						if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) {
							return;
						}

						if (!locales.includes(prop.key.name)) {
							return;
						}

						if (t.isExpression(prop.value)) {
							context.translations.get(prop.key.name)!.set(componentBase, { key, value: prop.value });
						} else {
							console.error('invalid expression', prop.value);
						}
					});
				}
			});
		}

		context.translations.forEach((map, locale) => {
			const exports: t.Statement[] = [];
			
			map.forEach(({key, value: expr}) => {
				if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) {
					exports.push(t.exportNamedDeclaration(
						t.variableDeclaration(
							"const",
							[t.variableDeclarator(
								t.identifier(key),
								expr
							)]
						)
					));
				} else {
					exports.push(t.exportNamedDeclaration(
						t.variableDeclaration(
							"const",
							[t.variableDeclarator(
								t.identifier(key),
								t.arrowFunctionExpression(
									[],
									expr
								)
							)]
						)
					));
				}
			});

			const programNode = t.program(exports, [], "module");
			const fileNode = t.file(programNode);
			const module = generate(fileNode);
			
			virtualModules[localesModuleId(locale).value + '.jsx'] = module
		});
	}

	return {
		name: 'vite-auto-locale',
		enforce: 'pre',

		configResolved(config) {
			root = config.root
		},

		async buildStart() {
			await generateLocalesModules()
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
			if (!filter(id)) return null;

			const ast = parse(code, {
				sourceType: 'module',
				plugins: ['typescript', 'jsx'],
			});

			let modified = false;
			let translationCount = 0;

			// @ts-ignore
			(traverse.default as typeof traverse)(ast, {
				JSXElement(nodePath) {
					if (!t.isJSXIdentifier(nodePath.node.openingElement.name, { name: componentHelper })) {
						return;
					}

					const [_, key] = componentKey(id, translationCount++);

					const argAttr = nodePath.node.openingElement.attributes.find(attr => {
						return t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'arg'
					});

					const importCall = (locale: string) => {
						const importDecl = t.callExpression(
							t.import(),
							[localesModuleId(locale)]
						)

						const importWithThenDecl = t.callExpression(
							t.memberExpression(importDecl, t.identifier('then')),
							[
								t.arrowFunctionExpression(
									[t.identifier('module')],
									t.parenthesizedExpression(
										t.objectExpression([
											t.objectProperty(
												t.identifier('default'),
												t.memberExpression(
													t.identifier('module'),
													t.identifier(key)
												)
											)
										])
									)
								)
							]
						);

						return t.callExpression(
							t.memberExpression(reactImportAlias, t.identifier('lazy')),
							[t.arrowFunctionExpression(
								[],
								importWithThenDecl
							)]
						);
					}

					const compName = `${componentPrefix}_${key}`

					const componentsImports = locales.map(locale => {
						const compId = t.identifier(`${compName}_${locale}`)

						if (locale === defaultLocale) {
							return t.importDeclaration(
								[t.importSpecifier(compId, t.identifier(key))],
								localesModuleId(locale)
							)
						}

						return t.variableDeclaration(
							"const",
							[t.variableDeclarator(
								compId,
								importCall(locale)
							)]
						)
					})

					const mapId = t.identifier('Map')
					const mapDecl = t.variableDeclaration('const', [
						t.variableDeclarator(
							mapId,
							t.objectExpression(
								locales.map(locale =>
									t.objectProperty(
										t.identifier(locale),
										t.identifier(`${compName}_${locale}`)
									)
								)
							)
						)
					]);

					const localeId = t.identifier('locale');
					const useLocaleDecl = t.variableDeclaration("const", [
						t.variableDeclarator(
							localeId,
							t.callExpression(useLocaleImportAlias, [])
						)
					])

					const prevLocaleId = t.identifier('prevLocaleRef')
					const usePrevLocaleDecl = t.variableDeclaration('const', [t.variableDeclarator(
						prevLocaleId,
						t.callExpression(t.memberExpression(reactImportAlias, t.identifier('useRef')), [t.identifier('locale')])
					)])

					const useEffectUpdatePrevDecl = t.expressionStatement(
						t.callExpression(t.memberExpression(reactImportAlias, t.identifier('useEffect')), [
							t.arrowFunctionExpression(
								[],
								t.blockStatement([
									t.expressionStatement(
										t.assignmentExpression('=',
											t.memberExpression(t.identifier('prevLocaleRef'), t.identifier('current')),
											t.identifier('locale')
										)
									)
								])
							),
							t.arrayExpression([t.identifier('locale')])
						])
					)

					const selectedDecl = t.variableDeclaration('const', [
						t.variableDeclarator(
							t.identifier('Selected'),
							t.logicalExpression(
								'||',
								t.memberExpression(
									mapId,
									localeId,
									true
								),
								t.arrowFunctionExpression([], t.stringLiteral('AutoLocale error: Component not found'))
							)
						)
					]);

					const fallbackName = 'Fallback'
					const fallbackDecl = t.variableDeclaration('const', [t.variableDeclarator(
						t.identifier(fallbackName),
						t.logicalExpression(
							'||',
							t.memberExpression(
								t.identifier('Map'),
								t.memberExpression(t.identifier('prevLocaleRef'), t.identifier('current')),
								true
							),
							t.arrowFunctionExpression([], t.stringLiteral('AutoLocale error: Fallback component not found'))
						)
					)])

					const propsId = argAttr && t.identifier('props');

					const returnStmt = t.returnStatement(
						t.jsxElement(
							t.jsxOpeningElement(
								t.jsxMemberExpression(t.jsxIdentifier(reactImportAlias.name), t.jsxIdentifier('Suspense')),
								[t.jsxAttribute(t.jsxIdentifier('fallback'), t.jsxExpressionContainer(
									t.jsxElement(
										t.jsxOpeningElement(
											t.jsxIdentifier(fallbackName),
											propsId ? [t.jsxSpreadAttribute(propsId)] : [],
											true
										),
										null,
										[],
										true
									)
								))],
								false
							),
							t.jsxClosingElement(
								t.jsxMemberExpression(t.jsxIdentifier(reactImportAlias.name), t.jsxIdentifier('Suspense'))
							),
							[
								t.jsxElement(
									t.jsxOpeningElement(
										t.jsxIdentifier('Selected'),
										propsId ? [t.jsxSpreadAttribute(propsId)] : [],
										true),
									null,
									[],
									true
								)
							],
							false
						)
					);

					const functionId = t.identifier(compName)
					const functionDecl = t.functionDeclaration(
						functionId,
						propsId ? [propsId] : [],
						t.blockStatement([
							mapDecl,
							useLocaleDecl,
							usePrevLocaleDecl,
							useEffectUpdatePrevDecl,
							selectedDecl,
							fallbackDecl,
							returnStmt
						])
					)
					
					nodePath.getFunctionParent()!.insertBefore(componentsImports)
					nodePath.getFunctionParent()!.insertBefore(functionDecl)

					nodePath.replaceWith(
						t.jsxElement(
							t.jsxOpeningElement(
								t.jsxIdentifier(compName),
								argAttr ? [argAttr] : [],
								true
							),
							null,
							[],
							true
						)
					);

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

						const argAttr = nodePath.node.arguments[1] as typeof nodePath.node.arguments[1] | undefined;

						const selection = nodePath.node.arguments[0].properties.reduce<t.Expression | undefined>((prev, prop) => {
							if (prev) {
								return prev
							}

							if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) {
								return;
							}

							if (!locales.includes(prop.key.name) || prop.key.name !== defaultLocale) {
								return;
							}

							if (t.isExpression(prop.value)) {
								return prop.value;
							} else {
								console.error('invalid', prop.value);
								return undefined
							}
						}, undefined);

						if (selection == undefined) {
							return
						}

						if (t.isArrowFunctionExpression(selection) || t.isFunctionExpression(selection)) {
							nodePath.replaceWith(
								t.callExpression(
									selection,
									argAttr != undefined ? [argAttr] : []
								)
							);
						} else {
							nodePath.replaceWith(selection);
						}

						return
					}

					if (nodePath.node.callee.name !== hookHelper) {
						return;
					}

					if (!t.isObjectExpression(nodePath.node.arguments[0])) {
						return;
					}

					const [componentBase, key] = componentKey(id, translationCount++);
					const argAttr = nodePath.node.arguments[1] as typeof nodePath.node.arguments[1] | undefined;
					
					const importCall = (locale: string) => {
						const importDecl = t.callExpression(
							t.import(),
							[localesModuleId(locale)]
						)

						const importWithThenDecl = t.callExpression(
							t.memberExpression(importDecl, t.identifier('then')),
							[
								t.arrowFunctionExpression(
									[t.identifier('module')],
									t.blockStatement([
										t.returnStatement(
											t.memberExpression(
												t.identifier('module'),
												t.identifier(key)
											)
										)
									])
								)
							]
						);

						return t.arrowFunctionExpression(
							[],
							importWithThenDecl
						);
					}

					const hookName = `${hookPrefix}_${key}`;

					const hooksImports = locales.map(locale => {
						const hookId = t.identifier(`${hookName}_${locale}`)

						if (locale === defaultLocale) {
							return t.importDeclaration(
								[t.importSpecifier(hookId, t.identifier(key))],
								localesModuleId(locale)
							)
						} else {
							return t.variableDeclaration(
								"const",
								[t.variableDeclarator(
									hookId,
									importCall(locale)
								)]
							)
						}
					})

					const mapId = t.identifier('map')
					const mapDecl = t.variableDeclaration('const', [
						t.variableDeclarator(
							mapId,
							t.objectExpression(
								locales.map(locale => t.objectProperty(
									t.identifier(locale),
									t.identifier(`${hookName}_${locale}`)
								))
							)
						)
					]);

					const localeId = t.identifier('locale');
					const useLocaleDecl = t.variableDeclaration("const", [
						t.variableDeclarator(
							localeId,
							t.callExpression(useLocaleImportAlias, [])
						)
					])

					const propsId = argAttr && t.identifier('props');

					const resultId = t.identifier('result')
					const setResultId = t.identifier('setResult')
					const useStateResultDecl = t.variableDeclaration('const', [t.variableDeclarator(
						t.arrayPattern([ resultId, setResultId ]),
						t.callExpression(
							t.memberExpression(reactImportAlias, t.identifier('useState')),
							[t.callExpression(
								t.memberExpression(mapId, localeId, true),
								propsId ? [propsId] : []
							)]
						)
					)])

					const selectedId = t.identifier('selected')
					const selectedDecl = t.variableDeclaration('const', [
						t.variableDeclarator(
							selectedId,
							t.memberExpression(
								mapId,
								localeId,
								true
							)
						)
					]);

					const useEffectAsyncFetch = t.expressionStatement(
						t.callExpression(t.memberExpression(reactImportAlias, t.identifier('useEffect')), [
							t.arrowFunctionExpression(
								[],
								t.blockStatement([
									selectedDecl,
									t.ifStatement(
										t.binaryExpression('===', localeId, t.stringLiteral(defaultLocale)),
										t.expressionStatement(
											t.callExpression(
												setResultId,
												[selectedId]
											)
										),
										t.expressionStatement(
											t.callExpression(
												t.memberExpression(
													t.callExpression(selectedId, []),
													t.identifier('then')
												),
												[t.arrowFunctionExpression(
													[t.identifier('f')],
													t.callExpression(
														setResultId,
														[t.callExpression(
															t.identifier('f'),
															propsId ? [propsId] : []
														)]
													)
												)]
											)
										)
									)
								])
							),
							t.arrayExpression([localeId])
						])
					)

					const returnStmt = t.returnStatement(resultId);

					const hookId = t.identifier(hookName)
					const functionDecl = t.functionDeclaration(
						hookId,
						propsId ? [propsId] : [],
						t.blockStatement([
							mapDecl,
							useLocaleDecl,
							useStateResultDecl,
							useEffectAsyncFetch,
							returnStmt
						])
					)

					nodePath.getFunctionParent()!.insertBefore(hooksImports)
					nodePath.getFunctionParent()!.insertBefore(functionDecl)

					nodePath.replaceWith(
						t.callExpression(
							hookId,
							argAttr ? [argAttr] : []
						)
					);

					modified = true;
				}
			});
			
			if (!modified) {
				return;
			}

			ast.program.body.unshift(
				t.importDeclaration(
					[t.importDefaultSpecifier(reactImportAlias)],
					t.stringLiteral("react")
				),
				t.importDeclaration(
					[t.importSpecifier(useLocaleImportAlias, t.identifier(useLocaleName))],
					t.stringLiteral(useLocaleImportPath)
				)
			);
			
			const output = generate(ast, {}, code);
			return output;
		},

		// 5) Handle Hot Module Reload
		async handleHotUpdate({ file, server, modules }) {
			if (!filter(file)) {
				return;
			}

			context.version++;
			await generateLocalesModules(file);

			const invalidatedModules = [...modules];
			for (const modId of Object.keys(virtualModules)) {
				const mod = server.moduleGraph.getModuleById(modId);
				invalidatedModules.push(mod!)
			}

			return invalidatedModules
		}
	};
}

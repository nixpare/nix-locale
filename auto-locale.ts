import { ModuleNode, type Plugin } from 'vite';
import { parse } from '@babel/parser';
import { default as traverse } from '@babel/traverse';
import { generate } from '@babel/generator';
import * as t from '@babel/types';
import { createFilter } from '@rollup/pluginutils';
import path from 'path';

export interface AutoLocaleOptions {
	include?: string | string[];
	exclude?: string | string[];
	// a list of languages to parse
	locales: string[];
	// default locale
	default: string;
	// default 't'
	staticHelperName?: string
	// default 'useT'
	hookHelperName?: string;
	// default 'T'
	componentHelperName?: string;
	// default 'useLocale'
	useLocaleName?: string;
	// path to import useLocale implementation
	useLocaleImportPath: string;
}

export default function autoLocalePlugin(options: AutoLocaleOptions): Plugin {
	const filter = createFilter(options.include, options.exclude);
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

	const virtualModulePrefix = 'virtual:auto-locale'
	const virtualModules: Record<string, string> = {};
	const affectedModules: Record<string, boolean> = {};

	// Accumulator: Map<locale, Map<key, ASTNode>>
	const translations = new Map<string, Map<string, t.Expression>>();
	locales.forEach(l => translations.set(l, new Map()));

	return {
		name: 'vite-auto-locale',
		enforce: 'pre',

		// 1) Resolve virtual module IDs
		resolveId(source) {
			if (source.startsWith(`${virtualModulePrefix}/`)) {
				return source;
			}
			return null;
		},

		// 2) Load virtual module content
		load(id) {
			if (id in virtualModules) {
				return virtualModules[id];
			}
			return null;
		},

		// 3) Transform source files
		transform(code, id) {
			if (!filter(id) || (!id.endsWith('.tsx') && !id.endsWith('.ts'))) return null;
			
			const ast = parse(code, {
				sourceType: 'module',
				plugins: ['typescript', 'jsx'],
			});

			let modified = false;
			let translationCount = 0;

			const relativeDir = path.relative(__dirname, id).replaceAll('\\', '/').replaceAll('../', '')
			const [baseName] = relativeDir.replaceAll('.', '_').replaceAll('-', '_').replaceAll('/', '_').split('?');

			// @ts-ignore
			(traverse.default as typeof traverse)(ast, {
				JSXElement(nodePath) {
					if (!t.isJSXIdentifier(nodePath.node.openingElement.name, { name: componentHelper })) {
						return;
					}

					const key = `${baseName}__${translationCount++}`;
					const localesAttrs: t.JSXAttribute[] = [];
					const argAttr = nodePath.node.openingElement.attributes.find(attr => {
						return t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'arg'
					});

					nodePath.node.openingElement.attributes.forEach(attr => {
						if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
							if (locales.includes(attr.name.name)) {
								localesAttrs.push(attr);
							}
						}
					});

					localesAttrs.forEach(attr => {
						if (t.isJSXIdentifier(attr.name)) {
							if (t.isStringLiteral(attr.value) || t.isJSXElement(attr.value) || t.isJSXFragment(attr.value)) {
								translations.get(attr.name.name)!.set(key, attr.value);
							} else if (t.isJSXExpressionContainer(attr.value) && !t.isJSXEmptyExpression(attr.value.expression)) {
								translations.get(attr.name.name)!.set(key, attr.value.expression);
							} else {
								console.error(attr.value)
							}
						}
					});

					const virtualModuleId = (locale: string) => t.stringLiteral(`${virtualModulePrefix}/${locale}.jsx`)

					const importCall = (locale: string) => {
						const importDecl = t.callExpression(
							t.import(),
							[virtualModuleId(locale)]
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
													t.stringLiteral(key),
													true
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

					const lazyCompDecls = locales.map(locale => {
						const compId = t.identifier(`${compName}_${locale}`)

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
							t.memberExpression(
								mapId,
								localeId,
								true
							)
						)
					]);

					const fallbackName = 'Fallback'
					const fallbackDecl = t.variableDeclaration('const', [t.variableDeclarator(
						t.identifier(fallbackName),
						t.memberExpression(
							t.identifier('Map'),
							t.memberExpression(t.identifier('prevLocaleRef'), t.identifier('current')),
							true
						)
					)])

					const propsId = t.identifier('props');

					const returnStmt = t.returnStatement(
						t.jsxElement(
							t.jsxOpeningElement(
								t.jsxMemberExpression(t.jsxIdentifier(reactImportAlias.name), t.jsxIdentifier('Suspense')),
								[t.jsxAttribute(t.jsxIdentifier('fallback'), t.jsxExpressionContainer(
									t.jsxElement(
										t.jsxOpeningElement(
											t.jsxIdentifier(fallbackName),
											[t.jsxSpreadAttribute(propsId)],
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
										[ t.jsxSpreadAttribute(propsId) ],
										true),
									null,
									[],
									true
								)
							],
							false
						)
					);

					const functionDecl = t.functionDeclaration(
						t.identifier(compName),
						[ propsId ],
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

					ast.program.body.unshift(functionDecl)
					ast.program.body.unshift(...lazyCompDecls)

					nodePath.replaceWith(
						t.jsxElement(
							t.jsxOpeningElement(
								t.jsxIdentifier(compName),
								argAttr != undefined ? [argAttr] : [],
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
							nodePath.replaceWith(
								selection
							);
						}

						modified = true;
						return
					}

					if (nodePath.node.callee.name !== hookHelper) {
						return;
					}

					if (!t.isObjectExpression(nodePath.node.arguments[0])) {
						return;
					}

					const key = `${baseName}__${translationCount++}`;
					const argAttr = nodePath.node.arguments[1] as typeof nodePath.node.arguments[1] | undefined;

					nodePath.node.arguments[0].properties.forEach(prop => {
						if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) {
							return;
						}

						if (!locales.includes(prop.key.name)) {
							return;
						}

						if (t.isExpression(prop.value)) {
							translations.get(prop.key.name)!.set(key, prop.value);
						} else {
							console.error('invalid', prop.value);
						}
					});

					const virtualModuleId = (locale: string) => t.stringLiteral(`${virtualModulePrefix}/${locale}.jsx`)
					
					const importCall = (locale: string) => {
						const importDecl = t.callExpression(
							t.import(),
							[virtualModuleId(locale)]
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
												t.stringLiteral(key),
												true
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

					const defaultHookId = t.identifier(`${hookName}_default`);
					const defaultHookDecl = t.importDeclaration(
						[t.importSpecifier(defaultHookId, t.identifier(key))],
						virtualModuleId(defaultLocale)
					)

					const asyncHooksDecls = locales.map(locale => {
						/* if (locale === defaultLocale) {
							return t.variableDeclaration(
								"const",
								[t.variableDeclarator(
									t.identifier(`${hookName}_${locale}`),
									t.arrowFunctionExpression(
										[],
										t.callExpression(
											t.memberExpression(t.identifier('Promise'), t.identifier('resolve')),
											[defaultHookId]
										)
									)
								)]
							)
						} else { */
							return t.variableDeclaration(
								"const",
								[t.variableDeclarator(
									t.identifier(`${hookName}_${locale}`),
									importCall(locale)
								)]
							)
						//}
					})

					const mapId = t.identifier('map')
					const mapDecl = t.variableDeclaration('const', [
						t.variableDeclarator(
							mapId,
							t.objectExpression(
								locales.map(locale =>
									t.objectProperty(
										t.identifier(locale),
										t.identifier(`${hookName}_${locale}`)
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

					const propsId = argAttr && t.identifier('props');

					const resultId = t.identifier('result')
					const setResultId = t.identifier('setResult')
					const useStateResultDecl = t.variableDeclaration('const', [t.variableDeclarator(
						t.arrayPattern([ resultId, setResultId ]),
						t.callExpression(
							t.memberExpression(reactImportAlias, t.identifier('useState')),
							[t.callExpression(
								defaultHookId,
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
								])
							),
							t.arrayExpression([localeId])
						])
					)

					const returnStmt = t.returnStatement(resultId);

					const hookId = t.identifier(hookName)
					const functionDecl = t.functionDeclaration(
						hookId,
						propsId ? [propsId] : [t.identifier('props')],
						t.blockStatement([
							mapDecl,
							useLocaleDecl,
							useStateResultDecl,
							useEffectAsyncFetch,
							returnStmt
						])
					)

					ast.program.body.unshift(functionDecl)
					ast.program.body.unshift(...asyncHooksDecls)
					ast.program.body.unshift(defaultHookDecl)

					nodePath.replaceWith(
						t.callExpression(
							hookId,
							argAttr ? [argAttr] : []
						)
					);
					modified = true;
				}
			});

			translations.forEach((map, locale) => {
				const exports: string[] = [];
				map.forEach((expr, key) => {
					const jsCode = generate(expr, {}).code;
					if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) {
						exports.push(`export const ${key} = ${jsCode};`);
					} else {
						exports.push(`export const ${key} = () => (${jsCode});`);
					}
				});

				const moduleContent = `
${exports.join('\n\n')}

export default { ${Array.from(map.keys()).join(', ')} };
`;
				virtualModules[`${virtualModulePrefix}/${locale}.jsx`] = moduleContent
			});

			if (modified) {
				affectedModules[id] = true

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

				const output = generate(ast, {}, code).code;

				return {
					code: output,
					map: null,
				};
			} else {
				delete affectedModules[id]
			}

			return null;
		},

		// 4) Handle Hot Module Reload
		async handleHotUpdate({ file, server, modules }) {
			if (!file.endsWith('.tsx') || !filter(file)) {
				return;
			}

			const invalidatedModules = new Set(modules);
			for (const mod of modules.values()) {
				if (Object.keys(affectedModules).includes(mod.id ?? '')) {
					for (const modId of Object.keys(virtualModules)) {
						const mod = await server.moduleGraph.getModuleByUrl(modId);
						invalidatedModules.add(mod!);
						server.moduleGraph.invalidateModule(mod!);
					}

					for (const modId of Object.keys(affectedModules)) {
						const mod = await server.moduleGraph.getModuleByUrl(modId);
						mod && invalidatedModules.add(mod);
					}

					break;
				}
			}

			return Array.from(invalidatedModules);
		}
	};
}

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
	// default 'T'
	helperName?: string;
	// default 'useLocale'
	useLocaleName?: string;
	useLocaleImportPath: string;
}

export default function autoLocalePlugin(options: AutoLocaleOptions): Plugin {
	const filter = createFilter(options.include, options.exclude);
	const locales = options.locales;
	const helper = options.helperName || 'T';
	const useLocaleName = options.useLocaleName || 'useLocale';
	const useLocaleImportPath = options.useLocaleImportPath;

	const componentPrefix = "AutoLocale"

	const virtualModules: Record<string, string> = {};
	const virtualModulePrefix = 'virtual:auto-locale'

	// Accumulator: Map<locale, Map<key, ASTNode>>
	const translations = new Map<string, Map<string, t.Expression>>();
	locales.forEach(l => translations.set(l, new Map()));

	let translationCount = 0;

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
			if (!filter(id) || !id.endsWith('.tsx')) return null;
			const ast = parse(code, {
				sourceType: 'module',
				plugins: ['typescript', 'jsx'],
			});

			let modified = false;

			// @ts-ignore
			(traverse.default as typeof traverse)(ast, {
				JSXElement(nodePath) {
					if (!t.isJSXIdentifier(nodePath.node.openingElement.name, { name: helper })) {
						return;
					}

					const baseName = path.basename(id, '.tsx');
					const key = `${baseName}__${translationCount++}`;
					const localeAttrs: t.JSXAttribute[] = [];
					const otherAttrs: t.JSXAttribute[] = [];

					nodePath.node.openingElement.attributes.forEach(attr => {
						if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
							if (locales.includes(attr.name.name)) {
								localeAttrs.push(attr);
							} else {
								otherAttrs.push(attr);
							}
						}
					});

					// Extract each locale map
					localeAttrs.forEach(attr => {
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

					// Replace call with React.lazy import
					const importCall = (locale: string) => {
						const importDecl = t.callExpression(
							t.import(),
							[t.stringLiteral(`${virtualModulePrefix}/${locale}.jsx`)]
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
							t.memberExpression(t.identifier('React'), t.identifier('lazy')),
							[t.arrowFunctionExpression(
								[],
								importWithThenDecl
							)]
						);
					}

					const compName = `${componentPrefix}_${key}`

					const lazyCompDecls = locales.map(locale => t.variableDeclaration(
						"const",
						[t.variableDeclarator(
							t.identifier(`${compName}_${locale}`),
							importCall(locale)
						)]
					))

					const localeId = t.identifier('locale');
					const useLocaleDecl = t.variableDeclaration("const", [
						t.variableDeclarator(
							localeId,
							t.callExpression(t.identifier(useLocaleName), [])
						)
					])

					const prevLocaleId = t.identifier('prevLocaleRef')
					const usePrevLocaleDecl = t.variableDeclaration('const', [t.variableDeclarator(
						prevLocaleId,
						t.callExpression(t.memberExpression(t.identifier('React'), t.identifier('useRef')), [t.identifier('locale')])
					)])

					const useEffectUpdatePrevDecl = t.expressionStatement(
						t.callExpression(t.memberExpression(t.identifier('React'), t.identifier('useEffect')), [
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
						t.conditionalExpression(
							t.binaryExpression(
								"!==",
								localeId,
								t.memberExpression(prevLocaleId, t.identifier('current'))
							),
							t.memberExpression(
								t.identifier('Map'),
								t.memberExpression(t.identifier('prevLocaleRef'), t.identifier('current')),
								true
							),
							t.nullLiteral()
						)
					)])

					const propsId = t.identifier('props');

					const returnStmt = t.returnStatement(
						t.jsxElement(
							t.jsxOpeningElement(
								t.jsxMemberExpression(t.jsxIdentifier('React'), t.jsxIdentifier('Suspense')),
								[t.jsxAttribute(t.jsxIdentifier('fallback'), t.jsxExpressionContainer(
									t.logicalExpression(
										"&&",
										t.identifier(fallbackName),
										t.jsxElement(
											t.jsxOpeningElement(
												t.jsxIdentifier(fallbackName),
												[ t.jsxSpreadAttribute(propsId) ],
												true
											),
											null,
											[],
											true
										)
									)
								))],
								false
							),
							t.jsxClosingElement(
								t.jsxMemberExpression(t.jsxIdentifier('React'), t.jsxIdentifier('Suspense'))
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
							useLocaleDecl,
							usePrevLocaleDecl,
							useEffectUpdatePrevDecl,
							mapDecl,
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
								otherAttrs,
								true
							),
							null,
							[],
							true
						)
					);
					modified = true;
				},
			});

			translations.forEach((map, locale) => {
				const exports: string[] = [];
				map.forEach((expr, key) => {
					const jsxCode = generate(expr, {}).code;
					if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) {
						// Se l'utente ha scritto ({ name }) => <>Ciao, {name}</>
						// lo esportiamo così com'è, come componente React
						exports.push(`export const ${key} = ${jsxCode};`);
					} else {
						// altrimenti incapsuliamo il literal/JSX in un componente che non prende props
						exports.push(`export const ${key} = ({}) => (${jsxCode});`);
					}
				});

				const moduleContent = `
${exports.join('\n\n')}

export default { ${Array.from(map.keys()).join(', ')} };
`;
				virtualModules[`${virtualModulePrefix}/${locale}.jsx`] = moduleContent
			});

			if (modified) {
				let hasReactDefaultImport = false;

				ast.program.body.forEach(node => {
					if (
						t.isImportDeclaration(node) &&
						node.specifiers.some(spec =>
							t.isImportDefaultSpecifier(spec) && spec.local.name === "React"
						)
					) {
						hasReactDefaultImport = true;
					}
				});

				if (!hasReactDefaultImport) {
					// Add 'import React from 'react';
					ast.program.body.unshift(
						t.importDeclaration(
							[t.importDefaultSpecifier(t.identifier("React"))],
							t.stringLiteral("react")
						)
					);
				}

				let hasUseLocaleImport = false;

				ast.program.body.forEach(node => {
					if (
						t.isImportDeclaration(node) &&
						node.specifiers.some(spec =>
							t.isImportSpecifier(spec) && spec.local.name === useLocaleName
						)
					) {
						hasUseLocaleImport = true;
					}
				});

				if (!hasUseLocaleImport) {
					// Add 'import { useLocaleName } from 'useLocaleImportPath';
					ast.program.body.unshift(
						t.importDeclaration(
							[t.importSpecifier(t.identifier(useLocaleName), t.identifier(useLocaleName))],
							t.stringLiteral(useLocaleImportPath)
						)
					);
				}

				const output = generate(ast, {}, code).code;

				return {
					code: output,
					map: null,
				};
			}

			return null;
		},

		async handleHotUpdate({ file, server, modules }) {
			if (!file.endsWith('.tsx') || !filter(file)) {
				return;
			}

			const invalidatedModules = new Set<ModuleNode>()
			for (const modId of Object.keys(virtualModules)) {
				const mod = await server.moduleGraph.getModuleByUrl(modId);
				invalidatedModules.add(mod!);

				delete virtualModules[modId];
				server.moduleGraph.invalidateModule(mod!);
			}

			return Array.from(invalidatedModules);
		}
	};
}

import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: "module",
			},
		},
		plugins: {
			"@typescript-eslint": tsPlugin,
		},
		rules: {
			// TypeScript
			"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/explicit-function-return-type": "off",

			// 代码质量
			"no-console": "off",
			"no-debugger": "warn",
			"no-duplicate-imports": "error",
			"prefer-const": "error",
			"no-var": "error",

			// 风格（与 .prettierrc 的双引号、分号一致）
			semi: ["error", "always"],
			quotes: ["error", "double", { avoidEscape: true }],
			"comma-dangle": ["error", "always-multiline"],
		},
	},
	{
		ignores: ["node_modules/**", "*.js"],
	},
];

/**
 * Smoke test：不依赖运行时与网络，校验扩展的关键契约。
 *
 * 覆盖范围：
 *   1. index.ts 中实际存在的注册点：pi.on("tool_call")、pi.registerCommand("backups")
 *   2. package.json 的 pi.extensions 指向存在的入口文件
 *   3. LICENSE 存在且首行为 "MIT License"
 *
 * 备份行为本身（真实文件复制、危险命令解析）不在本测试范围内。
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const failures = [];

/** 记录一条断言结果 */
function check(name, condition, detail) {
	if (condition) {
		console.log(`ok - ${name}`);
		return;
	}
	const message = `${name}: ${detail}`;
	failures.push(message);
	console.error(`not ok - ${name}: ${detail}`);
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

// 1. 注册点
const source = readFileSync(join(root, "index.ts"), "utf8");
const registrations = [
	{ label: 'index.ts 注册 pi.on("tool_call")', pattern: /pi\.on\(\s*"tool_call"/ },
	{
		label: 'index.ts 注册 pi.registerCommand("backups")',
		pattern: /pi\.registerCommand\(\s*"backups"/,
	},
];
for (const { label, pattern } of registrations) {
	check(label, pattern.test(source), "index.ts 中未找到该注册点");
}

// 2. 扩展入口
const extensions = Array.isArray(pkg.pi?.extensions) ? pkg.pi.extensions : [];
check("package.json 声明 pi.extensions", extensions.length > 0, "缺少 pi.extensions 或为空数组");
check(
	'pi.extensions 包含 "./index.ts"',
	extensions.includes("./index.ts"),
	`实际为 ${JSON.stringify(extensions)}`,
);
for (const entry of extensions) {
	const abs = resolve(root, entry);
	check(`入口 ${entry} 存在`, existsSync(abs), `${abs} 不存在`);
}

// 3. LICENSE
const licensePath = join(root, "LICENSE");
check("LICENSE 文件存在", existsSync(licensePath), `${licensePath} 不存在`);
if (existsSync(licensePath)) {
	const firstLine = readFileSync(licensePath, "utf8")
		.replace(/^\uFEFF/, "")
		.split(/\r?\n/, 1)[0]
		.trim();
	check(
		'LICENSE 首行为 "MIT License"',
		firstLine === "MIT License",
		`实际为 ${JSON.stringify(firstLine)}`,
	);
}

if (failures.length > 0) {
	console.error(`\n${failures.length} 项断言失败：`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}

console.log("\n所有断言通过");

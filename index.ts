/**
 * Backup Guard Extension — 副作用操作前自动备份
 *
 * 在执行有副作用的操作之前，先把将要被影响的文件复制到备份目录，
 * 实现"先备份，后执行"。覆盖范围：
 *   - write 工具：写入前备份目标文件（新建文件无需备份，自动跳过）
 *   - edit 工具：修改前备份目标文件
 *   - bash 工具：检测到删除/移动类危险命令（rm、rmdir、del、rd、
 *     truncate、mv、Remove-Item、Move-Item 等）时，备份命令涉及的文件
 *
 * 备份目录结构（借鉴 .history 风格）：
 *   <项目>/.backups/<相对路径>/<基名>_<时间戳>.<扩展名>   ← 文件快照（修改/删除统一）
 *   <项目>/.backups/<相对路径>/<时间戳>/                  ← 目录快照（rm -rf 整树）
 *
 * 删除与修改统一为"操作前快照"，恢复 = 复制回原路径。
 * 操作上下文可通过 pi 会话历史追溯。
 *
 * 默认备份目录为当前工作目录下的 .backups/。
 * 只处理工作目录内的文件（工作目录外的跳过）。
 * 若项目是 git 仓库，建议把 .backups/ 加入 .gitignore。
 *
 * 查看备份：运行 /backups 命令
 * 清理备份：手动删除 .backups/ 下不需要的目录/文件
 *
 * 行为说明：
 *   - 备份成功 → 通知位置 → 放行原操作
 *   - 目标文件不存在 → 跳过（如 write 新建文件），正常放行
 *   - 目标位于备份目录 .backups/ 内 → 跳过（防止递归复制自身）
 *   - 目标位于工作目录外 → 跳过（不处理）
 *   - 备份失败（权限/磁盘问题）→ 阻止原操作
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { copyFile, cp, mkdir, readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

/** 备份根目录名 */
const BACKUP_DIR_NAME = ".backups";

/** 备份根目录（基于当前工作目录） */
function backupRoot(cwd: string): string {
	return join(cwd, BACKUP_DIR_NAME);
}

/** 是否在备份失败时阻止原操作 */
const BLOCK_ON_BACKUP_FAILURE = true;

/** 危险 bash 命令模式（Unix + Windows/PowerShell） */
const DANGEROUS_COMMAND_RE = /\b(?:rm|rmdir|del|rd|truncate|mv|Remove-Item|Move-Item)\b/i;

/**
 * 从危险命令中提取候选路径 token。
 * 尽力而为：跳过 flags（-x、/x）、保留其余裸 token 作为候选，
 * 不存在于磁盘上的 token 在备份阶段会被自然跳过。
 */
function extractPathTokens(segment: string): string[] {
	const tokens: string[] = [];
	for (const raw of segment.split(/\s+/)) {
		let t = raw.trim();
		if (!t) continue;
		// 去引号
		if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
			t = t.slice(1, -1);
		}
		// 跳过 flags：-rf、--force、/q 等
		if (t.startsWith("-") || /^\/[a-zA-Z][a-zA-Z0-9]*$/.test(t)) continue;
		// 跳过重定向/操作符残留
		if (/^(>|>>|<|\||&)$/.test(t)) continue;
		tokens.push(t);
	}
	return tokens;
}

/** 将 bash 命令按 ; && || | & 分段，返回危险段 */
function dangerousSegments(command: string): string[] {
	const cleaned = command.replace(/2>&1/g, "");
	return cleaned.split(/\s*(?:&&|\|\||[;&|])\s*/).filter((seg) => DANGEROUS_COMMAND_RE.test(seg));
}

/** 展开 ~ 前缀并转为绝对路径 */
function toAbsolute(cwd: string, p: string): string {
	if (p.startsWith("~")) {
		const home = process.env.USERPROFILE || process.env.HOME || "";
		return join(home, p.slice(1));
	}
	return isAbsolute(p) ? p : resolve(cwd, p);
}

/** 生成时间戳（带随机后缀，防并发冲突） */
function timestamp(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 备份单个文件或目录到 .history 式目录结构。
 *
 * 文件 → .backups/<相对路径>/<基名>_<时间戳>.<扩展名>
 * 目录 → .backups/<相对路径>/<时间戳>/
 *
 * 返回 true=已备份，false=无需备份。
 * 抛出异常=备份失败（调用方决定阻止/告警）。
 */
async function backupPath(cwd: string, rawPath: string, ts: string): Promise<boolean> {
	const abs = toAbsolute(cwd, rawPath);

	// 只处理工作目录内的路径
	const cwdSep = cwd + sep;
	if (abs !== cwd && !abs.startsWith(cwdSep)) return false;

	// 防自复制：备份目录内跳过
	const root = backupRoot(cwd) + sep;
	if (abs === backupRoot(cwd) || abs.startsWith(root)) return false;

	let st: import("fs").Stats;
	try {
		st = await stat(abs);
	} catch {
		return false; // 不存在，无需备份
	}

	const rel = relative(cwd, abs);
	if (!rel || rel === ".") return false; // 跳过 cwd 本身

	const bkRoot = backupRoot(cwd);

	if (st.isDirectory()) {
		// 目录快照：.backups/<relpath>/<ts>/
		const dest = join(bkRoot, rel, ts);
		await mkdir(dirname(dest), { recursive: true });
		await cp(abs, dest, { recursive: true, force: false, errorOnExist: false });
	} else {
		// 文件快照：.backups/<relpath>/<基名>_<ts>.<扩展名>
		const parentDir = join(bkRoot, dirname(rel));
		const ext = extname(abs);
		const stem = basename(abs, ext);
		const dest = join(parentDir, `${stem}_${ts}${ext}`);
		await mkdir(parentDir, { recursive: true });
		await copyFile(abs, dest);
	}
	return true;
}

// ---------------------------------------------------------------------------
// 扩展主体
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		let candidates: string[] = [];
		let opDesc = "";

		if (event.toolName === "write" || event.toolName === "edit") {
			const p = event.input.path as string | undefined;
			if (typeof p !== "string" || !p.trim()) return undefined;
			candidates = [p];
			opDesc = event.toolName;
		} else if (event.toolName === "bash") {
			const command = event.input.command as string | undefined;
			if (typeof command !== "string" || !command.trim()) return undefined;

			const segs = dangerousSegments(command);
			if (segs.length === 0) return undefined;

			opDesc = "bash 危险命令";
			for (const seg of segs) candidates.push(...extractPathTokens(seg));
			if (candidates.length === 0) {
				if (ctx.hasUI) {
					ctx.ui.notify(
						`⚠️ 检测到危险命令但无法解析目标路径，未备份：${command.slice(0, 120)}`,
						"warning",
					);
				}
				return undefined;
			}
		} else {
			return undefined;
		}

		// 去重
		candidates = [...new Set(candidates)];
		if (candidates.length === 0) return undefined;

		// 同一次操作共享一个时间戳（"一起备份"）
		const ts = timestamp();

		let backedUp = 0;
		const errors: string[] = [];
		for (const c of candidates) {
			try {
				if (await backupPath(ctx.cwd, c, ts)) backedUp++;
			} catch (e: unknown) {
				errors.push(`${c}: ${e instanceof Error ? e.message : String(e)}`);
			}
		}

		if (errors.length > 0) {
			const reason = `备份失败，已阻止 ${opDesc} 操作: ${errors.join("; ")}`;
			if (ctx.hasUI) ctx.ui.notify(`❌ ${reason}`, "error");
			return BLOCK_ON_BACKUP_FAILURE ? { block: true, reason } : undefined;
		}

		if (backedUp > 0 && ctx.hasUI) {
			ctx.ui.notify(`✅ ${opDesc} 前已备份 ${backedUp} 个文件到 ${BACKUP_DIR_NAME}/`, "info");
		}

		return undefined;
	});

	// /backups — 查看最近备份
	pi.registerCommand("backups", {
		description: "查看最新备份记录（最近 10 条）",
		handler: async (_args, ctx) => {
			const root = backupRoot(ctx.cwd);
			const pattern = /\d{8}-\d{6}-[a-z0-9]{4}/;
			const results: { ts: string; path: string }[] = [];

			async function walk(dir: string): Promise<void> {
				try {
					const entries = await readdir(dir, { withFileTypes: true });
					for (const entry of entries) {
						const full = join(dir, entry.name);
						const match = entry.name.match(pattern);
						if (match) {
							results.push({ ts: match[0], path: full });
						}
						if (entry.isDirectory()) {
							await walk(full);
						}
					}
				} catch {
					/* skip unreadable */
				}
			}

			try {
				await walk(root);
				results.sort((a, b) => b.ts.localeCompare(a.ts));
				const list = results.slice(0, 10);

				const text =
					list.length > 0
						? `\n最近备份：\n${list.map((r) => `  ${r.path}`).join("\n")}`
						: "\n（暂无备份）";

				if (ctx.hasUI) {
					ctx.ui.notify(`备份根目录：${root}${text}`, "info");
				} else {
					console.log(`备份根目录：${root}${text}`);
				}
			} catch {
				if (ctx.hasUI) {
					ctx.ui.notify(`备份根目录：${root}\n（暂无备份）`, "info");
				} else {
					console.log(`备份根目录：${root}\n（暂无备份）`);
				}
			}
		},
	});
}

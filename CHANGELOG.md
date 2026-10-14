# Changelog

所有重要的版本变更都会记录在此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/)。

## [Unreleased]

## [0.1.0] - 2026-10-14

### Added

- `pi.on("tool_call")` 监听器，在 `write`、`edit` 与危险 `bash` 命令执行前对受影响的文件做操作前快照
- `write` 与 `edit` 以工具入参 `path` 作为备份目标，新建文件因磁盘上不存在而自动跳过
- `bash` 命令先去掉 `2>&1`，再按 `;`、`&&`、`||`、`|`、`&` 分段，只保留匹配 `\b(?:rm|rmdir|del|rd|truncate|mv|Remove-Item|Move-Item)\b` 的段并从中提取路径 token，跳过 flag 与操作符
- 备份根目录 `.backups`，文件快照写入 `.backups/<相对路径>/<基名>_<时间戳><扩展名>`，目录快照写入 `.backups/<相对路径>/<时间戳>/`
- 同一次操作的所有路径共享一个时间戳（`YYYYMMDD-HHMMSS-` 加 4 位随机后缀），避免并发冲突
- 路径解析会展开 `~` 前缀（读 `USERPROFILE`，回退 `HOME`）并把相对路径按工作目录转成绝对路径
- 跳过工作目录之外、`.backups/` 之内以及工作目录本身的路径，防止越界写入与递归自我复制
- 备份失败时以失败原因阻止原工具调用；危险命令解析不出路径时提示警告并放行；界面不可用时保持静默
- `/backups` 命令，递归遍历 `.backups/` 并按时间戳倒序列出最近 10 条备份记录
- `BACKUP_DIR_NAME` 与 `BLOCK_ON_BACKUP_FAILURE` 两个常量配置项，扩展不读取任何配置文件
- MIT LICENSE、SECURITY.md、CODE_OF_CONDUCT.md 与中英文 README
- 契约冒烟测试、`npm pack` 内容校验与提交信息校验脚本
- CI 工作流（Node 22 与 24 上的 typecheck、lint、test、format:check、check:pack 与提交信息校验）、gitleaks 密钥扫描与 dependabot 依赖更新配置

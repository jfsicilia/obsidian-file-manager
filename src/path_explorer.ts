import { MockWorkspace } from "obsidian-internals";
import { MarkdownView, ButtonComponent, setIcon } from "obsidian";
import FileManagerPlugin from "main";
import { getVaultAbsolutePath } from "file_manager";
import { openFile } from "open_with_cmd";
import { promises as fsa, Dirent } from "fs";
import ignore, { Ignore } from "ignore";
import path from "path";
import {
	PathPattern,
	AppCmd,
	APPLY_TO_FILES,
	APPLY_TO_FOLDERS,
} from "settings";

// TreeNode interface for the directory tree structure.
interface TreeNode {
	// File/folder name.
	name: string;
	// Full path to the file/folder.
	path: string;
	// True if it's a directory, false if it's a file.
	isDirectory: boolean;
	// Children nodes if it's a directory.
	children?: TreeNode[];
	// Number of files/folders immediately inside this directory. Only set
	// for directories when showCount is enabled.
	fileCount?: number;
	folderCount?: number;
	// Total number of files/folders nested (at any depth) inside this
	// directory. Only set for directories when recursiveCount is enabled.
	totalFileCount?: number;
	totalFolderCount?: number;
}

// Constants for the pathexplorer codeblock.
const MAX_DEPTH = 3;
const MAX_FILES = 100;
// Options for the flat parameter.
const HIDE_FILES_PARAM = "hide-files";
const HIDE_FOLDERS_PARAM = "hide-folders";
// Options for the showAbsolutePath parameter.
const ALL_PATHS = "all";
const ROOT_PATH = "root";
const NO_PATH = "none";

// Configuration for the pathexplorer codeblock.
interface PathExplorerConfig {
	// Required. The paths to explore (1 or many).
	paths: string[];
	// Optional. Patterns to ignore files/folders. Follows .gitignore syntax.
	ignorePatterns: string[];
	// Maximum depth to explore.
	maxDepth: number;
	// Maximum number of files to show.
	maxFiles: number;
	// If true, include the root directory in the tree.
	includeRoot: boolean;
	// If true, show all files/folders in a flat structure.
	flat: boolean;
	// If true, hide folders in the tree (only for flat structure).
	hideFolders: boolean;
	// If true, hide files in the tree (only for flat structure).
	hideFiles: boolean;
	// If true, hide Open with.. icons.
	hideIcons: boolean;
	// Show absolute path in the tree.
	showAbsolutePath: typeof ALL_PATHS | typeof ROOT_PATH | typeof NO_PATH;
	// If true, show the number of files/folders immediately inside each folder.
	showCount: boolean;
	// If true, show the total number of files/folders nested (at any depth)
	// inside each folder. Independent of showCount: if both are set, both
	// counts are shown side by side; if only this one is set, only the
	// recursive total is shown.
	recursiveCount: boolean;
}

// Default configuration for the pathexplorer codeblock.
const DEFAULT_CONFIG: PathExplorerConfig = {
	paths: [],
	ignorePatterns: [],
	maxDepth: MAX_DEPTH,
	maxFiles: MAX_FILES,
	includeRoot: false,
	flat: false,
	hideFiles: false,
	hideFolders: false,
	hideIcons: false,
	showAbsolutePath: NO_PATH,
	showCount: false,
	recursiveCount: false,
};

// If a line in a pathexplorer codeblock starts with COMMENT_TOKEN, it's ignored.
const COMMENT_TOKEN = "#";

// Parameters key/value separator for the pathexplorer codeblock configuration.
const PARAM_SEP = " ";

// Prefix for local file links.
export const HREF_FILE_PREFIX = "file:///";

// Parameters for the pathexplorer codeblock configuration.
const PATH_PARAM = "path";
const IGNORE_PARAM = "ignore";
const MAX_DEPTH_PARAM = "max-depth";
const MAX_FILES_PARAM = "max-files";
const INCLUDE_ROOT_PARAM = "include-root";
const FLAT_PARAM = "flat";
const HIDE_ICONS_PARAM = "hide-icons";
const ABSOLUTE_PATH = "absolute-path";
const SHOW_COUNT_PARAM = "show-count";
const SHOW_COUNT_RECURSIVE_PARAM = "show-count-recursive";

/**
 * Append the file/folder count (e.g. `(2📂10📄)`) to the given list item
 * `li` for the given folder `node`, according to `pathExplorer`'s
 * `showCount`/`recursiveCount` configuration. If both are set, immediate
 * and recursive counts are shown side by side, separated by `|`. Does
 * nothing if neither is enabled, or if `node` is not a directory.
 * @param li The list item element for the folder.
 * @param node The folder node to show the count for.
 * @param pathExplorer The configuration for the pathexplorer codeblock.
 */
function appendCount(
	li: HTMLElement,
	node: TreeNode,
	pathExplorer: PathExplorerConfig
) {
	if (!pathExplorer.showCount && !pathExplorer.recursiveCount) return;
	if (!node.isDirectory) return;

	const appendCountNum = (container: HTMLElement, text: string) =>
		container.createSpan({ cls: "path-explorer-count-num", text });
	const appendCountIcon = (container: HTMLElement, icon: string) =>
		container.createSpan({
			cls: "path-explorer-count-icon",
			text: icon,
		});
	const appendCounts = (
		container: HTMLElement,
		folders: number,
		files: number
	) => {
		appendCountNum(container, `${folders}`);
		appendCountIcon(container, "📂");
		appendCountNum(container, `${files}`);
		appendCountIcon(container, "📄");
	};

	const countEl = li.createSpan({ cls: "path-explorer-count" });
	appendCountNum(countEl, "(");
	if (pathExplorer.showCount)
		appendCounts(countEl, node.folderCount!, node.fileCount!);
	if (pathExplorer.showCount && pathExplorer.recursiveCount)
		appendCountNum(countEl, "|");
	if (pathExplorer.recursiveCount)
		appendCounts(countEl, node.totalFolderCount!, node.totalFileCount!);
	appendCountNum(countEl, ") ");
}

/**
 * Exception class for PathExplorer. Used if any error comes up when parsing
 * configuration.
 */
class PathExplorerException extends Error {
	constructor(message: string) {
		super(message); // Pass the message to the parent Error class
		this.name = "PathExplorerException"; // Set a custom name for the error
		Object.setPrototypeOf(this, PathExplorerException.prototype); // Maintain prototype chain
	}
}

/**
 * PathExplorer class process pathexplorer codeblocks and generates
 * a view of the directory structure.
 *
 */
export class PathExplorer {
	private plugin: FileManagerPlugin;
	private workspace: MockWorkspace;

	/**
	 * Create a new PathExplorer instance.
	 * @param plugin The FileManagerPlugin instance from where the PathExplorer
	 * is created.
	 */
	constructor(plugin: FileManagerPlugin) {
		this.plugin = plugin;
		this.workspace = plugin.app.workspace as MockWorkspace;
	}

	static matchPattern(
		pattern: PathPattern,
		path: string,
		isDirectory: boolean,
		apps: AppCmd[]
	): AppCmd | undefined {
		// Check if pattern applies to file/folder.
		const notApplies =
			(pattern.applyTo === APPLY_TO_FILES && isDirectory) ||
			(pattern.applyTo === APPLY_TO_FOLDERS && !isDirectory);
		if (notApplies) return undefined;

		// Check if the path matches the regex pattern.
		const re = new RegExp(pattern.regex);
		if (!re.test(path)) return undefined;

		return apps.find((app) => app.name === pattern.appName);
	}

	/**
	 * Process the code block and generate the file explorer.
	 * @param source The source of the code block.
	 * @param el The element where to append the generated HTML tree.
	 */
	async processCodeBlock(source: string, el: HTMLElement) {
		try {
			// Parse config
			const pathExplorer = await this.parseConfig(source);

			// Retrieve directory structure
			const tree = await this.buildDirectoryTree(pathExplorer);

			// Create a div element to hold the tree and the refresh button.
			const treeEl = el.createDiv({ cls: "path-explorer" });
			new ButtonComponent(treeEl)
				.setIcon("rotate-ccw")
				.setTooltip("Refresh")
				.setClass("path-explorer-refresh-button")
				.onClick(() => {
					const view =
						this.workspace.getActiveViewOfType(MarkdownView);
					if (view) view.previewMode.rerender(true);
				});

			// Generate the HTML tree
			this.generateTreeHtml(tree, treeEl, pathExplorer);
		} catch (error) {
			if (error instanceof PathExplorerException)
				el.createDiv({ cls: "path-explorer-error" }).createSpan({
					text: `[PathExplorerError⚠️] ${error.message}`,
				});
		}
	}

	/**
	 * Parse the configuration of the pathexplorer codeblock from the string
	 * inside (`source`).
	 * @param source The string inside the pathexplorer codeblock.
	 * @throws {PathExplorerException} If the configuration is invalid.
	 */
	async parseConfig(source: string): Promise<PathExplorerConfig> {
		// Create a new pathExplorer configuration with default values
		const pathExplorer: PathExplorerConfig = {
			...DEFAULT_CONFIG,
			// Always create a new array to avoid modifying the default array.
			paths: [...DEFAULT_CONFIG.paths],
			ignorePatterns: [...DEFAULT_CONFIG.ignorePatterns],
		};
		source.split("\n").forEach((line) => {
			line = line.trim();
			if (!line || line.startsWith(COMMENT_TOKEN)) return;

			// Config parameters are key/[value] pairs separated by a space.
			const index = line.indexOf(PARAM_SEP);
			const key = index >= 0 ? line.slice(0, index).trim() : line;
			const value = index >= 0 ? line.slice(index + 1).trim() : "";
			switch (key.toLowerCase()) {
				case PATH_PARAM:
					pathExplorer.paths.push(value);
					break;

				case IGNORE_PARAM:
					pathExplorer.ignorePatterns.push(value);
					break;

				case MAX_DEPTH_PARAM:
					pathExplorer.maxDepth = parseInt(value);
					if (isNaN(pathExplorer.maxDepth))
						throw new PathExplorerException(
							`Invalid ${MAX_DEPTH_PARAM} value: ${value}`
						);
					break;

				case MAX_FILES_PARAM:
					pathExplorer.maxFiles = parseInt(value);
					if (isNaN(pathExplorer.maxFiles))
						throw new PathExplorerException(
							`Invalid ${MAX_FILES_PARAM} value: ${value}`
						);
					break;

				case INCLUDE_ROOT_PARAM:
					pathExplorer.includeRoot = true;
					if (value)
						throw new PathExplorerException(
							`No value expected for ${INCLUDE_ROOT_PARAM}.`
						);
					break;

				case HIDE_ICONS_PARAM:
					pathExplorer.hideIcons = true;
					if (value)
						throw new PathExplorerException(
							`No value expected for ${HIDE_ICONS_PARAM}.`
						);
					break;

				case FLAT_PARAM:
					pathExplorer.flat = true;
					if (value === HIDE_FILES_PARAM)
						pathExplorer.hideFiles = true;
					else if (value === HIDE_FOLDERS_PARAM)
						pathExplorer.hideFolders = true;
					else if (value)
						throw new PathExplorerException(
							`Invalid ${FLAT_PARAM} option. Valid options: [${HIDE_FILES_PARAM}|${HIDE_FOLDERS_PARAM}|<none>]`
						);
					break;

				case SHOW_COUNT_PARAM:
					pathExplorer.showCount = true;
					if (value)
						throw new PathExplorerException(
							`No value expected for ${SHOW_COUNT_PARAM}.`
						);
					break;

				case SHOW_COUNT_RECURSIVE_PARAM:
					pathExplorer.recursiveCount = true;
					if (value)
						throw new PathExplorerException(
							`No value expected for ${SHOW_COUNT_RECURSIVE_PARAM}.`
						);
					break;

				case ABSOLUTE_PATH:
					if (value === ALL_PATHS)
						pathExplorer.showAbsolutePath = ALL_PATHS;
					else if (value === ROOT_PATH)
						pathExplorer.showAbsolutePath = ROOT_PATH;
					else if (value === NO_PATH)
						pathExplorer.showAbsolutePath = NO_PATH;
					else
						throw new PathExplorerException(
							`Invalid ${ABSOLUTE_PATH} option. Valid options: [${ALL_PATHS}|${ROOT_PATH}|${NO_PATH}]`
						);
					break;

				default:
					throw new PathExplorerException(`Unknown option: ${key}`);
			}
		});
		// Check if at least one path is provided
		if (!pathExplorer.paths || pathExplorer.paths.length === 0)
			throw new PathExplorerException(
				"Path not provided (examples path /my/path | path ../relative | path c:\\my\\path)."
			);

		for (let i = 0; i < pathExplorer.paths.length; i++) {
			// Substitute environment variables in the path. Could be in Unix
			// format ($HOME) or Windows format (%USERPROFILE%).
			// HOME will be replaced by USERPROFILE if HOME is not defined.
			pathExplorer.paths[i] = pathExplorer.paths[i].replace(
				/\$([A-Za-z_][A-Za-z0-9_]*)|%([A-Za-z_][A-Za-z0-9_]*)%/g,
				(_, unixEnvVar, winEnvVar) => {
					const envVar = unixEnvVar || winEnvVar;
					if (
						envVar === "HOME" &&
						!process.env.HOME &&
						process.env.USERPROFILE
					)
						return process.env.USERPROFILE;

					return (
						process.env[envVar] ||
						`$${unixEnvVar || `%${winEnvVar}%`}`
					);
				}
			);

			// If the path is relative, convert it to absolute adding vault path
			// and the current file's parent path.
			if (!path.isAbsolute(pathExplorer.paths[i])) {
				pathExplorer.paths[i] = path.join(
					getVaultAbsolutePath(),
					this.workspace.getActiveFile()!.parent!.path,
					pathExplorer.paths[i]
				);
			}

			try {
				await fsa.access(pathExplorer.paths[i]);
			} catch (error) {
				throw new PathExplorerException(
					`Path provided does not exist: ${pathExplorer.paths[i]}`
				);
			}
		}

		return pathExplorer;
	}

	/**
	 * Build a tree structure from `pathExplorer.path`. `pathExplorer` has also
	 * the configuration for the directory tree generation.
	 * @param pathExplorer The configuration for the directory tree generation.
	 * @returns The tree structure of the directory.
	 */
	async buildDirectoryTree(
		pathExplorer: PathExplorerConfig
	): Promise<TreeNode[]> {
		/**
		 * Traverse the directory structure starting from the given `currentPath`.
		 * The `ig` parameter is an instance of `Ignore` to check if the file/folder
		 * should be ignored. The `level` parameter is the current depth level in the
		 * directory structure. The `nFiles` parameter is the number of files processed
		 * so far. `pathExplorer` has the configuration that will be used to traverse
		 * the directory structure.
		 * @param currentPath The current path to traverse.
		 * @param ig The ignore instance to check if the file/folder should be ignored.
		 * @param level The current depth level in the directory structure.
		 * @returns The tree structure of the directory.
		 */
		async function traverse(
			currentPath: string,
			rootPath: string,
			ig: Ignore,
			level: number = 0
		): Promise<TreeNode | null> {
			// If level exceeds the max depth, return.
			if (level > pathExplorer.maxDepth) return null;
			// If the number of files exceeds the limit, return.
			if (nFiles >= pathExplorer.maxFiles) return null;

			const isDirectory = (await fsa.stat(currentPath)).isDirectory();
			// If not rootPath, check if the current file/folder should be ignored.
			if (rootPath !== currentPath) {
				// Relative path to current file/folder from rootPath.
				const relative =
					path.relative(rootPath, currentPath) +
					(isDirectory ? "/" : "");
				const test = ig.test(relative);
				if (test.ignored && !test.unignored) return null;
			}
			nFiles++;

			// Check if the path should be shown as absolute.
			let showAbs = false;
			if (pathExplorer.showAbsolutePath === ALL_PATHS) showAbs = true;
			else if (pathExplorer.showAbsolutePath === ROOT_PATH && level === 0)
				showAbs = true;
			showAbs = isDirectory ? showAbs : false;

			const node: TreeNode = {
				name: showAbs ? currentPath : path.basename(currentPath),
				path: currentPath,
				isDirectory: isDirectory,
			};

			if (isDirectory) {
				// Node is a directory, create children array and traverse it.
				node.children = [];
				// Read the directory entries and traverse them.
				const entries = await fsa.readdir(currentPath, {
					withFileTypes: true,
				});
				for (const entry of entries) {
					const fullPath = path.join(currentPath, entry.name);
					const child = await traverse(
						fullPath,
						rootPath,
						ig,
						level + 1
					);
					if (child) node.children.push(child);
				}

				if (pathExplorer.showCount) {
					const counts = countImmediate(
						entries,
						currentPath,
						rootPath,
						ig
					);
					node.fileCount = counts.files;
					node.folderCount = counts.folders;
				}

				if (pathExplorer.recursiveCount) {
					const totals = await countRecursive(
						currentPath,
						rootPath,
						ig
					);
					node.totalFileCount = totals.files;
					node.totalFolderCount = totals.folders;
				}
			}
			return node;
		}

		/**
		 * Count files and folders immediately inside `currentPath`, given its
		 * already-read `entries`, skipping entries matched by `ig`. Kept
		 * separate from `node.children`: children are only added when their
		 * own traverse() call survives the `maxDepth` cutoff, so deriving the
		 * count from `node.children` would make a folder right at that
		 * boundary always report an empty count even when it has content
		 * (e.g. `max-depth 0` showing `(0📂 0📄)`).
		 * @param entries The already-read directory entries of `currentPath`.
		 * @param currentPath The directory these `entries` belong to.
		 * @param rootPath The root path used to resolve ignore patterns.
		 * @param ig The ignore instance to check if a file/folder should be ignored.
		 */
		function countImmediate(
			entries: Dirent[],
			currentPath: string,
			rootPath: string,
			ig: Ignore
		): { files: number; folders: number } {
			let files = 0;
			let folders = 0;
			for (const entry of entries) {
				const fullPath = path.join(currentPath, entry.name);
				const isDir = entry.isDirectory();
				const relative =
					path.relative(rootPath, fullPath) + (isDir ? "/" : "");
				const test = ig.test(relative);
				if (test.ignored && !test.unignored) continue;
				if (isDir) folders++;
				else files++;
			}
			return { files, folders };
		}

		/**
		 * Recursively count files and folders nested (at any depth) inside
		 * `dirPath`, skipping entries matched by `ig`. Unlike `traverse`,
		 * this is not limited by `maxDepth`/`maxFiles`: it's only used to
		 * compute `show-count-recursive` totals, independent of what is
		 * actually rendered in the tree.
		 * @param dirPath The directory to count files/folders inside.
		 * @param rootPath The root path used to resolve ignore patterns.
		 * @param ig The ignore instance to check if a file/folder should be ignored.
		 */
		async function countRecursive(
			dirPath: string,
			rootPath: string,
			ig: Ignore
		): Promise<{ files: number; folders: number }> {
			let files = 0;
			let folders = 0;
			const entries = await fsa.readdir(dirPath, {
				withFileTypes: true,
			});
			for (const entry of entries) {
				const fullPath = path.join(dirPath, entry.name);
				const isDir = entry.isDirectory();
				const relative =
					path.relative(rootPath, fullPath) + (isDir ? "/" : "");
				const test = ig.test(relative);
				if (test.ignored && !test.unignored) continue;

				if (isDir) {
					folders++;
					const sub = await countRecursive(fullPath, rootPath, ig);
					files += sub.files;
					folders += sub.folders;
				} else {
					files++;
				}
			}
			return { files, folders };
		}

		// Count of files/folders traversed so far.
		let nFiles = 0;

		// Create ignore instance with the ignore patterns.
		const ig: Ignore = ignore().add(pathExplorer.ignorePatterns);

		// Traverse the paths in pathExplorer.
		const result: TreeNode[] = [];
		for (let i = 0; i < pathExplorer.paths.length; i++) {
			const rootPath = pathExplorer.paths[i];
			const node = await traverse(rootPath, rootPath, ig);
			// If it was ignored, maxFiles was reached or maxDepth was reached
			// jump to the next path.
			if (!node) continue;

			// Include always files (!node.children). If it's a folder
			// include it if includeRoot is true.
			if (pathExplorer.includeRoot || !node.children) result.push(node);
			else result.push(...node.children);
		}
		return result;
	}

	/**
	 * Build the HTML tree by traversing the given `tree` and append it to
	 * the `treeEl` element. `pathExplorer` has the configuration for the HTML
	 * tree generation.
	 * @param tree The filesystem tree structure of the directory.
	 * @param treeEl The element where to append the generated HTML tree.
	 * @param pathExplorer The configuration for the HTML tree generation.
	 */
	generateTreeHtml(
		tree: TreeNode[],
		treeEl: HTMLElement,
		pathExplorer: PathExplorerConfig
	) {
		// Get the apps and patterns from the settings.
		const apps: AppCmd[] = this.plugin.settings.apps;
		const patterns: PathPattern[] = this.plugin.settings.patterns;

		/**
		 * Build the HTML tree by traversing the given `nodes` and append it to
		 * the `treeEl` element.
		 * @param nodes The filesystem tree structure of the directory.
		 * @param treeEl The element where to append the generated HTML tree.
		 */
		function buildHtml(nodes: TreeNode[], treeEl: HTMLElement) {
			/**
			 * Create a list item for the given `node` and append it to the
			 * tree element (`treeEl`). The list item will contain the path to
			 * the file/folder and clickable icons to open the file/folder with
			 * the specified apps if the path matches corresponding pattern.
			 */
			function createListItem(
				node: TreeNode,
				treeEl: HTMLElement
			): HTMLElement {
				// Show file/folder as a clickable link.
				const li = treeEl.createEl("li");
				li.createSpan({ text: node.isDirectory ? "📂  " : "📄 " });
				li.createEl("a", {
					href: `${HREF_FILE_PREFIX}${encodeURI(node.path)}`,
					cls: "external-link",
					text: node.name,
				});

				appendCount(li, node, pathExplorer);

				if (pathExplorer.hideIcons) return li;

				// Check if the node matches any Open with... pattern.
				patterns.forEach((pattern) => {
					const app = PathExplorer.matchPattern(
						pattern,
						node.path,
						node.isDirectory,
						apps
					);

					// Get the app info from the reference in pattern.
					if (!app) return;

					// Create clickable icon to open the file/folder with the app.
					const span = li.createSpan({ cls: "clickable" });
					setIcon(span, app.icon);
					span.addEventListener("click", () => {
						openFile(node.path, app.cmd, app.args);
					});
				});
				return li;
			}

			// Recursively build the HTML tree by traversing the nodes.
			for (const node of nodes) {
				if (node.isDirectory) {
					// Process folders!
					let li: HTMLElement | undefined;

					if (!pathExplorer.hideFolders)
						li = createListItem(node, treeEl);

					if (node.children && node.children.length > 0) {
						// If flat is true no need to create a new ul element.
						if (pathExplorer.flat) buildHtml(node.children, treeEl);
						// hideFolders can only be true if flat is true, so li is defined.
						else buildHtml(node.children, li!.createEl("ul"));
					}
				} else {
					// Process files!
					if (!pathExplorer.hideFiles) createListItem(node, treeEl);
				}
			}
		}

		return buildHtml(tree, treeEl.createEl("ul"));
	}
}

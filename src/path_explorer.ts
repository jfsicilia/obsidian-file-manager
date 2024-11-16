import {
	FileExplorer,
	FileOrFolderItem,
	FolderItem,
	FileItem,
	MockApp,
	MockVault,
	MockWorkspace,
	MockTree,
} from "obsidian-internals";
import { MarkdownView, ButtonComponent } from "obsidian";
import FileManagerPlugin from "main";
import { getVaultAbsolutePath } from "file_manager";
import fs from "fs";
import path from "path";

interface TreeNode {
	name: string;
	path: string;
	children?: TreeNode[];
}

/**
 * FileManager class provides a set of methods to interact with the file explorer.
 */
export class PathExplorer {
	private plugin: FileManagerPlugin;
	private app: MockApp;
	private vault: MockVault;
	private workspace: MockWorkspace;

	constructor(plugin: FileManagerPlugin) {
		this.plugin = plugin;
		this.app = plugin.app as MockApp;
		this.vault = plugin.app.vault as MockVault;
		this.workspace = plugin.app.workspace as MockWorkspace;
	}

	processCodeBlock(source: string, el: HTMLElement) {
		// Parse parameters
		const params = this.parseParameters(source);
		console.log(params);
		if (!params.path) return;
		if (!path.isAbsolute(params.path)) {
			params.path = path.join(
				getVaultAbsolutePath(),
				this.workspace.getActiveFile()!.parent!.path,
				params.path
			);
		}

		// Retrieve directory structure
		const tree = this.buildDirectoryTree(
			params.path,
			true,
			// params.recursive,
			new RegExp(params.ignore),
			true
		);
		// Create a div element to hold the tree and the refresh button.
		const treeEl = el.createDiv({ cls: "path-explorer" });
		new ButtonComponent(treeEl)
			.setIcon("rotate-ccw")
			.setTooltip("Refresh")
			.setClass("refresh-button")
			.onClick(() => {
				const view = this.workspace.getActiveViewOfType(MarkdownView);
				if (view) view.previewMode.rerender(true);
			});
		// Generate the HTML tree
		this.generateTreeHtml(tree, treeEl);
	}

	parseParameters(source: string): {
		path: string;
		recursive: boolean;
		ignore: string;
	} {
		const params: any = {};
		source.split("\n").forEach((line) => {
			line = line.trim();
			if (!line) return;
			const index = line.indexOf(":");
			if (index) {
				const key = line.slice(0, index).trim();
				const value = line.slice(index + 1).trim();
				params[key] = value;
			} else {
				const key = line;
			}
		});
		return params;
	}

	buildDirectoryTree(
		dirPath: string,
		recursive: boolean,
		ignore: RegExp,
		includeRoot: boolean = false
	): TreeNode[] {
		function traverse(currentPath: string): TreeNode[] {
			const entries = fs.readdirSync(currentPath, {
				withFileTypes: true,
			});

			const nodes: TreeNode[] = [];
			for (const entry of entries) {
				const fullPath = path.join(currentPath, entry.name);

				// Skip files/folders that match the ignore pattern
				// if (ignore.test(entry.name)) continue;

				// Create a TreeNode for the current entry
				const node: TreeNode = {
					name: entry.name,
					path: fullPath,
				};

				// If it's a directory and recursive mode is enabled, traverse it
				if (entry.isDirectory() && recursive) {
					node.children = traverse(fullPath);
				}

				nodes.push(node);
			}

			return nodes;
		}

		let result: TreeNode[] = traverse(dirPath);
		if (includeRoot) {
			const root: TreeNode = {
				name: path.basename(dirPath),
				path: dirPath,
				children: result,
			};
			result = [root];
		}
		return result;
	}

	generateTreeHtml(tree: TreeNode[], treeEl: HTMLElement) {
		function buildHtml(nodes: TreeNode[], treeEl: HTMLElement) {
			const ul = treeEl.createEl("ul");
			for (const node of nodes) {
				const li = ul.createEl("li");
				li.createEl("a", {
					href: `file:///${encodeURI(node.path)}`,
					cls: "external-link",
					text: node.name,
				});

				if (node.children && node.children.length > 0)
					buildHtml(node.children, li);
			}
		}

		return buildHtml(tree, treeEl);
	}
}

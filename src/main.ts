import fs from "fs";
import { Menu, TFile, TAbstractFile, Notice, Plugin, TFolder } from "obsidian";

import { FileOrFolderItem, MockTree } from "obsidian-internals";

import { FileManager, DIR_SEP } from "file_manager";

import {
	FileConflictOption,
	FileConflictResolution,
	ConflictModal,
} from "conflict";

import {
	FileManagerSettingTab,
	FileManagerSettings,
	DEFAULT_SETTINGS,
} from "settings";

import { OpenWithCmd, openFile } from "open_with_cmd";
import { PathExplorer, HREF_FILE_PREFIX } from "path_explorer";
import { SuggestPathModal } from "path_modal";

// Used to keep track of whether the user is copying or moving files
enum FileOperation {
	COPY = "Copy",
	MOVE = "Move",
}

/**
 * Returns the stats of files opearations in a human-readable format. For example:
 * [DONE] file1.md\n, [OVERWRITE] file2.md\n, [SKIP] file3.md\n.
 */
function statsToString(
	stats: Map<string, FileConflictResolution | null>
): string {
	let str = "";
	stats.forEach((resolve, path) => {
		const name = path.split(DIR_SEP).pop();
		str += resolve === null ? `[DONE] ${name}\n` : `[${resolve}] ${name}\n`;
	});
	return str;
}

/**
 * The main plugin class that provides file manager commands.
 */
export default class FileManagerPlugin extends Plugin {
	settings: FileManagerSettings;
	selectedStatusBar: HTMLElement;
	clipboardStatusBar: HTMLElement;

	// The file manager instance that provides file operations.
	private fm: FileManager = new FileManager(this);

	private pe: PathExplorer = new PathExplorer(this);

	// We keep track of the selected files/folders for a cut/copy operation.
	private clipboard: Map<string, string> | null;
	// We keep track of the file operation so we can use it when pasting files
	// See copy-files-to-clipboard and cut-files-to-clipboard
	private fileOperation: FileOperation = FileOperation.COPY;

	/**
	 * Helper function to check (checkFunction) if a command (operation) can
	 * run.
	 */
	_checkCallback(
		checking: boolean,
		checkFunction: () => boolean,
		operation: (...args: any[]) => any,
		...args: any[]
	): boolean {
		if (!checkFunction()) return false;
		if (!checking) operation(...args);
		return true;
	}

	/**
	 * Helper function to check (checkFunction) if a command (operation) can
	 * run asynchronously.
	 */
	_checkAsyncCallback(
		checking: boolean,
		checkFunction: () => boolean,
		operation: (...args: any[]) => Promise<any>,
		...args: any[]
	): boolean {
		if (!checkFunction()) return false;
		(async () => {
			if (!checking) await operation(...args);
		})();
		return true;
	}

	/**
	 * Helper function that checks if there is a file explorer with an active
	 * file or folder, if so a command (operation) can run.
	 */
	isActiveFileOrFolderCallback(
		checking: boolean,
		operation: (...args: any[]) => any,
		...args: any[]
	): boolean {
		const func = this.fm.isActiveFileOrFolderAvailable.bind(this.fm);
		return this._checkCallback(checking, func, operation, ...args);
	}

	/**
	 * Helper function that checks if there is a file explorer with an active
	 * file or folder, if so a command (operation) can run asynchronously
	 */
	isActiveFileOrFolderAsyncCallback(
		checking: boolean,
		operation: (...args: any[]) => Promise<any>,
		...args: any[]
	): boolean {
		const func = this.fm.isActiveFileOrFolderAvailable.bind(this.fm);
		return this._checkAsyncCallback(checking, func, operation, ...args);
	}

	/**
	 * Helper function that checks if there is a file explorer active,
	 * if so a command (operation) can run.
	 */
	isFileExplorerActiveCallback(
		checking: boolean,
		operation: (...args: any[]) => any,
		...args: any[]
	): boolean {
		const func = this.fm.isFileExplorerActive.bind(this.fm);
		return this._checkCallback(checking, func, operation, ...args);
	}

	/**
	 * Helper function that checks if there is a file explorer active,
	 * if so a command (operation) can run asynchronously.
	 */
	isFileExplorerActiveAsyncCallback(
		checking: boolean,
		operation: (...args: any[]) => Promise<any>,
		...args: any[]
	): boolean {
		const func = this.fm.isFileExplorerActive.bind(this.fm);
		return this._checkAsyncCallback(checking, func, operation, ...args);
	}

	/**
	 * Helper function that checks if there is a file explorer available,
	 * if so a command (operation) can run.
	 */
	isFileExplorerAvailableCallback(
		checking: boolean,
		operation: (...args: any[]) => any,
		...args: any[]
	): boolean {
		const func = this.fm.isFileExplorerAvailable.bind(this.fm);
		return this._checkCallback(checking, func, operation, ...args);
	}

	/**
	 * Helper function that checks if there is a file explorer available,
	 * if so a command (operation) can run asynchronously.
	 */
	isFileExplorerAvailableAsyncCallback(
		checking: boolean,
		operation: (...args: any[]) => Promise<any>,
		...args: any[]
	): boolean {
		const func = this.fm.isFileExplorerAvailable.bind(this.fm);
		return this._checkAsyncCallback(checking, func, operation, ...args);
	}

	/**
	 * Show the number of selected files/folders in the status bar.
	 */
	showSelectedInStatusBar() {
		this.selectedStatusBar.empty();
		const selected = this.fm.getSelectedFilesOrFoldersPath(false, false);
		if (!this.settings.showSelectionStatusBar || !selected) return;

		let numFiles = 0;
		let numFolders = 0;
		for (const path of selected) {
			const fileOrFolder: TAbstractFile | null =
				this.app.vault.getAbstractFileByPath(path);
			if (fileOrFolder instanceof TFile) numFiles++;
			else if (fileOrFolder instanceof TFolder) numFolders++;
		}
		if (numFiles === 0 && numFolders === 0) return;

		const filesTxt = numFiles > 0 ? `${numFiles} 📄` : "";
		const foldersTxt = numFolders > 0 ? `${numFolders} 📂` : "";
		const msg =
			numFiles > 0 && numFolders > 0
				? `(Selected: ${filesTxt} and ${foldersTxt})`
				: `(Selected: ${filesTxt}${foldersTxt})`;
		this.selectedStatusBar.createEl("span", { text: msg });
	}

	/**
	 * Show the number of files and folders in the clipboard in the status bar.
	 */
	showClipboardInStatusBar() {
		this.clipboardStatusBar.empty();
		if (!this.settings.showClipboardStatusBar || !this.clipboard) return;

		let numFiles = 0;
		let numFolders = 0;
		for (const path of this.clipboard.keys()) {
			const fileOrFolder: TAbstractFile | null =
				this.app.vault.getAbstractFileByPath(path);
			if (fileOrFolder instanceof TFile) numFiles++;
			else if (fileOrFolder instanceof TFolder) numFolders++;
		}
		if (numFiles === 0 && numFolders === 0) return;

		const filesTxt = numFiles > 0 ? `${numFiles} 📄` : "";
		const foldersTxt = numFolders > 0 ? `${numFolders} 📂` : "";
		const prefix =
			this.fileOperation === FileOperation.COPY
				? "Copied to clipboard:"
				: "Cut to clipboard:";
		const msg =
			numFiles > 0 && numFolders > 0
				? `(${prefix} ${filesTxt} and ${foldersTxt})`
				: `(${prefix} ${filesTxt}${foldersTxt})`;
		this.clipboardStatusBar.createEl("span", { text: msg });
	}

	/**
	 * Creates a new OpenWithCmd object with the given name, command and arguments.
	 * The callback function of the command will first check if the file explorer
	 * has an active file or folder, and then open the file with the given command
	 * and arguments.
	 */
	createOpenWithCmd(name: string, cmd: string, args: string): OpenWithCmd {
		return {
			id: "open-with-" + name.toLowerCase(),
			name: "Open with " + name,
			checkCallback: (checking: boolean): boolean => {
				let file: TAbstractFile | null = this.fm.isFileExplorerActive()
					? this.fm.getActiveFileOrFolder()
					: this.app.workspace.getActiveFile();
				if (!file) return false;
				if (checking) return true;
				// All went well and not checking, so open the file.
				(async () => await openFile(file, cmd, args))();
				return true;
			},
		};
	}

	/**
	 * Monkey patch fileExplorer.tree.selectItem and fileExplorer.tree.deselectItem to
	 * update selected files/folders in status bar.
	 */
	patchFileExplorerSelectionFunctions() {
		const fileExplorer = this.fm.getFileExplorer();
		if (!fileExplorer) return;

		const showSelectedInStatusBarFunc =
			this.showSelectedInStatusBar.bind(this);
		const tree = fileExplorer.tree as unknown as MockTree;

		// Patch tree.selectItem to update selected files/folders in status bar.
		const oldSelectItemFunc = tree.selectItem.bind(fileExplorer.tree);
		tree.selectItem = function (e: FileOrFolderItem) {
			const res = oldSelectItemFunc(e);
			showSelectedInStatusBarFunc();
			return res;
		};

		// Patch tree.deselectItem to update selected files/folders in status bar.
		const oldDeselectItemFunc = tree.deselectItem.bind(fileExplorer.tree);
		tree.deselectItem = function (e: FileOrFolderItem) {
			const res = oldDeselectItemFunc(e);
			showSelectedInStatusBarFunc();
			return res;
		};
	}

	/**
	 * The main plugin function that is called when the plugin is loaded.
	 */
	async onload() {
		// Load the settings.
		this.settings = DEFAULT_SETTINGS;
		await this.loadSettings();

		// Monkey patch fileExplorer selection/deselection functions to update status
		// bar on selection/deselection of files/folders.
		this.app.workspace.onLayoutReady(() => {
			this.patchFileExplorerSelectionFunctions();
		});

		this.registerStatusBarItems();
		this.registerVaultEvents();
		this.registerMarkdownCodeBlockProcessors();
		this.registerCommands();
		this.registerContextMenus();
		this.addSettingTab(new FileManagerSettingTab(this.app, this));
	}

	onunload() {}

	/**
	 * Returns the conflict resolution method to use when a file conflict occurs.
	 */
	async getFileConflictResolutionMethod(
		path: string
	): Promise<[FileConflictResolution, boolean]> {
		const option = this.settings.conflictResolutionMethod;
		if (option === FileConflictOption.PROMPT)
			return await new ConflictModal(this.app, path).openAndWait();
		return [option as FileConflictResolution, true];
	}

	async loadSettings() {
		this.settings = { ...this.settings, ...(await this.loadData()) };
	}

	async saveSettings() {
		await this.saveData(this.settings);

		// Update the status bar to reflect the new settings.
		this.showClipboardInStatusBar();
		this.showSelectedInStatusBar();
	}

	/**
	 * Register all the status bar items for the plugin.
	 */
	registerStatusBarItems() {
		// Create status bar items for selected files/folders and clipboard.
		this.selectedStatusBar = this.addStatusBarItem();
		this.clipboardStatusBar = this.addStatusBarItem();
	}

	/**
	 * Register all the vault events for the plugin.
	 */
	registerVaultEvents() {
		// Update selected files/folders and clipboard in status bar whenever
		// there is a delete event.
		this.app.vault.on("delete", (file: TAbstractFile) => {
			// If the file is in the clipboard, remove it from the clipboard
			// and update the status bar.
			if (this.clipboard && this.clipboard.has(file.path)) {
				this.clipboard.delete(file.path);
				this.showClipboardInStatusBar();
			}
			// Always update the selected files/folders in the status bar.
			this.showSelectedInStatusBar();
		});
	}

	/**
	 * Register all the markdown code block processors for the plugin.
	 **/
	registerMarkdownCodeBlockProcessors() {
		this.registerMarkdownCodeBlockProcessor(
			"pathexplorer",
			async (source, el, ctx) => this.pe.processCodeBlock(source, el)
		);
	}

	/**
	 * Register all the context menus for the plugin.
	 */
	registerContextMenus() {
		// Create file-menu Open With... items from saved settings.
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TFile) => {
				this.settings.apps.forEach((app) => {
					if (!app.showInMenu) return;
					menu.addItem((item) => {
						item.setTitle(`Open with ${app.name}`)
							.setIcon(app.icon)
							.onClick(
								async () =>
									await openFile(file, app.cmd, app.args)
							);
					});
				});
			})
		);

		// Create url-menu Open With... items from saved settings.
		this.registerEvent(
			this.app.workspace.on("url-menu", (menu, url) => {
				if (!url.startsWith(HREF_FILE_PREFIX)) return;
				const path = decodeURI(url.replace(HREF_FILE_PREFIX, ""));
				const apps = this.settings.apps;
				const patterns = this.settings.patterns;
				for (const pattern of patterns) {
					const app = PathExplorer.matchPattern(
						pattern,
						path,
						fs.statSync(path).isDirectory(),
						apps
					);
					if (!app) continue;

					menu.addItem((item) => {
						item.setTitle(`Open with ${app.name}`)
							.setIcon(app.icon)
							.onClick(async () => {
								await openFile(path, app.cmd, app.args);
							});
					});
				}
			})
		);
	}

	/**
	 * Register all the commands for the plugin.
	 */
	registerCommands() {
		this.addCommand({
			id: "create-subfolder",
			name: "Create a subfolder within the focused or active file/folder",
			checkCallback: (checking: boolean) =>
				this.isActiveFileOrFolderAsyncCallback(
					checking,
					this.fm.createSubFolder.bind(this.fm)
				),
		});
		this.addCommand({
			id: "create-folder",
			name: "Create a folder as sibling of the focused or active file/folder",
			checkCallback: (checking: boolean) =>
				this.isActiveFileOrFolderAsyncCallback(
					checking,
					this.fm.createFolder.bind(this.fm)
				),
		});
		this.addCommand({
			id: "create-note",
			name: "Create a note within the focused or active folder",
			checkCallback: (checking: boolean) =>
				this.isActiveFileOrFolderAsyncCallback(
					checking,
					this.fm.createNote.bind(this.fm)
				),
		});
		this.addCommand({
			id: "duplicate-file",
			name: "Duplicate focused or active file/folder",
			checkCallback: (checking: boolean) =>
				this.isActiveFileOrFolderAsyncCallback(
					checking,
					this.fm.duplicateFile.bind(this.fm)
				),
		});
		this.addCommand({
			id: "copy-files-to-clipboard",
			name: "Copy selected files/folders to clipboard",
			checkCallback: (checking: boolean) =>
				this.isActiveFileOrFolderCallback(checking, () => {
					this.clipboard = this.fm.getSelectedPathToNameMap(true);
					this.fileOperation = FileOperation.COPY;
					new Notice("Files copied to clipboard");
					this.showClipboardInStatusBar();
				}),
		});
		this.addCommand({
			id: "cut-files-to-clipboard",
			name: "Cut selected files/folders to clipboard",
			checkCallback: (checking: boolean) =>
				this.isActiveFileOrFolderCallback(checking, () => {
					this.clipboard = this.fm.getSelectedPathToNameMap(true);
					this.fileOperation = FileOperation.MOVE;
					new Notice("Files cut to clipboard");
					this.showClipboardInStatusBar();
				}),
		});
		this.addCommand({
			id: "paste-files-from-clipboard",
			name: "Paste files/folders from clipboard to selected folder",
			checkCallback: (checking: boolean) =>
				this.isActiveFileOrFolderAsyncCallback(checking, async () => {
					if (this.clipboard) {
						const operation =
							this.fileOperation === FileOperation.COPY
								? this.fm.copyFiles.bind(this.fm)
								: this.fm.moveFiles.bind(this.fm);
						const stats = await operation(
							this.fm.getActiveFileOrFolder()!.path,
							this.clipboard
						);
						// Clear the clipboard after moving files remain in
						// clipboard if the operation is copy.
						if (this.fileOperation === FileOperation.MOVE) {
							this.clipboard = null;
							this.showClipboardInStatusBar();
						}

						if (this.settings.showCopyMoveStats)
							new Notice(
								`${this.fileOperation} stats:\n\n` +
									statsToString(stats)
							);
					}
				}),
		});
		this.addCommand({
			id: "clear-clipboard",
			name: "Clear clipboard",
			checkCallback: (checking: boolean) => {
				if (!this.clipboard) return false;
				if (checking) return true;
				this.clipboard = null;
				this.showClipboardInStatusBar();
			},
		});
		this.addCommand({
			id: "move-files",
			name: "Move selected files/folders to a new folder",
			checkCallback: (checking: boolean) =>
				this.isActiveFileOrFolderCallback(checking, () => {
					new SuggestPathModal(
						this.app,
						this.app.vault.getAllFolders(true),
						async (path: string) => {
							const stats = await this.fm.moveFiles(path);
							if (this.settings.showCopyMoveStats)
								new Notice(
									"Move stats:\n\n" + statsToString(stats)
								);
						}
					).open();
				}),
		});
		this.addCommand({
			id: "copy-files",
			name: "Copy selected files/folders to a new folder",
			checkCallback: (checking: boolean) =>
				this.isActiveFileOrFolderCallback(checking, () => {
					new SuggestPathModal(
						this.app,
						this.app.vault.getAllFolders(true),
						async (path: string) => {
							const stats = await this.fm.copyFiles(path);
							if (this.settings.showCopyMoveStats)
								new Notice(
									"Copy stats:\n\n" + statsToString(stats)
								);
						}
					).open();
				}),
		});
		this.addCommand({
			id: "select-all",
			name: "Select all siblings and children of the focused or active file/folder",
			checkCallback: (checking: boolean) =>
				this.isFileExplorerActiveCallback(checking, () => {
					this.fm.selectAll(true);
					this.showSelectedInStatusBar();
				}),
		});
		this.addCommand({
			id: "toggle-select",
			name: "Toggle selection of the focused or active file/folder",
			checkCallback: (checking: boolean) =>
				this.isFileExplorerActiveCallback(checking, () => {
					this.fm.toggleSelect();
					this.showSelectedInStatusBar();
				}),
		});
		this.addCommand({
			id: "deselect-all",
			name: "Clear selection",
			checkCallback: (checking: boolean) =>
				this.isFileExplorerActiveCallback(checking, () => {
					this.fm.deselectAll();
					this.showSelectedInStatusBar();
				}),
		});
		this.addCommand({
			id: "invert-selection",
			name: "Invert selection",
			checkCallback: (checking: boolean) =>
				this.isFileExplorerActiveCallback(checking, () => {
					this.fm.invertSelection();
					this.showSelectedInStatusBar();
				}),
		});
		this.addCommand({
			id: "rename",
			name: "Rename focused or active file/folder",
			checkCallback: (checking: boolean) =>
				this.isFileExplorerActiveCallback(
					checking,
					this.fm.renameFile.bind(this.fm)
				),
		});
		this.addCommand({
			id: "go-to-in-file-explorer",
			name: "Go to file or folder in file explorer",
			checkCallback: (checking: boolean) =>
				this.isFileExplorerAvailableCallback(checking, () => {
					const allFilesAndFolders: TAbstractFile[] = [
						...this.app.vault.getAllFolders(true),
						...this.app.vault.getFiles(),
					];
					new SuggestPathModal(
						this.app,
						allFilesAndFolders,
						async (path: string) => {
							this.fm.focusPath(path);
						}
					).open();
				}),
		});

		// Create dynamic Open With commands from saved settings.
		this.settings.apps.forEach((app) => {
			this.addCommand(
				this.createOpenWithCmd(app.name, app.cmd, app.args)
			);
		});
	}
}

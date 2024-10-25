import {
	App,
	Modal,
	Menu,
	TFile,
	TAbstractFile,
	Notice,
	Plugin,
	TFolder,
	FuzzySuggestModal,
} from "obsidian";

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
	statusBar: HTMLElement;

	// The file manager instance that provides file operations.
	private fm: FileManager = new FileManager(this);

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
	 * Helper function to show a message in the status bar.
	 */
	showStatusBarMessage(message: string) {
		this.statusBar.empty();
		this.statusBar.createEl("span", { text: message });
	}

	/**
	 * Show the number of selected files/folders in the status bar.
	 */
	showSelectedInStatusBar(numSelected: number) {
		this.showStatusBarMessage(
			numSelected > 0 ? `📄 or 📂 selected: ${numSelected}` : ""
		);
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
				// Get the active file or folder in file explorer.
				let file: TAbstractFile | null =
					this.fm.getActiveFileOrFolder();
				if (!file) return false;
				if (checking) return true;
				// All went well and not checking, so open the file.
				(async () => await openFile(file, cmd, args))();
				return true;
			},
		};
	}

	async onload() {
		this.settings = DEFAULT_SETTINGS;
		await this.loadSettings();

		this.statusBar = this.addStatusBarItem();

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
					this.clipboard =
						this.fm.getSelectedAncestorsPathToNameMap();
					this.fileOperation = FileOperation.COPY;
					new Notice("Files copied to clipboard");
				}),
		});
		this.addCommand({
			id: "cut-files-to-clipboard",
			name: "Cut selected files/folders to clipboard",
			checkCallback: (checking: boolean) =>
				this.isActiveFileOrFolderCallback(checking, () => {
					this.clipboard =
						this.fm.getSelectedAncestorsPathToNameMap();
					this.fileOperation = FileOperation.MOVE;
					new Notice("Files cut to clipboard");
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
						if (this.fileOperation === FileOperation.MOVE)
							this.clipboard = null;

						if (this.settings.showCopyMoveInfo)
							new Notice(
								`${this.fileOperation} stats:\n\n` +
									statsToString(stats)
							);
					}
				}),
		});
		this.addCommand({
			id: "move-files",
			name: "Move selected files/folders to a new folder",
			checkCallback: (checking: boolean) =>
				this.isActiveFileOrFolderCallback(checking, () => {
					new SuggestFolderModal(
						this.app,
						this.app.vault.getAllFolders(true),
						async (path: string) => {
							const stats = await this.fm.moveFiles(path);
							if (this.settings.showCopyMoveInfo)
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
					new SuggestFolderModal(
						this.app,
						this.app.vault.getAllFolders(true),
						async (path: string) => {
							const stats = await this.fm.copyFiles(path);
							if (this.settings.showCopyMoveInfo)
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
					const numSelected = this.fm.selectAll(true);
					if (this.settings.showSelectionInfo)
						this.showSelectedInStatusBar(numSelected);
				}),
		});
		this.addCommand({
			id: "toggle-select",
			name: "Toggle selection of the focused or active file/folder",
			checkCallback: (checking: boolean) =>
				this.isFileExplorerActiveCallback(checking, () => {
					const numSelected = this.fm.toggleSelect();
					if (this.settings.showSelectionInfo)
						this.showSelectedInStatusBar(numSelected);
				}),
		});
		this.addCommand({
			id: "deselect-all",
			name: "Clear selection",
			checkCallback: (checking: boolean) =>
				this.isFileExplorerActiveCallback(checking, () => {
					this.fm.deselectAll();
					if (this.settings.showSelectionInfo)
						this.showStatusBarMessage("");
				}),
		});
		this.addCommand({
			id: "invert-selection",
			name: "Invert selection",
			checkCallback: (checking: boolean) =>
				this.isFileExplorerActiveCallback(checking, () => {
					const numSelected = this.fm.invertSelection();
					if (this.settings.showSelectionInfo)
						this.showSelectedInStatusBar(numSelected);
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

		// Create dynamic Opew With commands from saved settings.
		this.settings.apps.forEach((app) => {
			this.addCommand(
				this.createOpenWithCmd(app.name, app.cmd, app.args)
			);
		});

		// Create dynamic Open with menu from saved settings.
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TFile) => {
				this.settings.apps.forEach((app) => {
					if (!app.showInMenu) return;
					menu.addItem((item) => {
						item.setTitle(`Open with ${app.name}`)
							.setIcon("popup-open")
							.onClick(
								async () =>
									await openFile(file, app.cmd, app.args)
							);
					});
				});
			})
		);

		// This adds a settings tab so the user can configure various aspects of the plugin
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

		this.statusBar.empty();
	}
}

/**
 * A modal that suggests folders to the user.
 */
class SuggestFolderModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		// The folders to suggest to the user
		private folders: TFolder[],
		// The function to execute when the user selects a folder
		private toDo: (path: string) => Promise<void>
	) {
		super(app);
	}

	/**
	 * Returns the folders to suggest to the user.
	 */
	getItems(): TFolder[] {
		return this.folders;
	}

	/**
	 * Returns the text to display for a folder.
	 */
	getItemText(folder: TFolder): string {
		return folder.path;
	}

	/**
	 * Executes the function toDo when the user selects a folder.
	 */
	onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent) {
		(async () => await this.toDo(folder.path))();
	}
}

import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFolder,
	FuzzySuggestModal,
} from "obsidian";

// import { FileExplorer } from "./obsidian-internals";

import { FileManager, FileConflictResolution, DIR_SEP } from "./file_manager";

interface FileManagerSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: FileManagerSettings = {
	mySetting: "default",
};

enum FileOperation {
	COPY = "Copy",
	MOVE = "Move",
}

const statsToString = (
	stats: Map<string, FileConflictResolution | null>
): string => {
	let str = "";
	stats.forEach((resolve, path) => {
		const name = path.split(DIR_SEP).pop();
		switch (resolve) {
			case FileConflictResolution.OVERWRITE:
				str += `[OVERWRITTEN] ${name}\n`;
				return;
			case FileConflictResolution.SKIP:
				str += `[SKIPPED] ${name}\n`;
				return;
			case FileConflictResolution.KEEP:
				str += `[KEPT] ${name}\n`;
				return;
			default:
				str += `[DONE] ${name}\n`;
				return;
		}
	});
	return str;
};

export default class FileManagerPlugin extends Plugin {
	settings: FileManagerSettings;

	private fm: FileManager = new FileManager(this);

	private selectedToDestMap: Map<string, string> | null;
	// We keep track of the file operation so we can use it when pasting files
	// See copy-files-to-clipboard and cut-files-to-clipboard
	private fileOperation: FileOperation = FileOperation.COPY;

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

	isActiveFileOrFolderCallback(
		checking: boolean,
		operation: (...args: any[]) => any,
		...args: any[]
	): boolean {
		const func = this.fm.isActiveFileOrFolderAvailable.bind(this.fm);
		return this._checkCallback(checking, func, operation, ...args);
	}

	isActiveFileOrFolderAsyncCallback(
		checking: boolean,
		operation: (...args: any[]) => Promise<any>,
		...args: any[]
	): boolean {
		const func = this.fm.isActiveFileOrFolderAvailable.bind(this.fm);
		return this._checkAsyncCallback(checking, func, operation, ...args);
	}

	isFileExplorerActiveCallback(
		checking: boolean,
		operation: (...args: any[]) => any,
		...args: any[]
	): boolean {
		const func = this.fm.isFileExplorerActive.bind(this.fm);
		return this._checkCallback(checking, func, operation, ...args);
	}

	isFileExplorerActiveAsyncCallback(
		checking: boolean,
		operation: (...args: any[]) => Promise<any>,
		...args: any[]
	): boolean {
		const func = this.fm.isFileExplorerActive.bind(this.fm);
		return this._checkAsyncCallback(checking, func, operation, ...args);
	}

	async onload() {
		await this.loadSettings();

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
					this.selectedToDestMap =
						this.fm.getSelectedAncestorsPathToNameMap();
					this.fileOperation = FileOperation.COPY;
				}),
		});
		this.addCommand({
			id: "cut-files-to-clipboard",
			name: "Cut selected files/folders to clipboard",
			checkCallback: (checking: boolean) =>
				this.isActiveFileOrFolderCallback(checking, () => {
					this.selectedToDestMap =
						this.fm.getSelectedAncestorsPathToNameMap();
					this.fileOperation = FileOperation.MOVE;
				}),
		});
		this.addCommand({
			id: "paste-files-from-clipboard",
			name: "Paste files/folders from clipboard to selected folder",
			checkCallback: (checking: boolean) =>
				this.isActiveFileOrFolderAsyncCallback(checking, async () => {
					if (this.selectedToDestMap) {
						const resolveFunction =
							this.showConflictModalAndWait.bind(this);
						const operation =
							this.fileOperation === FileOperation.COPY
								? this.fm.copyFiles.bind(this.fm)
								: this.fm.moveFiles.bind(this.fm);
						const stats = await operation(
							this.fm.getActiveFileOrFolder()!.path,
							resolveFunction,
							this.selectedToDestMap
						);
						if (this.fileOperation === FileOperation.MOVE)
							this.selectedToDestMap = null;
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
							const resolveFunction =
								this.showConflictModalAndWait.bind(this);
							const stats = await this.fm.moveFiles(
								path,
								resolveFunction
							);
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
							const resolveFunction =
								this.showConflictModalAndWait.bind(this);
							const stats = await this.fm.copyFiles(
								path,
								resolveFunction
							);
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
					new Notice(`Selected ${numSelected} items`);
				}),
		});
		this.addCommand({
			id: "toggle-select",
			name: "Toggles selection of the focused or active file/folder",
			checkCallback: (checking: boolean) =>
				this.isFileExplorerActiveCallback(
					checking,
					this.fm.toggleSelect.bind(this.fm)
				),
		});
		this.addCommand({
			id: "deselect-all",
			name: "Clear selection",
			checkCallback: (checking: boolean) =>
				this.isFileExplorerActiveCallback(
					checking,
					this.fm.deselectAll.bind(this.fm)
				),
		});
		this.addCommand({
			id: "invert-selection",
			name: "Invert selection",
			checkCallback: (checking: boolean) =>
				this.isFileExplorerActiveCallback(checking, () => {
					const numSelected = this.fm.invertSelection();
					new Notice(`Selected ${numSelected} items`);
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

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new FileManagerSettingTab(this.app, this));
	}

	onunload() {}

	async showConflictModalAndWait(
		file: string
	): Promise<FileConflictResolution> {
		return await new ConflictModal(this.app, file).openAndWait();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class FileManagerSettingTab extends PluginSettingTab {
	plugin: FileManagerPlugin;

	constructor(app: App, plugin: FileManagerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Setting #1")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
class SuggestFolderModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private folders: TFolder[],
		private toDo: (path: string) => Promise<void>
	) {
		super(app);
	}

	getItems(): TFolder[] {
		return this.folders;
	}

	getItemText(folder: TFolder): string {
		return folder.path;
	}

	onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent) {
		(async () => await this.toDo(folder.path))();
	}
}
class ConflictModal extends Modal {
	private resolvePromise: (value: FileConflictResolution) => void;

	constructor(app: App, file: string) {
		super(app);
		this.setTitle(`There is a conflict with "${file}"`);

		const setting = new Setting(this.contentEl);
		const resolutions: FileConflictResolution[] = Object.values(
			FileConflictResolution
		) as FileConflictResolution[];
		resolutions.forEach((resolution) => {
			setting.addButton((btn) =>
				btn
					.setButtonText(resolution)
					.setCta()
					.onClick(() => {
						this.resolvePromise(resolution);
						this.close();
					})
			);
		});
	}

	onClose() {
		if (this.resolvePromise)
			this.resolvePromise(FileConflictResolution.SKIP);
	}

	openAndWait(): Promise<FileConflictResolution> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			this.open();
		});
	}
}

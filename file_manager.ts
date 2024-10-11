// import { stat } from "fs";
import {
	Plugin,
	App,
	Vault,
	View,
	Workspace,
	TAbstractFile,
	TFile,
	TFolder,
} from "obsidian";

import {
	FileExplorer,
	MockApp,
	MockVault,
	MockWorkspace,
	MockTree,
} from "obsidian-internals";
import * as path from "path";

// ------------------------- Helper Functions -------------------------

/**
 * Add a suffix before the extension of a file. If the file has no extension,
 * it will add the suffix at the end of the file name.
 *
 * Examples:
 * addSuffixBeforeExtension("home/notes/file.md", " copy")
 *     -> "home/notes/file copy.md"
 *
 * addSuffixBeforeExtension("test", "copy")
 *     -> "test copy"
 */
function addSuffixBeforeExtension(path: string, suffix: string): string {
	// Deal with extension if there is one after the last slash.
	const slashIndex = path.lastIndexOf(DIR_SEP);
	const dotIndex = path.lastIndexOf(EXT_SEP);
	if (dotIndex > slashIndex) {
		const [before, after] = [
			path.slice(0, dotIndex),
			path.slice(dotIndex + 1),
		];
		return `${before}${suffix}.${after}`;
	}
	return path + suffix;
}

/**
 * Get an array of all ancestors of a path.
 * Exampls:
 * getAllAncestors("home/notes/file.md")
 *     -> ["home", "home/notes"].
 */
function getAllAncestors(path: string): string[] {
	const ancestors: string[] = [];
	const parts = path.split(DIR_SEP);
	for (let i = 1; i < parts.length; i++) {
		ancestors.push(parts.slice(0, i).join(DIR_SEP));
	}
	return ancestors;
}

/**
 * Returns a non existing path by adding a sequence number to the path if
 * already exists in the file explorer. If `dealWithExt` is true, it will
 * consider the extension of the file and add the sequence number before it.
 *
 * Examples (imagine that "home/notes/file.md" already exists):
 * getNonExistingPath(fileExplorer, "home/notes/file.md")
 *   -> "home/notes/file 1.md"
 *
 * getNonExistingPath(fileExplorer, "home/notes/file.md", false)
 *   -> "home/notes/file.md 1"
 */
function genNonExistingPath(
	fileExplorer: FileExplorer,
	path: string,
	dealWithExt: boolean = true
): string {
	let newPath = path;
	// While path exists, add sequence number to avoid name collisions.
	for (let i = 1; fileExplorer.fileItems[newPath]; i++) {
		newPath = dealWithExt
			? addSuffixBeforeExtension(path, ` ${i}`)
			: `${path} ${i}`;
	}
	return newPath;
}

/**
 * Prune the files/folders by removing the paths that are descendants
 * of other files/folders.
 *
 * Example:
 *
 * pruneDescendantsPaths(["home/notes", "home/notes/folder", "home/notes/file.md"])
 *    -> ["home/notes"]
 */
function pruneDescendantsPaths(paths: string[]): string[] {
	// Sort selected file/folder by the depth of the path.
	paths.sort((a, b) => {
		return a.split(DIR_SEP).length - b.split(DIR_SEP).length;
	});

	// Store the file/folder paths in a map, grouped by their depth.
	const depthMap: Map<number, Set<string>> = new Map();
	paths.forEach((path) => {
		const depth = path.split(DIR_SEP).length;
		if (!depthMap.has(depth)) depthMap.set(depth, new Set());

		depthMap.get(depth)?.add(path);
	});

	const ancestors: string[] = [];
	depthMap.forEach((depthPaths, depth) => {
		depthPaths.forEach((path) => {
			if (depth === 1) ancestors.push(path);
			else {
				const alreadyIn = getAllAncestors(path).some((ancestor) =>
					depthMap.get(ancestor.split(DIR_SEP).length)?.has(ancestor)
				);
				if (!alreadyIn) ancestors.push(path);
			}
		});
	});
	return ancestors;
}

/**
	 * Returns a map where the key is the original path and the value is the
	 * path without ancestors.
	 * Example:

	 * trimAncestors(["file.md", "notes/file2.md", "notes/folder/file3.md"])
	 * -> Map { "file.md":"file.md", "notes/file2.md":"file2.md", "notes/folder/file3.md":"file3.md" }

	 * trimAncestors(["miDir", "dir1/dir2"])
	 * -> Map { "miDir":"miDir", "dir1/dir2":"dir2"}
	 */
function ancestorsPathsToName(paths: string[]): Map<string, string> {
	const pathsMap: Map<string, string> = new Map();
	paths.forEach((path) => pathsMap.set(path, path.split(DIR_SEP).pop()!));
	return pathsMap;
}

// ------------------------- File Manager -------------------------

export enum FileConflictResolution {
	SKIP = "Skip",
	OVERWRITE = "Overwrite",
	KEEP = "Keep",
}

// TODO: Error

export const FILE_EXPLORER_TYPE = "file-explorer";

export const DIR_SEP = "/";
export const EXT_SEP = ".";
export const COPY_SUFFIX = " - Copy";
export const NEW_FOLDER = "/New Folder";

/**
 * FileManager class provides a set of methods to interact with the file explorer.
 */
export class FileManager {
	private app: MockApp;
	private vault: MockVault;
	private workspace: MockWorkspace;

	constructor(plugin: Plugin) {
		this.app = plugin.app as MockApp;
		this.vault = plugin.app.vault as MockVault;
		this.workspace = plugin.app.workspace as MockWorkspace;
	}

	/**
	 * Returns the file explorer instance if it's available in the workspace.
	 */
	getFileExplorer(): FileExplorer | null {
		const leaves = this.workspace.getLeavesOfType(FILE_EXPLORER_TYPE);
		if (!leaves || leaves.length === 0) return null;
		return leaves[0].view as FileExplorer;
	}

	/**
	 * Returns the file explorer instance and the active item in the file explorer.
	 */
	getFileExplorerAndActiveFileOrFolder(): {
		fileExplorer: FileExplorer | null;
		activeFileOrFolder: TAbstractFile | null;
	} {
		const fileExplorer = this.getFileExplorer();
		if (!fileExplorer)
			return { fileExplorer: null, activeFileOrFolder: null };

		// TODO Check errors
		const activeFileOrFolder =
			fileExplorer.tree.focusedItem?.file ?? fileExplorer.activeDom?.file;
		return { fileExplorer, activeFileOrFolder };
	}

	/**
	 * Returns the active file or folder in the file explorer. If no file or
	 * folder is active, it returns null.
	 */
	getActiveFileOrFolder(): TAbstractFile | null {
		return this.getFileExplorerAndActiveFileOrFolder().activeFileOrFolder;
	}

	/**
	 * Returns the selected files/folders in the file explorer. If no files/folders
	 * are selected, it returns the active file/folder if available. If no active
	 * file/folder is available, it returns an empty array.
	 */
	getSelectedFilesOrFolders(): TAbstractFile[] {
		const { fileExplorer, activeFileOrFolder } =
			this.getFileExplorerAndActiveFileOrFolder();

		if (!fileExplorer) return [];

		// If no items are selected, return the active item if available.
		if (fileExplorer.tree.selectedDoms.size === 0)
			return activeFileOrFolder ? [activeFileOrFolder] : [];

		// Return all selected files/folders as TAbstractFiles.
		// TODO: Check if it works.
		return Array.from(
			Array.from(fileExplorer.tree.selectedDoms.values()).map(
				(item) => item.file
			)
		);
	}

	/**
	 * Returns if the file explorer is available in the workspace.
	 */
	isFileExplorerAvailable(): boolean {
		return this.getFileExplorer() !== null;
	}

	/**
	 * Returns if the file explorer is currently active in the workspace.
	 */
	isFileExplorerActive(): boolean {
		const view = this.workspace.getActiveViewOfType(View);
		return view?.getViewType() === FILE_EXPLORER_TYPE;
	}

	/**
	 * Returns if there is and active file or folder in the file explorer. NOTE:
	 * FileExplorer must be active in the workspace, if not, it will return false.
	 */
	isActiveFileOrFolderAvailable(): boolean {
		if (!this.isFileExplorerActive()) return false;
		const { activeFileOrFolder } =
			this.getFileExplorerAndActiveFileOrFolder();
		return activeFileOrFolder !== null;
	}

	/**
	 * Returns true if the `path` is a file in the file explorer.
	 */
	isFile(path: string): boolean {
		try {
			return (
				this.getFileExplorer()?.fileItems[path].file instanceof TFile
			);
		} catch (e) {
			return false;
		}
	}

	/**
	 * Returns true if the `path` is a folder in the file explorer.
	 */
	isFolder(path: string): boolean {
		try {
			return (
				this.getFileExplorer()?.fileItems[path].file instanceof TFolder
			);
		} catch (e) {
			return false;
		}
	}

	/**
	 * Get all selected files/folders' paths in the file explorer, it simplifies
	 * the total by removing the paths that are descendants of other selected
	 * files/folders. For the resulting paths, it creates and returns a map where
	 * the key is the source path of the selected files/folders in file explorer,
	 * and the value is the simplified destination path (e.g. home/notes/file.md
	 * -> file.md).
	 */
	// TODO: Change name.
	getSelectedAncestorsPathToNameMap(): Map<string, string> {
		const filesOrFolders: TAbstractFile[] =
			this.getSelectedFilesOrFolders();

		const paths = filesOrFolders.map((fileOrFolder) => fileOrFolder.path);

		return ancestorsPathsToName(pruneDescendantsPaths(paths));
	}

	/**
	 * It tries to perform the operation `operation` (e.g. copy, move, ...)
	 * on the source `src` and destination `dest` paths. If the destination
	 * path already exists, it will use the `resolve` parameter to solve the
	 * conflict. The `resolve` could be a `FileConflictResolution` value or
	 * a function that receives the destination path and returns a
	 * `FileConflictResolution` value. If SKIP, no operation is performed,
	 * if OVERWRITE, the destination is deleted and the operation is performed,
	 * if KEEP, the destination is renamed and the operation is performed.
	 * It returns the `FileConflictResolution` applied or null if no conflict.
	 */
	protected async _conflictSolver(
		fileExplorer: FileExplorer,
		src: string,
		dest: string,
		operation: (src: string, dest: string) => Promise<void>,
		resolve:
			| FileConflictResolution
			| ((dest: string) => Promise<FileConflictResolution>)
	): Promise<FileConflictResolution | null> {
		// If destination doesn't exist, perform the operation (no conflict).
		if (!(await this.vault.exists(dest))) {
			await operation(src, dest);
			return null;
		}
		if (typeof resolve === "function") resolve = await resolve(dest);
		// Destination file/folder already exists. Handle conflict.
		if (resolve === FileConflictResolution.OVERWRITE) {
			await this.vault.delete(fileExplorer.fileItems[dest].file);
			await operation(src, dest);
			return FileConflictResolution.OVERWRITE;
		}
		if (resolve === FileConflictResolution.KEEP) {
			await operation(src, genNonExistingPath(fileExplorer, dest));
			return FileConflictResolution.KEEP;
		}
		return FileConflictResolution.SKIP;
	}

	/**
	 * Creates a new folder in the file explorer. The path where the new
	 * folder will be created is determined by the `getFolderPath` function.
	 * This function receives the focused/active file or folder in file explorer
	 * and returns the path where the new folder will be created.
	 */
	protected async _createFolder(
		getFolderPath: (activeFileOrFolder: TAbstractFile) => string | undefined
	) {
		const { fileExplorer, activeFileOrFolder } =
			this.getFileExplorerAndActiveFileOrFolder();
		if (!fileExplorer || !activeFileOrFolder) return;

		// Get the path of the folder where the new folder will be created.
		const path = getFolderPath(activeFileOrFolder);
		if (!path) return;

		// The new folder name will be "New Folder[ n]" where [ n] is '' or a number.
		const newPath = genNonExistingPath(fileExplorer, path + NEW_FOLDER);

		// Create the new subfolder and set focus on it.
		const newFolder = await this.vault.createFolder(newPath);
		fileExplorer.tree.setFocusedItem(
			fileExplorer.fileItems[newFolder.path],
			true
		);

		// Give chance to the user to rename the new folder.
		// Call to nextFrame is mandatory to show correctly the rename textbox.
		this.app.nextFrame(
			async () => await fileExplorer.startRenameFile(newFolder)
		);
	}

	/**
	 * Creates a new subfolder within the currently selected or active folder
	 * in the file explorer. If the currently selected or active item is a file,
	 * the parent folder is used as active folder.
	 */
	async createSubFolder() {
		await this._createFolder((fileOrFolder) => {
			return fileOrFolder instanceof TFolder
				? fileOrFolder.path
				: fileOrFolder.parent?.path;
		});
	}

	/**
	 * Creates a new folder as a sibling of the currently selected or active
	 * folder in the file explorer. If the currently selected or active item is
	 * a file, the parent folder is used as active folder.
	 */
	async createFolder() {
		await this._createFolder((fileOrFolder) => {
			return fileOrFolder.parent?.path;
		});
	}

	/**
	 * Rename the focused or active file/folder in the file explorer.
	 */
	async renameFile() {
		const { fileExplorer, activeFileOrFolder } =
			this.getFileExplorerAndActiveFileOrFolder();
		if (!fileExplorer || !activeFileOrFolder) return;

		// Give chance to the user to rename the new folder.
		// Call to nextFrame is mandatory to show correctly the rename textbox.
		this.app.nextFrame(
			async () => await fileExplorer.startRenameFile(activeFileOrFolder)
		);
	}

	/**
	 * Duplicates the focused or active file/folder in the file explorer.
	 */
	async duplicateFile() {
		const { fileExplorer, activeFileOrFolder } =
			this.getFileExplorerAndActiveFileOrFolder();
		if (!fileExplorer || !activeFileOrFolder) return;

		const src = activeFileOrFolder.path;
		const dest = addSuffixBeforeExtension(src, COPY_SUFFIX);
		await this._copyFileOrFolder(
			fileExplorer,
			src,
			dest,
			FileConflictResolution.KEEP
		);
	}

	/**
	 * Helper function that moves src file/folder to dest path, by using the
	 * conflict solver to handle conflicts. It returns the
	 * `FileConflictResolution` applied or null if no conflict.
	 */
	protected async _moveFileOrFolder(
		fileExplorer: FileExplorer,
		src: string,
		dest: string,
		resolve:
			| FileConflictResolution
			| ((s: string) => Promise<FileConflictResolution>)
	): Promise<FileConflictResolution | null> {
		return this._conflictSolver(
			fileExplorer,
			src,
			dest,
			async (src, dest) => {
				const fileManager = fileExplorer.app.fileManager;
				const fileOrFolder: TAbstractFile =
					fileExplorer.fileItems[src].file;
				await fileManager.renameFile(fileOrFolder, dest);
			},
			resolve
		);
	}

	/**
	 * Moves the selected files/folders in the file explorer to the specified `path`.
	 */
	async moveFiles(
		path: string,
		resolve:
			| FileConflictResolution
			| ((s: string) => Promise<FileConflictResolution>),
		ancestorToNameMap: Map<string, string> | null = null
	): Promise<Map<string, FileConflictResolution | null>> {
		const stats: Map<string, FileConflictResolution | null> = new Map();
		const fileExplorer = this.getFileExplorer();
		if (!fileExplorer) return stats;

		if (!ancestorToNameMap)
			ancestorToNameMap = this.getSelectedAncestorsPathToNameMap();

		for (const [src, dest] of ancestorToNameMap) {
			const newDest = `${path}/${dest}`;
			stats.set(
				newDest,
				await this._moveFileOrFolder(
					fileExplorer,
					src,
					newDest,
					resolve
				)
			);
		}
		return stats;
	}

	/**
	 * Helper function that copies src file/folder to dest path, by using the
	 * conflict solver to handle conflicts. It returns the
	 * `FileConflictResolution` applied or null if no conflict.
	 */
	protected async _copyFileOrFolder(
		fileExplorer: FileExplorer,
		src: string,
		dest: string,
		resolve:
			| FileConflictResolution
			| ((s: string) => Promise<FileConflictResolution>)
	): Promise<FileConflictResolution | null> {
		return this._conflictSolver(
			fileExplorer,
			src,
			dest,
			async (src, dest) => {
				const fileOrFolder: TAbstractFile =
					fileExplorer.fileItems[src].file;
				if (fileOrFolder instanceof TFile) {
					await this.vault.copy(fileOrFolder, dest);
				}
				// If folder, create folder and copy all recurse children.
				else if (fileOrFolder instanceof TFolder) {
					// Get all recurse children. Folders will come up first, so we
					// can create them before copying the files.
					const children: TAbstractFile[] = [];
					Vault.recurseChildren(
						fileOrFolder,
						(child: TAbstractFile) => {
							children.push(child);
						}
					);
					// Create folders and copy files if the don't exist in the destination.
					for (const child of children) {
						const childPath = child.path.replace(
							new RegExp(`^${src}`),
							""
						);
						// TODO: I think this if is not necessary, because the conflict
						// solver should take care of it. Maybe if there is a MERGE option
						// it could be useful.
						if (await this.vault.exists(`${dest}${childPath}`))
							continue;
						if (child instanceof TFile) {
							await this.vault.copy(child, `${dest}${childPath}`);
						} else if (child instanceof TFolder) {
							await this.vault.createFolder(
								`${dest}${childPath}`
							);
						}
					}
				}
			},
			resolve
		);
	}

	/**
	 * Copies the selected files/folders in the file explorer to the specified `path`.
	 */
	async copyFiles(
		path: string,
		resolve:
			| FileConflictResolution
			| ((s: string) => Promise<FileConflictResolution>),
		ancestorToNameMap: Map<string, string> | null = null
	): Promise<Map<string, FileConflictResolution | null>> {
		const stats: Map<string, FileConflictResolution | null> = new Map();

		const fileExplorer = this.getFileExplorer();
		if (!fileExplorer) return stats;

		if (!ancestorToNameMap)
			ancestorToNameMap = this.getSelectedAncestorsPathToNameMap();

		for (const [src, dest] of ancestorToNameMap) {
			const newDest = `${path}/${dest}`;
			stats.set(
				newDest,
				await this._copyFileOrFolder(
					fileExplorer,
					src,
					newDest,
					resolve
				)
			);
		}
		return stats;
	}

	/**
	 * Selects all items in the file explorer within the parent of the focused or
	 * active item. Returns total number of selected items. If `clearSelection` is
	 * true, it clears the selection before selecting new items.
	 */
	selectAll(clearSelection: boolean = true): number {
		const { fileExplorer, activeFileOrFolder } =
			this.getFileExplorerAndActiveFileOrFolder();
		if (!fileExplorer) return 0;
		if (!activeFileOrFolder) return fileExplorer.tree.selectedDoms.size;

		let parentPath = activeFileOrFolder.parent?.path;
		if (!parentPath) return 0;
		// If the parent path is the root, we need to remove the slash.
		parentPath = parentPath === DIR_SEP ? "" : parentPath + DIR_SEP;

		// Select all items dangling from parentPath.
		const tree = fileExplorer.tree as unknown as MockTree;
		if (clearSelection) tree.clearSelectedDoms();
		for (const [path, item] of Object.entries(fileExplorer.fileItems)) {
			if (path.startsWith(parentPath)) tree.selectItem(item);
		}
		return fileExplorer.tree.selectedDoms.size;
	}

	/**
	 * Toggles selection of the active file/folder in the file explorer. Returns
	 * total number of selected items. If `clearSelection` is true, it clears the
	 * selection before toggling.
	 */
	toggleSelect(clearSelection: boolean = false): number {
		const { fileExplorer, activeFileOrFolder } =
			this.getFileExplorerAndActiveFileOrFolder();
		if (!fileExplorer) return 0;
		if (!activeFileOrFolder) return fileExplorer.tree.selectedDoms.size;

		const tree = fileExplorer.tree as unknown as MockTree;
		if (clearSelection) tree.clearSelectedDoms();

		// Toggle selection.
		const fileOrFolder = fileExplorer.fileItems[activeFileOrFolder.path];
		const selected = fileExplorer.tree.selectedDoms.has(fileOrFolder);
		if (selected) tree.deselectItem(fileOrFolder);
		else tree.selectItem(fileOrFolder);

		return fileExplorer.tree.selectedDoms.size;
	}

	/**
	 * Inverts the current selection of items in file explorer.
	 */
	invertSelection(): number {
		const fileExplorer = this.getFileExplorer();
		if (!fileExplorer) return 0;

		// Get all items that are not currently selected.
		const toSelect = [];
		for (const item of Object.values(fileExplorer.fileItems)) {
			if (!fileExplorer.tree.selectedDoms.has(item)) toSelect.push(item);
		}

		const tree = fileExplorer.tree as unknown as MockTree;
		tree.clearSelectedDoms();
		toSelect.forEach((item) => tree.selectItem(item));

		return fileExplorer.tree.selectedDoms.size;
	}

	/**
	 * Clears the selection of all items in the file explorer.
	 */
	deselectAll() {
		const fileExplorer = this.getFileExplorer();
		if (!fileExplorer) return;

		const tree = fileExplorer.tree as unknown as MockTree;
		tree.clearSelectedDoms();
	}
}

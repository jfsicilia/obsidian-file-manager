import {
	Vault,
	Platform,
	View,
	TAbstractFile,
	TFile,
	TFolder,
	FileSystemAdapter,
} from "obsidian";

import {
	FileExplorer,
	FileOrFolderItem,
	FolderItem,
	MockApp,
	MockVault,
	MockWorkspace,
	MockTree,
} from "obsidian-internals";

import { FileConflictResolution } from "conflict";
import FileManagerPlugin from "main";
import { normalize } from "path";

// ------------------------- Helper Functions -------------------------

export function getVaultAbsolutePath(): string {
	let adapter = this.app.vault.adapter;
	if (adapter instanceof FileSystemAdapter) return adapter.getBasePath();

	return "";
}

/**
 * Returns the absolute path of a file in the vault. It takes into account
 * the platform and the path separator.
 */
export function getAbsolutePathOfFile(file: TAbstractFile): string {
	const basePath = getVaultAbsolutePath();
	const path = normalize(`${basePath}/${file.path}`);
	if (Platform.isDesktopApp && Platform.isWin)
		return path.replace(/\//g, "\\");

	return path;
}

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

	 * createPathToNameMap(["file.md", "notes/file2.md", "notes/folder/file3.md"])
	 * -> Map { "file.md":"file.md", "notes/file2.md":"file2.md", "notes/folder/file3.md":"file3.md" }

	 * createPathToNameMap(["miDir", "dir1/dir2"])
	 * -> Map { "miDir":"miDir", "dir1/dir2":"dir2"}
	 */
function createPathToNameMap(paths: string[]): Map<string, string> {
	const pathsMap: Map<string, string> = new Map();
	paths.forEach((path) => pathsMap.set(path, path.split(DIR_SEP).pop()!));
	return pathsMap;
}

/**
 * Uncollapse the folder, and all the ancestors, in the file explorer that
 * contains the file/folder with the given `path`.
 */
function uncollapsePath(fileExplorer: FileExplorer, path: string) {
	let item = fileExplorer.fileItems[path] as FileOrFolderItem;
	if (!item) return;

	// Loops through the ancestors and uncollapse them until the root.
	while (true) {
		if (item.file instanceof TFolder)
			(item as FolderItem).setCollapsed(false);
		const parent = item.file.parent;
		if (!parent || !parent.name) break;
		item = item.parent;
	}
}

/**
 * Scrolls the file explorer to bring the file/folder with the given `path`
 * into view.
 */
function scrollToPath(fileExplorer: FileExplorer, path: string) {
	// Get the file element in the DOM
	const fileEl = fileExplorer.containerEl.querySelector(
		`[data-path="${path}"]`
	);
	// Scroll the container to bring the file element into view
	if (fileEl) fileEl.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ------------------------- File Manager -------------------------

export const FILE_EXPLORER_TYPE = "file-explorer";

export const DIR_SEP = "/";
export const EXT_SEP = ".";

// When a conflict occurs, if the user selects one of these options, then
// the folder where the file/folder is moved/copied will be expanded.
const EXPAND_FOLDER_AFTER_OPERATION: (FileConflictResolution | null)[] = [
	FileConflictResolution.KEEP,
	FileConflictResolution.OVERWRITE,
	null,
];

/**
 * FileManager class provides a set of methods to interact with the file explorer.
 */
export class FileManager {
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
	 * are selected and `useActiveFileIfNonSelected` is true, it returns the
	 * active file/folder if available. If no active
	 * file/folder is available or `useActiveFileIfNonSelected` is false, it
	 * returns an empty array.
	 */
	getSelectedFilesOrFolders(
		useActiveFileIfNonSelected: boolean = true
	): TAbstractFile[] {
		const { fileExplorer, activeFileOrFolder } =
			this.getFileExplorerAndActiveFileOrFolder();

		if (!fileExplorer) return [];

		// If no items are selected, return the active item if available and
		// `useActiveFileIfNonSelected` is true.
		if (fileExplorer.tree.selectedDoms.size === 0) {
			if (!useActiveFileIfNonSelected) return [];
			return activeFileOrFolder ? [activeFileOrFolder] : [];
		}

		// Return all selected files/folders as TAbstractFiles.
		return Array.from(
			Array.from(fileExplorer.tree.selectedDoms.values()).map(
				(item) => item.file
			)
		);
	}

	/**
	 * Returns the selected files'/folders' path in the file explorer. If no files/folders
	 * are selected and `useActiveFileIfNonSelected` is true, it returns the active
	 * file'/folder' path if available. If no active file/folder is available or
	 * `useActiveFileIfNonSelected` is false, it returns an empty array.
	 * The returning paths can be pruned by removing the paths that are descendants
	 * of other selected files/folders using the parameter `prune`.
	 */
	getSelectedFilesOrFoldersPath(
		prune: boolean = false,
		useActiveFileIfNonSelected: boolean = true
	): string[] {
		const paths: string[] = this.getSelectedFilesOrFolders(
			useActiveFileIfNonSelected
		).map((fileOrFolder) => fileOrFolder.path);
		return prune ? pruneDescendantsPaths(paths) : paths;
	}

	/**
	 * Get all selected files/folders' paths in the file explorer, if `prune` is
	 * true, it simplifies the total by removing the paths that are descendants
	 * of other selected files/folders. For the resulting paths, it creates and
	 * returns a map where the key is the source path of the selected
	 * files/folders in file explorer, and the value is the simplified
	 * destination path (e.g. home/notes/file.md -> file.md).
	 * `useActiveFileIfNonSelected` is true, it returns the active file/folder
	 * path if no files/folders are selected.
	 */
	getSelectedPathToNameMap(
		prune: boolean = false,
		useActiveFileIfNonSelected: boolean = true
	): Map<string, string> {
		return createPathToNameMap(
			this.getSelectedFilesOrFoldersPath(
				prune,
				useActiveFileIfNonSelected
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
	 * Set focus and starts the rename operation of the file/folder in the
	 * file explorer.
	 */
	protected _focusAndRenameFile(
		fileExplorer: FileExplorer,
		fileOrFolder: TAbstractFile
	) {
		// TODO: Regresion - This was working in Obsidian 1.6. Not working in 1.7
		// Give chance to the user to rename the new folder.
		// Call to nextFrame is mandatory to show correctly the rename textbox.
		// this.app.nextFrame(
		// 	async () => await fileExplorer.startRenameFile(fileOrFolder)
		// );
		setTimeout(
			async () => await fileExplorer.startRenameFile(fileOrFolder),
			100
		);
	}

	/**
	 * It tries to perform the operation `operation` (e.g. copy, move, ...)
	 * on the source `src` and destination `dest` paths. If the destination
	 * path already exists, it will use the `resolve` parameter to solve the
	 * conflict. The `resolve` could be a `FileConflictResolution` value or
	 * null, in this later case, will call `getFileConflictResolutionMethod`
	 * from the plugin, to get the user's choice. If SKIP, no operation is performed,
	 * if OVERWRITE, the destination is deleted and the operation is performed,
	 * if KEEP, the destination is renamed and the operation is performed.
	 * It returns an array with three values:
	 * - The `FileConflictResolution` applied or null if no conflict.
	 * - A boolean indicating if the user wants to apply the same resolution
	 *  to all conflicts.
	 * - The final destination path where the operation was performed (useful
	 * if a new filename has been created to avoid conflicts (KEEP)).
	 */
	protected async _conflictSolver(
		fileExplorer: FileExplorer,
		src: string,
		dest: string,
		operation: (src: string, dest: string) => Promise<void>,
		resolve: FileConflictResolution | null = null
	): Promise<[FileConflictResolution | null, boolean, string]> {
		let applyToAll = true;
		// If destination doesn't exist, perform the operation (no conflict).
		if (!(await this.vault.exists(dest))) {
			await operation(src, dest);
			return [null, applyToAll, dest];
		}
		// Destination file/folder already exists. Handle conflict!

		// If no resolution is provided, get the user's choice.
		if (!resolve)
			[resolve, applyToAll] =
				await this.plugin.getFileConflictResolutionMethod(dest);
		if (resolve === FileConflictResolution.OVERWRITE) {
			await this.app.fileManager.trashFile(
				fileExplorer.fileItems[dest].file
			);
			await operation(src, dest);
			return [FileConflictResolution.OVERWRITE, applyToAll, dest];
		}
		if (resolve === FileConflictResolution.KEEP) {
			// Generate a non existing path for the destination.
			dest = genNonExistingPath(fileExplorer, dest);
			await operation(src, dest);
			return [FileConflictResolution.KEEP, applyToAll, dest];
		}
		return [FileConflictResolution.SKIP, applyToAll, dest];
	}

	/**
	 * Creates a new folder in the file explorer. The path where the new
	 * folder will be created is determined by the `getFolderPath` function.
	 * This function receives the focused/active file or folder in file explorer
	 * and returns the path where the new folder will be created.
	 * Returns the path of the new created folder or null if no folder was created.
	 */
	protected async _createFolder(
		getFolderPath: (activeFileOrFolder: TAbstractFile) => string | undefined
	): Promise<string | null> {
		const { fileExplorer, activeFileOrFolder } =
			this.getFileExplorerAndActiveFileOrFolder();
		if (!fileExplorer || !activeFileOrFolder) return null;

		// Get the path of the folder where the new folder will be created.
		const path = getFolderPath(activeFileOrFolder);
		if (!path) return null;

		// Expand the parent folder to show the new folder, if it's not root.
		if (path !== DIR_SEP) uncollapsePath(fileExplorer, path);

		// Generate a non existing name for the new folder.
		let newPath =
			(path === DIR_SEP ? "" : path + DIR_SEP) +
			this.plugin.settings.newFolderName;
		newPath = genNonExistingPath(fileExplorer, newPath);

		// Create the new subfolder and set focus on it.
		const newFolder = await this.vault.createFolder(newPath);
		fileExplorer.tree.setFocusedItem(
			fileExplorer.fileItems[newFolder.path],
			true
		);

		this._focusAndRenameFile(fileExplorer, newFolder);
		return newPath;
	}

	/**
	 * Creates a new subfolder within the currently selected or active folder
	 * in the file explorer. If the currently selected or active item is a file,
	 * the parent folder is used as active folder.
	 * Returns the path of the new created folder or null if no folder was created.
	 */
	async createSubFolder(): Promise<string | null> {
		return await this._createFolder((fileOrFolder) => {
			return fileOrFolder instanceof TFolder
				? fileOrFolder.path
				: fileOrFolder.parent?.path;
		});
	}

	/**
	 * Creates a new folder as a sibling of the currently selected or active
	 * folder in the file explorer. If the currently selected or active item is
	 * a file, the parent folder is used as active folder.
	 * Returns the path of the new created folder or null if no folder was created.
	 */
	async createFolder(): Promise<string | null> {
		return await this._createFolder((fileOrFolder) => {
			return fileOrFolder.parent?.path;
		});
	}

	/**
	 * Creates a new note in the currently focused or active folder.
	 * Returns the path of the new note or null if no note was created.
	 */
	async createNote(): Promise<string | null> {
		const { fileExplorer, activeFileOrFolder } =
			this.getFileExplorerAndActiveFileOrFolder();
		if (!fileExplorer || !activeFileOrFolder) return null;

		const path: string =
			activeFileOrFolder instanceof TFolder
				? activeFileOrFolder.path
				: activeFileOrFolder.parent?.path!;

		// Expand ancestors' folders to show the new note.
		uncollapsePath(fileExplorer, path);

		// Generate a non existing name for the new note.
		const newPath = genNonExistingPath(
			fileExplorer,
			path + DIR_SEP + this.plugin.settings.newNoteName
		);

		// Create empty note and set focus on it.
		await this.vault.create(newPath, "");
		const newNoteItem = fileExplorer.fileItems[newPath];
		fileExplorer.tree.setFocusedItem(newNoteItem, true);

		this._focusAndRenameFile(fileExplorer, newNoteItem.file);
		return newPath;
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
		const dest = addSuffixBeforeExtension(
			src,
			this.plugin.settings.duplicateSuffix
		);
		const [_1, _2, path] = await this._copyFileOrFolder(
			fileExplorer,
			src,
			dest,
			FileConflictResolution.KEEP
		);
		// Focus and rename the duplicated file/folder.
		const fileOrFolder = fileExplorer.fileItems[path].file;
		this._focusAndRenameFile(fileExplorer, fileOrFolder);
	}

	/**
	 * Helper function that moves src file/folder to dest path, by using the
	 * conflict solver to handle conflicts.
	 * The `resolve` could be a `FileConflictResolution` value or
	 * null, in this later case, will call `getFileConflictResolutionMethod`
	 * from the plugin, to get the user's choice. If SKIP, no operation is performed,
	 * if OVERWRITE, the destination is deleted and the operation is performed,
	 * if KEEP, the destination is renamed and the operation is performed.
	 * It returns an array with three values:
	 * - The `FileConflictResolution` applied or null if no conflict.
	 * - A boolean indicating if the user wants to apply the same resolution
	 *  to all conflicts.
	 * - The final destination path where the operation was performed (useful
	 * if a new filename has been created to avoid conflicts (KEEP)).
	 */
	protected async _moveFileOrFolder(
		fileExplorer: FileExplorer,
		src: string,
		dest: string,
		resolve: FileConflictResolution | null = null
	): Promise<[FileConflictResolution | null, boolean, string]> {
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
	 * Moves the selected files/folders in the file explorer to the specified
	 * `path`.
	 *
	 * @param path - The destination path where the selected files/folders will
	 * be moved.
	 * @param pathToName - A map where the key is the source path of the selected
	 * files/folders, and the value is the destination name. If null, it will
	 * use the selected files/folders in the file explorer.
	 * @param resolve - The conflict resolution strategy to use when a
	 * file/folder with the same name already exists at the destination. If
	 * null, the user will be prompted to choose a resolution.
	 * @returns A map where the key is the destination path and the value is the
	 * conflict resolution applied (or null if no conflict occurred).
	 */
	async moveFiles(
		path: string,
		pathToName: Map<string, string> | null = null,
		resolve: FileConflictResolution | null = null
	): Promise<Map<string, FileConflictResolution | null>> {
		const stats: Map<string, FileConflictResolution | null> = new Map();
		const fileExplorer = this.getFileExplorer();
		if (!fileExplorer) return stats;

		if (!pathToName) pathToName = this.getSelectedPathToNameMap(true);

		for (const [src, dest] of pathToName) {
			const newDest = `${path}/${dest}`;
			const [resolution, applyToAll, _] = await this._moveFileOrFolder(
				fileExplorer,
				src,
				newDest,
				resolve
			);
			// Check if we should expand a destination folder.
			if (EXPAND_FOLDER_AFTER_OPERATION.includes(resolution))
				uncollapsePath(fileExplorer, path);

			stats.set(newDest, resolution);
			if (applyToAll) resolve = resolution;
		}
		return stats;
	}

	/**
	 * Helper function that copies src file/folder to dest path, by using the
	 * conflict solver to handle conflicts.
	 * The `resolve` could be a `FileConflictResolution` value or
	 * null, in this later case, will call `getFileConflictResolutionMethod`
	 * from the plugin, to get the user's choice. If SKIP, no operation is performed,
	 * if OVERWRITE, the destination is deleted and the operation is performed,
	 * if KEEP, the destination is renamed and the operation is performed.
	 * It returns an array with three values:
	 * - The `FileConflictResolution` applied or null if no conflict.
	 * - A boolean indicating if the user wants to apply the same resolution
	 *  to all conflicts.
	 * - The final destination path where the operation was performed (useful
	 * if a new filename has been created to avoid conflicts (KEEP)).
	 */
	protected async _copyFileOrFolder(
		fileExplorer: FileExplorer,
		src: string,
		dest: string,
		resolve: FileConflictResolution | null = null
	): Promise<[FileConflictResolution | null, boolean, string]> {
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
		pathToName: Map<string, string> | null = null,
		resolve: FileConflictResolution | null = null
	): Promise<Map<string, FileConflictResolution | null>> {
		const stats: Map<string, FileConflictResolution | null> = new Map();

		const fileExplorer = this.getFileExplorer();
		if (!fileExplorer) return stats;

		if (!pathToName) pathToName = this.getSelectedPathToNameMap(true);

		for (const [src, dest] of pathToName) {
			const newDest = `${path}/${dest}`;
			const [resolution, applyToAll, _] = await this._copyFileOrFolder(
				fileExplorer,
				src,
				newDest,
				resolve
			);
			// Check if we should expand a destination folder.
			if (EXPAND_FOLDER_AFTER_OPERATION.includes(resolution))
				uncollapsePath(fileExplorer, path);

			stats.set(newDest, resolution);
			if (applyToAll) resolve = resolution;
		}
		return stats;
	}

	/**
	 * Selects the items in the file explorer with the specified `paths`. If
	 * `clearSelection` is true, it clears the selection before selecting new items.
	 * Returns the total number of current selected items.
	 */
	selectItems(paths: string[], clearSelection: boolean = true): number {
		if (clearSelection) this.deselectAll();

		const fileExplorer = this.getFileExplorer();
		if (!fileExplorer) return 0;

		const tree = fileExplorer.tree as unknown as MockTree;
		paths.forEach((path) => {
			const item = fileExplorer.fileItems[path];
			if (!item) return;
			tree.selectItem(item);
		});
		return fileExplorer.tree.selectedDoms.size;
	}

	/**
	 * Selects all items in the file explorer within the parent of the focused or
	 * active item. Returns total number of selected items. If `clearSelection` is
	 * true, it clears the selection before selecting new items.
	 */
	selectAll(clearSelection: boolean = true) {
		const { fileExplorer, activeFileOrFolder } =
			this.getFileExplorerAndActiveFileOrFolder();
		if (!fileExplorer || !activeFileOrFolder) return;

		let parentPath = activeFileOrFolder.parent?.path;
		if (!parentPath) return;
		// If the parent path is the root, we need to remove the slash.
		parentPath = parentPath === DIR_SEP ? "" : parentPath + DIR_SEP;

		// Select all items dangling from parentPath.
		const tree = fileExplorer.tree as unknown as MockTree;
		if (clearSelection) tree.clearSelectedDoms();
		for (const [path, item] of Object.entries(fileExplorer.fileItems)) {
			if (path.startsWith(parentPath)) tree.selectItem(item);
		}
	}

	/**
	 * Toggles selection of the active file/folder in the file explorer. Returns
	 * total number of selected items. If `clearSelection` is true, it clears the
	 * selection before toggling.
	 */
	toggleSelect(clearSelection: boolean = false) {
		const { fileExplorer, activeFileOrFolder } =
			this.getFileExplorerAndActiveFileOrFolder();
		if (!fileExplorer || !activeFileOrFolder) return;

		const tree = fileExplorer.tree as unknown as MockTree;
		if (clearSelection) tree.clearSelectedDoms();

		// Toggle selection.
		const fileOrFolder = fileExplorer.fileItems[activeFileOrFolder.path];
		const selected = fileExplorer.tree.selectedDoms.has(fileOrFolder);
		if (selected) tree.deselectItem(fileOrFolder);
		else tree.selectItem(fileOrFolder);
	}

	/**
	 * Inverts the current selection of items in file explorer.
	 */
	invertSelection() {
		const fileExplorer = this.getFileExplorer();
		if (!fileExplorer) return;

		// Get all items that are not currently selected.
		const toSelect = [];
		for (const item of Object.values(fileExplorer.fileItems)) {
			if (!fileExplorer.tree.selectedDoms.has(item)) toSelect.push(item);
		}

		const tree = fileExplorer.tree as unknown as MockTree;
		tree.clearSelectedDoms();
		toSelect.forEach((item) => tree.selectItem(item));
	}

	/**
	 * Clears the selection of all items in the file explorer. It returns
	 * the total number of items that were selected before clearing.
	 */
	deselectAll() {
		const fileExplorer = this.getFileExplorer();
		if (!fileExplorer) return;

		const tree = fileExplorer.tree as unknown as MockTree;
		tree.clearSelectedDoms();
	}

	/**
	 * Focuses the file/folder in the file explorer with the specified `path`.
	 * If the file/folder is a file, it will open it.
	 */
	focusPath(path: string) {
		const { fileExplorer, activeFileOrFolder } =
			this.getFileExplorerAndActiveFileOrFolder();
		if (!fileExplorer || !activeFileOrFolder) return null;

		const item = fileExplorer.fileItems[path];
		if (!item) return;

		// Focus File Explorer.
		this.workspace.setActiveLeaf(
			this.workspace.getLeavesOfType(FILE_EXPLORER_TYPE)[0],
			{ focus: true }
		);
		// Focus item in file explorer.
		uncollapsePath(fileExplorer, path);
		fileExplorer.tree.setFocusedItem(item, true);
		scrollToPath(fileExplorer, path);
		// Open item if it's a file.
		// if (item.file instanceof TFile)
		// 	this.workspace.getLeaf().openFile(item.file);
	}
}

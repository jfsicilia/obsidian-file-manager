import { App, FuzzySuggestModal, TAbstractFile } from "obsidian";

/**
 * A modal that suggests folders to the user.
 */
export class SuggestPathModal extends FuzzySuggestModal<TAbstractFile> {
	constructor(
		app: App,
		// The folders to suggest to the user
		private folders: TAbstractFile[],
		// The function to execute when the user selects a folder
		private toDo: (path: string) => Promise<void>
	) {
		super(app);
	}

	/**
	 * Returns the folders to suggest to the user.
	 */
	getItems(): TAbstractFile[] {
		return this.folders;
	}

	/**
	 * Returns the text to display for a folder.
	 */
	getItemText(folder: TAbstractFile): string {
		return folder.path;
	}

	/**
	 * Executes the function toDo when the user selects a folder.
	 */
	onChooseItem(folder: TAbstractFile, evt: MouseEvent | KeyboardEvent) {
		(async () => await this.toDo(folder.path))();
	}
}

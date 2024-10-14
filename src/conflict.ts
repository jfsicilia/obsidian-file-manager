import { App, Modal, Setting } from "obsidian";

// File conflict resolution methods when copying or moving files.
export enum FileConflictResolution {
	SKIP = "SKIP",
	OVERWRITE = "OVERWRITE",
	KEEP = "KEEP",
}

// User can config the settings with the following options for file conflict resolution.
export enum FileConflictOption {
	SKIP = "SKIP",
	OVERWRITE = "OVERWRITE",
	KEEP = "KEEP",
	PROMPT = "PROMPT",
}

// What to display when user prompt to choose the file conflict resolution method.
export const FileConflictResolutionDescription: Record<
	FileConflictResolution,
	string
> = {
	[FileConflictResolution.SKIP]: "Skip",
	[FileConflictResolution.OVERWRITE]: "Overwrite",
	[FileConflictResolution.KEEP]: "Keep",
};

// What to display when choosing the file conflict resolution options setting.
export const FileConflictOptionDescription: Record<
	FileConflictResolution | FileConflictOption,
	string
> = {
	...FileConflictResolutionDescription,
	[FileConflictOption.PROMPT]: "Prompt user",
};

/**
 * Allows to provide the file conflict resolution method for a file.
 */
export interface FileConflictResolutionProvider {
	getFileConflictResolutionMethod(
		path: string
	): Promise<[FileConflictResolution, boolean]>;
}

/**
 * Modal to prompt the user to choose the file conflict resolution method.
 */
export class ConflictModal extends Modal {
	private resolvePromise: (value: [FileConflictResolution, boolean]) => void;

	// Stores the user's choice to apply the same resolution to all conflicts.
	private applyToAll: boolean = false;

	constructor(app: App, file: string) {
		super(app);
		this.setTitle(`There is a conflict with "${file}"`);

		let setting = new Setting(this.contentEl);
		setting.setName("Do the same for all conflicts?");
		setting.addToggle((toggle) => {
			toggle.setValue(this.applyToAll);
			toggle.onChange((value) => {
				this.applyToAll = value;
			});
		});

		setting = new Setting(this.contentEl);
		const resolutions: FileConflictResolution[] = Object.values(
			FileConflictResolution
		) as FileConflictResolution[];
		resolutions.forEach((resolution) => {
			setting.addButton((btn) =>
				btn
					.setButtonText(
						FileConflictResolutionDescription[resolution]
					)
					.setCta()
					.onClick(() => {
						this.resolvePromise([resolution, this.applyToAll]);
						this.close();
					})
			);
		});
	}

	onClose() {
		// On close, resolve the promise with the SKIP resolution method.
		if (this.resolvePromise)
			this.resolvePromise([FileConflictResolution.SKIP, this.applyToAll]);
	}

	openAndWait(): Promise<[FileConflictResolution, boolean]> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			this.open();
		});
	}
}

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
		const { contentEl } = this;

		this.setTitle("There is a conflict with: ");
		const modalContent = contentEl.createDiv({ cls: "fn-modal-content" });
		modalContent.createEl("p", { text: file });

		const btnContainer = contentEl.createEl("div", {
			cls: "modal-button-container",
		});

		const checkbox = btnContainer.createEl("label", {
			cls: "mod-checkbox",
		});
		checkbox.tabIndex = -1;
		const input = checkbox.createEl("input", { type: "checkbox" });
		checkbox.appendText("Don't ask again");
		input.addEventListener("change", (e) => {
			const target = e.target as HTMLInputElement;
			this.applyToAll = target.checked;
		});

		const resolutions: FileConflictResolution[] = Object.values(
			FileConflictResolution
		) as FileConflictResolution[];

		resolutions.forEach((resolution) => {
			const btn = btnContainer.createEl("button", {
				text: FileConflictResolutionDescription[resolution],
				cls: "mod-cta",
			});
			btn.addEventListener("click", () => {
				this.resolvePromise([resolution, this.applyToAll]);
				this.close();
			});
		});
		const cancelBtn = btnContainer.createEl("button", {
			text: "Cancel",
			cls: "mod-cancel",
		});
		cancelBtn.addEventListener("click", async () => {
			this.resolvePromise([FileConflictResolution.SKIP, this.applyToAll]);
			this.close();
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

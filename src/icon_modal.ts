import {
	App,
	FuzzySuggestModal,
	FuzzyMatch,
	Modal,
	Notice,
	getIconIds,
	setIcon,
} from "obsidian";

export class LucideIconPickerModal extends FuzzySuggestModal<string> {
	constructor(app: App, private toDo: (icon: string) => void) {
		super(app);
		this.setPlaceholder("Search for a Lucide icon...");
	}

	// Get all available Lucide icons
	getItems(): string[] {
		return getIconIds();
		// return getIconIds().map((icon) => icon.substring(7));
	}

	/**
	 * Returns the text to display for an icon.
	 */
	getItemText(icon: string): string {
		return `lucide-${icon}`;
	}

	// Render the icon with its name in the modal
	renderSuggestion(match: FuzzyMatch<string>, el: HTMLElement): void {
		const iconContainer = el.createDiv();
		setIcon(iconContainer.createSpan(), match.item);
		iconContainer.createSpan({ text: "  " });
		iconContainer.createSpan({ text: match.item });
	}

	// Action when a user selects an icon
	onChooseItem(icon: string, evt: MouseEvent | KeyboardEvent): void {
		this.toDo(icon);
	}
}

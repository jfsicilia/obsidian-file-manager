import {
	App,
	PluginSettingTab,
	Setting,
	Notice,
	ButtonComponent,
	setIcon,
} from "obsidian";
import {
	VAR_FILE_PATH,
	VAR_FILE_NAME,
	VAR_FOLDER_NAME,
	VAR_FOLDER_PATH,
} from "open_with_cmd";
import FileManagerPlugin from "main";
import { LucideIconPickerModal } from "icon_modal";

import { FileConflictOptionDescription, FileConflictOption } from "conflict";

/**
 * Stores the information of an application to open files with.
 */
export interface AppCmd {
	name: string;
	cmd: string;
	args: string;
	showInMenu: boolean;
	icon: string;
}

export interface PathPattern {
	regex: string;
	applyTo: string;
	appName: string;
	icon: string;
}

interface DropdownOption {
	value: string;
	text: string;
}

export const APPLY_TO_FILES = "files";
export const APPLY_TO_FOLDERS = "folders";
export const APPLY_TO_FILES_AND_FOLDERS = "files and folders";
const APPLY_TO: DropdownOption[] = [
	{ value: APPLY_TO_FILES_AND_FOLDERS, text: "Files & Folders" },
	{ value: APPLY_TO_FILES, text: "Files" },
	{ value: APPLY_TO_FOLDERS, text: "Folders" },
];

/**
 * FileManager plugin settings
 */
export interface FileManagerSettings {
	conflictResolutionMethod: string;
	showSelectionStatusBar: boolean;
	showCopyMoveStats: boolean;
	showClipboardStatusBar: boolean;
	newFolderName: string;
	newNoteName: string;
	duplicateSuffix: string;
	apps: AppCmd[];
	patterns: PathPattern[];
}

// Default settings for the FileManager plugin
export const DEFAULT_SETTINGS: FileManagerSettings = {
	conflictResolutionMethod: FileConflictOption.SKIP,
	showSelectionStatusBar: true,
	showCopyMoveStats: true,
	showClipboardStatusBar: true,
	newFolderName: "New Folder",
	newNoteName: "New Note.md",
	duplicateSuffix: " - Copy",
	apps: [],
	patterns: [],
};

const DEFAULT_ICON = "circle-dashed";

/**
 * Converts plain html text to a html DocumetFragment.
 */
function htmlToFragment(html: string): DocumentFragment {
	const range = document.createRange();
	return range.createContextualFragment(html);
}

/**
 * FileManagerPlugin settings tab
 */
export class FileManagerSettingTab extends PluginSettingTab {
	plugin: FileManagerPlugin;

	constructor(app: App, plugin: FileManagerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
         SECTION: General settings
    **/
	generalSection(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Conflict resolution method")
			.setDesc("Method to resolve conflicts in copy/move operations")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(FileConflictOptionDescription)
					.setValue(this.plugin.settings.conflictResolutionMethod)
					.onChange(async (value) => {
						this.plugin.settings.conflictResolutionMethod = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Show copy/move stats")
			.setDesc("When a copy/move operation is done, show the stats")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showCopyMoveStats)
					.onChange(async (value) => {
						this.plugin.settings.showCopyMoveStats = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Show selection info in status bar")
			.setDesc(
				"Show, in the status bar, the number of selected files/folders"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showSelectionStatusBar)
					.onChange(async (value) => {
						this.plugin.settings.showSelectionStatusBar = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Show clipboard info in status bar")
			.setDesc(
				"Show, in the status bar, the number of files/folders in the clipboard"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showClipboardStatusBar)
					.onChange(async (value) => {
						this.plugin.settings.showClipboardStatusBar = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Duplicate suffix")
			.setDesc("Suffix to add when file/folder is duplicated")
			.addText((text) =>
				text
					.setPlaceholder("Enter your suffix")
					.setValue(this.plugin.settings.duplicateSuffix)
					.onChange(async (value) => {
						if (value) this.plugin.settings.duplicateSuffix = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("New folder name")
			.setDesc("Default name of the folder to create")
			.addText((text) =>
				text
					.setPlaceholder("Enter folder name")
					.setValue(this.plugin.settings.newFolderName)
					.onChange(async (value) => {
						if (value) this.plugin.settings.newFolderName = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("New note name")
			.setDesc("Default name of the note to create")
			.addText((text) =>
				text
					.setPlaceholder("Enter note name")
					.setValue(this.plugin.settings.newNoteName)
					.onChange(async (value) => {
						if (value) this.plugin.settings.newNoteName = value;
						await this.plugin.saveSettings();
					})
			);
	}

	/** 
        SECTION: Open with...
    **/
	openWithSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Open with...").setHeading();
		const setting = new Setting(containerEl);
		setting.setName("Add new application to open with");
		const div = containerEl.createDiv({ cls: "setting-item-description" });
		const helpMsg = `Use full <i>path to command</i> or just <i>command</i> if it is globally available
		    (for example <i>c:\\Program Files\\myTool\\myTool.exe</i> or <i>code</i> for VSCode).<BR><BR>

		    Arguments are optional and can include any of these predefined variables:<BR><BR>

            <b>${VAR_FILE_PATH}</b> - File path<BR>
            <b>${VAR_FOLDER_PATH}</b> - Folder path<BR>
            <b>${VAR_FILE_NAME}</b> - File name<BR>
            <b>${VAR_FOLDER_NAME}</b> - Folder name<BR><BR>

            Sometimes the command needs the arguments to be send independently, 
            you can separate arguments using commas in those cases.<BR><BR>

            <b>Example 1:</b> Command: <i>/usr/bin/chromium-browser</i> | Arguments: <i>${VAR_FILE_PATH}</i><BR>
            <b>Example 2:</b> Command: <i>c:\\Program files\\OneCommander\\OneCommander.exe</i> | Arguments: <i>${VAR_FILE_PATH}</i><BR>
            <b>Example 3:</b> Command: <i>cmd</i> | Arguments: <i>/K cd ${VAR_FOLDER_PATH}</i><BR>
            <b>Example 4:</b> Command: <i>wt</i> | Arguments: <i>-p, Ubuntu, wsl, --cd, ${VAR_FOLDER_PATH}</i><BR><BR>

		    <b>NOTE:</b> No need to add double quotes for paths with spaces.<BR><BR>

            <b>New from 1.2.2:</b> You can also define an App URL Schema as a command (for example 
            <i>ulysses://x-callback-url/open?path=${VAR_FILE_PATH}</i>). When 
            defining an App URL Schema, arguments will be ignored.<BR><BR> `;
		div.appendChild(htmlToFragment(helpMsg));

		// Create input boxes for the new command.
		const inputContainer = containerEl.createDiv({
			cls: "settings-open-with-container",
		});

		let icon = DEFAULT_ICON;
		const iconBtn = new ButtonComponent(inputContainer)
			.setIcon(icon)
			.setTooltip("Choose icon")
			.setClass("open-with-icon-btn")
			.onClick(() => {
				new LucideIconPickerModal(this.app, (iconSelected) => {
					icon = iconSelected;
					if (icon) iconBtn.setIcon(icon);
				}).open();
			});

		const nameInput = inputContainer.createEl("input", {
			attr: { type: "text", placeholder: "Display name" },
			cls: "settings-open-with-name-inputbox",
		});
		const cmdInput = inputContainer.createEl("input", {
			attr: { type: "text", placeholder: "Command or full path command" },
			cls: "settings-open-with-cmd-inputbox",
		});
		const argsInput = inputContainer.createEl("input", {
			attr: { type: "text", placeholder: "Arguments (optional)" },
			cls: "settings-open-with-args-inputbox",
		});

		// Create buttons to reset and add the new command.
		new ButtonComponent(inputContainer)
			.setIcon("rotate-ccw")
			.setTooltip("Reset fields")
			.setClass("open-with-reset-btn")
			.onClick(() => {
				nameInput.value = "";
				cmdInput.value = "";
				argsInput.value = "";
				icon = DEFAULT_ICON;
				iconBtn.setIcon(icon);
			});
		new ButtonComponent(inputContainer)
			.setIcon("circle-plus")
			.setTooltip("Add command to open with...")
			.setClass("open-with-add-btn")
			.onClick(async () => {
				const name = nameInput.value.trim();
				const cmd = cmdInput.value.trim();
				let args = argsInput.value.trim();
				if (!(name && cmd)) {
					return new Notice(
						"Display name & path/command are always neccessary."
					);
				}

				// Add command to open with the app. If there was an obsidian
				// command in the plugin with the same name, it will be replaced.
				this.plugin.addCommand(
					this.plugin.createOpenWithCmd(name, cmd, args)
				);

				const newApp = { name, cmd, args, showInMenu: false, icon };
				const apps = this.plugin.settings.apps;
				const app = apps.find((app) => app.name === newApp.name);
				if (app) {
					new Notice(`Modifying ${newApp.name} command.`);
					app.args = newApp.args;
					app.cmd = newApp.cmd;
					app.icon = newApp.icon;
				} else {
					apps.push(newApp);
					new Notice(`Adding ${newApp.name} command.`);
				}

				await this.plugin.saveSettings();
				this.display();
			});

		// Display all saved commands in the settings.
		this.plugin.settings.apps.forEach((app) => {
			if (!app.icon) app.icon = DEFAULT_ICON;
			new Setting(containerEl)
				.setName(app.name)
				.setDesc(
					`Command: ${app.cmd}${
						app.args ? ` | Arguments: ${app.args}` : ""
					}`
				)
				.addToggle((toggle) => {
					const showText = document.createElement("span");
					showText.textContent = "Show in File-Menu ";
					showText.classList.add("settings-open-with-show-text");
					// @ts-ignore
					toggle.toggleEl.parentElement.prepend(showText);
					toggle.setValue(app.showInMenu).onChange(async (value) => {
						app.showInMenu = value;
						await this.plugin.saveSettings();
					});
				})
				.addButton((btn) => {
					btn.setIcon(app.icon)
						.setTooltip("Icon for command")
						.onClick(() => {
							new LucideIconPickerModal(
								this.app,
								async (iconSelected) => {
									app.icon = iconSelected;
									if (app.icon) btn.setIcon(app.icon);
									await this.plugin.saveSettings();
								}
							).open();
						});
				})
				// Button to fill the commands fields with this command.
				.addButton((btn) => {
					btn.setIcon("pen")
						.setTooltip("Edit command")
						.onClick(async () => {
							nameInput.value = app.name;
							cmdInput.value = app.cmd;
							argsInput.value = app.args;
							icon = app.icon;
							iconBtn.setIcon(icon);
						});
				})
				// Button to remove the command.0
				.addButton((btn) => {
					btn.setIcon("trash")
						.setTooltip("Remove command")
						.onClick(async () => {
							this.plugin.settings.apps.remove(app);
							await this.plugin.saveSettings();
							this.display();
						});
				});
		});
	}

	/**
        SECTION: Path Explorer settings
    **/
	pathExplorerSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Path explorer").setHeading();
		let setting = new Setting(containerEl);
		setting.setName(
			"Define patterns to match files and folders and open them with an Open with... command."
		);
		const div = containerEl.createDiv({ cls: "setting-item-description" });
		const helpMsg = `The <b>pathexplore</b> codeblock displays files and folders 
        from a specified path or multiple paths. You can define <b>patterns</b> to 
        match the names of files and/or folders, and bind an <b>Open with...</b> 
        command to open them. For files and folders that match the patterns, an 
        icon will appear next to their name (and they will also appear in the link 
        context menu). Clicking the icon will open the file or folder using the 
        associated command.<br><br>`;

		div.appendChild(htmlToFragment(helpMsg));

		// Create input boxes for the new command.
		const container = containerEl.createDiv({
			cls: "settings-path-explorer-container",
		});
		const regexInput = container.createEl("input", {
			attr: { type: "text", placeholder: "Enter regular expression" },
			cls: "settings-path-explorer-regex",
		});
		container.createEl("div", {
			text: "Apply to: ",
			cls: "settings-path-explorer-label",
		});
		const applyToDropdown = container.createEl("select", {
			cls: "settings-path-explorer-dropdown dropdown",
		});
		APPLY_TO.map((applyTo) => applyToDropdown.createEl("option", applyTo));

		container.createEl("div", {
			text: "Open with: ",
			cls: "settings-path-explorer-label",
		});
		const cmdDropdown = container.createEl("select", {
			cls: "settings-path-explorer-dropdown dropdown",
		});
		const apps = this.plugin.settings.apps;
		for (const app of apps.values()) {
			cmdDropdown.createEl("option", { value: app.name, text: app.name });
		}
		new ButtonComponent(container)
			.setIcon("rotate-ccw")
			.setTooltip("Reset fields")
			.setClass("settings-path-explorer-btn")
			.onClick(() => {
				regexInput.value = "";
				applyToDropdown.selectedIndex = 0;
				cmdDropdown.selectedIndex = 0;
			});
		new ButtonComponent(container)
			.setIcon("circle-plus")
			.setTooltip("Add pattern to open with...")
			.setClass("settings-path-explorer-btn")
			.onClick(async () => {
				const regex = regexInput.value.trim();
				const applyTo = applyToDropdown.value;
				const appName = cmdDropdown.value;
				const app = apps.find((app) => app.name === appName);
				const icon = app?.icon || DEFAULT_ICON;
				if (!regex || !appName)
					return new Notice(
						"Regular expression and Open with app are always neccessary."
					);

				const newPattern: PathPattern = {
					regex,
					applyTo,
					appName,
					icon,
				};
				const patterns = this.plugin.settings.patterns;
				const pattern = patterns.find(
					(pattern) =>
						pattern.regex === newPattern.regex &&
						pattern.appName === newPattern.appName
				);
				if (pattern) {
					new Notice(`Modifiying ${newPattern.regex} pattern.`);
					pattern.applyTo = newPattern.applyTo;
				} else {
					patterns.push(newPattern);
					new Notice(`Adding ${newPattern.regex} pattern.`);
				}
				await this.plugin.saveSettings();
				this.display();
			});

		// Display all saved commands in the settings.
		this.plugin.settings.patterns.forEach((pattern) => {
			const setting = new Setting(containerEl)
				.setName(`${pattern.regex}`)
				.setDesc(
					`All matching ${pattern.applyTo} will
                    be able to be open with ${pattern.appName}`
				)
				// Button to fill the commands fields with this command.
				.addButton((btn) => {
					btn.setIcon("pen")
						.setTooltip("Edit command")
						.onClick(async () => {
							regexInput.value = pattern.regex;
							applyToDropdown.value = pattern.applyTo;
							cmdDropdown.value = pattern.appName;
						});
				})
				// Button to remove the command.0
				.addButton((btn) => {
					btn.setIcon("trash")
						.setTooltip("Remove command")
						.onClick(async () => {
							this.plugin.settings.patterns.remove(pattern);
							await this.plugin.saveSettings();
							this.display();
						});
				});
			const icon = document.createElement("span");
			setIcon(icon, pattern.icon);
			setting.settingEl.prepend(icon);
		});
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		this.generalSection(containerEl);
		this.openWithSection(containerEl);
		this.pathExplorerSection(containerEl);
	}
}

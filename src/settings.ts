import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	Notice,
	ButtonComponent,
} from "obsidian";
import {
	VAR_FILE_PATH,
	VAR_FILE_NAME,
	VAR_FOLDER_NAME,
	VAR_FOLDER_PATH,
} from "open_with_cmd";
import FileManagerPlugin from "main";

import { FileConflictOptionDescription, FileConflictOption } from "conflict";

/**
 * Stores the information of an application to open files with.
 */
export interface AppCmd {
	name: string;
	cmd: string;
	args: string;
	showInMenu: boolean;
}

/**
 * FileManager plugin settings
 */
export interface FileManagerSettings {
	conflictResolutionMethod: string;
	showSelectionInfo: boolean;
	showCopyMoveInfo: boolean;
	newFolderName: string;
	newNoteName: string;
	duplicateSuffix: string;
	apps: AppCmd[];
}

// Default settings for the FileManager plugin
export const DEFAULT_SETTINGS: FileManagerSettings = {
	conflictResolutionMethod: FileConflictOption.SKIP,
	showSelectionInfo: true,
	showCopyMoveInfo: true,
	newFolderName: "New Folder",
	newNoteName: "New Note.md",
	duplicateSuffix: " - Copy",
	apps: [],
};

/**
 * FileManagerPlugin settings tab
 */
export class FileManagerSettingTab extends PluginSettingTab {
	plugin: FileManagerPlugin;

	constructor(app: App, plugin: FileManagerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// -------------------------
		// SECTION: General settings
		// -------------------------
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
			.setName("Show copy/move info")
			.setDesc("When a copy/move operation is done, show the stats")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showCopyMoveInfo)
					.onChange(async (value) => {
						this.plugin.settings.showCopyMoveInfo = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Show selection info")
			.setDesc("Show the number of selected files in the status bar")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showSelectionInfo)
					.onChange(async (value) => {
						this.plugin.settings.showSelectionInfo = value;
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

		// ---------------------
		// SECTION: Open with...
		// ---------------------
		new Setting(containerEl).setName("Open with...").setHeading();
		const setting = new Setting(containerEl);
		setting.setName("Add new application to open with");
		const div = containerEl.createDiv({ cls: "setting-item-description" });
		div.innerHTML = `Use full path command or just command if it is globally available
		    (for example <i>c:\\Program Files\\myTool\\myTool.exe</i> or <i>code</i> for VSCode).<BR><BR>

		    Arguments are optional and can include variables:<BR><BR>

            <b>${VAR_FILE_PATH}</b> - File path<BR>
            <b>${VAR_FOLDER_PATH}</b> - Folder path<BR>
            <b>${VAR_FILE_NAME}</b> - File name<BR>
            <b>${VAR_FOLDER_NAME}</b> - Folder name<BR><BR>

            Arguments are optional, if no arguments are provided, the <i>${VAR_FILE_PATH}</i> 
            will be added automatically as argument for the command.<BR>
            Sometimes the command needs the arguments to be send independently, 
            you can separate arguments using commas in those cases.<BR><BR>

            <b>Example 1:</b> Command: <i>/usr/bin/chromium-browser</i> | Arguments: <i>${VAR_FILE_PATH}</i><BR>
            <b>Example 2:</b> Command: <i>c:\\Program files\\OneCommander\\OneCommander.exe</i> | Arguments: <i>${VAR_FILE_PATH}</i><BR>
            <b>Example 3:</b> Command: <i>cmd</i> | Arguments: <i>/K cd ${VAR_FOLDER_PATH}</i><BR>
            <b>Example 4:</b> Command: <i>wt</i> | Arguments: <i>-p, Ubuntu, wsl, --cd, ${VAR_FOLDER_PATH}</i><BR><BR>

		    <b>NOTE:</b> No need to add double quotes for paths with spaces.<BR><BR>`;

		// Create input boxes for the new command.
		const inputContainer = containerEl.createDiv({
			cls: "open-with-container",
		});
		const nameInput = inputContainer.createEl("input", {
			attr: { type: "text", placeholder: "Display Name" },
			cls: "open-with-name-inputbox",
		});
		const cmdInput = inputContainer.createEl("input", {
			attr: { type: "text", placeholder: "Command or full path command" },
			cls: "open-with-cmd-inputbox",
		});
		const argsInput = inputContainer.createEl("input", {
			attr: { type: "text", placeholder: "Arguments (optional)" },
			cls: "open-with-args-inputbox",
		});

		// Create buttons to reset and add the new command.
		new ButtonComponent(inputContainer)
			.setIcon("rotate-ccw")
			.setTooltip("Reset fields")
			.setClass("open-with-btn")
			.onClick(() => {
				nameInput.value = "";
				cmdInput.value = "";
				argsInput.value = "";
			});
		new ButtonComponent(inputContainer)
			.setIcon("circle-plus")
			.setTooltip("Add command to open with...")
			.setClass("open-with-btn")
			.onClick(async () => {
				const name = nameInput.value.trim();
				const cmd = cmdInput.value.trim();
				let args = argsInput.value.trim();
				if (!(name && cmd)) {
					return new Notice(
						"Display Name & Path/Command are always neccessary."
					);
				}
				// If no arguments are provided, add the file path as argument.
				if (!args) args = VAR_FILE_PATH;

				// Add command to open with the app. If there was an obsidian
				// command in the plugin with the same name, it will be replaced.
				this.plugin.addCommand(
					this.plugin.createOpenWithCmd(name, cmd, args)
				);

				const newApp = { name, cmd, args, showInMenu: false };
				// If the app already in the settings, update it.
				let found = false;
				for (const app of this.plugin.settings.apps) {
					if (app.name !== newApp.name) continue;
					app.cmd = newApp.cmd;
					app.args = newApp.args;
					found = true;
					new Notice(`Modifying ${app.name} command.`);
					break;
				}
				// If the app is not in the settings, add it.
				if (!found) {
					this.plugin.settings.apps.push(newApp);
					new Notice(`Adding ${newApp.name} command.`);
				}
				await this.plugin.saveSettings();
				this.display();
			});

		// Display all saved commands in the settings.
		this.plugin.settings.apps.forEach((app) => {
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
					showText.classList.add("open-with-show-text");
					// @ts-ignore
					toggle.toggleEl.parentElement.prepend(showText);
					toggle.setValue(app.showInMenu).onChange(async (value) => {
						app.showInMenu = value;
						await this.plugin.saveSettings();
					});
				})
				// Button to fill the commands fields with this command.
				.addButton((btn) => {
					btn.setIcon("rectangle-ellipsis")
						.setTooltip("Fill fields with this command")
						.onClick(async () => {
							nameInput.value = app.name;
							cmdInput.value = app.cmd;
							argsInput.value = app.args;
						});
				})
				// Button to remove the command.0
				.addButton((btn) => {
					btn.setIcon("trash")
						.setTooltip("Remove")
						.onClick(async () => {
							new Notice(
								"You need to restart Obsidian to effectively remove this command."
							);
							this.plugin.settings.apps.remove(app);
							await this.plugin.saveSettings();
							this.display();
						});
				});
		});
	}
}

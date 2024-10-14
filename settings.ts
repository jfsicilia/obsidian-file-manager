import { App, Plugin, PluginSettingTab, Setting } from "obsidian";

import {
	FileConflictResolutionProvider,
	FileConflictOptionDescription,
	FileConflictOption,
} from "conflict";

// Settings for the FileManager plugin
export interface FileManagerSettings {
	conflictResolutionMethod: string;
	showSelectionInfo: boolean;
	showCopyMoveInfo: boolean;
	newFolderName: string;
	newNoteName: string;
	duplicateSuffix: string;
}

// Default settings for the FileManager plugin
export const DEFAULT_SETTINGS: FileManagerSettings = {
	conflictResolutionMethod: FileConflictOption.SKIP,
	showSelectionInfo: true,
	showCopyMoveInfo: true,
	newFolderName: "New Folder",
	newNoteName: "New Note.md",
	duplicateSuffix: " - Copy",
};

// Allows to provide settings and save them.
export interface FileManagerSettingsProvider {
	settings: FileManagerSettings;

	saveSettings(): Promise<void>;
}

/**
 * FileManagerPlugin settings tab
 */
export class FileManagerSettingTab extends PluginSettingTab {
	plugin: FileManagerSettingsProvider & FileConflictResolutionProvider;

	constructor(
		app: App,
		plugin: Plugin &
			FileManagerSettingsProvider &
			FileConflictResolutionProvider
	) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

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
			.setDesc(
				"Show the number of selected files after file/folder selection"
			)
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
	}
}

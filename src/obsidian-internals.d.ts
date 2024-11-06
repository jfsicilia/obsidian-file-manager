import {
	TAbstractFile,
	TFile,
	TFolder,
	View,
	App,
	Vault,
	Workspace,
} from "obsidian";

declare module "obsidian-internals" {
	export class FileExplorer extends View {
		fileItems: { [key: string]: FileOrFolderItem };
		files: WeakMap<HTMLDivElement, TAbstractFile>;
		activeDom: FileOrFolderItem;
		tree: TreeItem;
		startRenameFile: (file: TAbstractFile) => Promise<void>;
		getViewType(): string;
		getDisplayText(): string;
	}

	export type FileOrFolderItem = FolderItem | FileItem;

	export interface FileItem {
		el: HTMLDivElement;
		file: TFile;
		fileExplorer: FileExplorer;
		info: any;
		parent: FolderItem;
		selfEl: HTMLDivElement;
		innerEl: HTMLDivElement;
	}

	export interface FolderItem {
		el: HTMLDivElement;
		fileExplorer: FileExplorer;
		parent: FolderItem;
		info: any;
		selfEl: HTMLDivElement;
		innerEl: HTMLDivElement;
		file: TFolder;
		children: FileOrFolderItem[];
		childrenEl: HTMLDivElement;
		collapseIndicatorEl: HTMLDivElement;
		collapsed: boolean;
		setCollapsed: (collapsed: boolean) => void;
		pusherEl: HTMLDivElement;
	}

	export interface TreeItem {
		focusedItem: FileOrFolderItem;
		setFocusedItem: (item: FileOrFolderItem, moveViewport: boolean) => void;
		selectedDoms: Set<FileOrFolderItem>;
	}

	export class MockApp extends App {
		nextFrame: (callback: () => void) => void;
	}

	export class MockVault extends Vault {
		exists: (path: string) => Promise<boolean>;
	}

	export class MockWorkspace extends Workspace {}

	export class MockTree {
		clearSelectedDoms: () => void;
		selectItem: (item: FileOrFolderItem) => void;
		deselectItem: (item: FileOrFolderItem) => void;
	}
}

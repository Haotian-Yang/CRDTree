import {ID, Index} from "./types/Types";
import {ROOT, ROOT_PARENT} from "./Constants";
import {BackendChange, Change} from "./types/Change";
import {
	ActionKind,
	BackendAssignment,
	BackendInsertion,
	Deletion,
	isBackendAssignment,
	isBackendInsertion,
	isDeletion
} from "./types/BaseAction";
import {
	BackendPrimitive,
	BasePrimitive,
	FrontendPrimitive,
	isBackendPrimitive,
	ObjectKind,
	ObjectPrimitive
} from "./types/Primitive";

type Entry = { name: ID, value: BasePrimitive, deleted: boolean };
type MetaObject = Map<Index, Entry> | Array<Entry>;
type MetaMap = Map<ID, MetaObject>;

export default class State<T = any> {
	private objects: MetaMap;
	private clock: number;

	constructor(private readonly changes: BackendChange[]) {
		this.objects = State.initObjects();
		this.clock = changes[changes.length - 1]?.clock ?? 0;
		this.reapplyAllChanges();
	}

	private static initObjects(): Map<ID, Map<Index, Entry>> {
		const rootParent = new Map<Index, Entry>()
			.set(ROOT, {name: undefined, value: undefined, deleted: true});
		return new Map<ID, Map<Index, Entry>>()
			.set(ROOT_PARENT, rootParent);
	}

	public next(): number {
		return this.clock + 1;
	}

	public getElement(indices: Index[]): ID {
		return this.getElementImpl([ROOT, ...indices]);
	}

	public getParentElement(indices: Index[]): ID {
		const element = this.getElementImpl([ROOT, ...indices].slice(0, -1));
		this.getMetaObject(element); // for side effect of asserting that this is indexable
		return element;
	}

	private getElementImpl(indices: Index[]): ID {
		return indices.reduce((name: ID, index: Index): ID => {
			const metaObject = this.getMetaObject(name);
			let entry: Entry;
			if (metaObject instanceof Map) {
				entry = metaObject.get(index);
			} else {
				entry = metaObject[State.findIndexInTombstoneArray(metaObject, State.ensureNumber(index))];
			}
			return entry?.deleted ? undefined : entry?.name;
		}, ROOT_PARENT) as ID;
	}

	private static ensureNumber(maybeNumber: any): number {
		if (typeof maybeNumber !== "number" || !isFinite(maybeNumber)) {
			throw new RangeError("Must use numbers to index into arrays");
		}
		return maybeNumber; // definitely number
	}

	public addChange(change: Change): BackendChange {
		change = State.ensureBackendChange(change);
		const {clock} = change;
		if (clock > this.clock) {
			this.appendChange(change);
			this.applyChange(change);
		} else {
			this.insertChange(change);
			this.reapplyAllChanges();
		}
		return change;
	}

	private static ensureBackendChange(change: Change): BackendChange {
		const {kind} = change.action;
		if (kind === ActionKind.DELETE || kind === ActionKind.NOOP || isBackendPrimitive(change.action.item)) {
			return change as BackendChange;
		} else {
			const {pid, clock} = change;
			const name: ID = `${pid}@${clock}`;
			const item = State.toObjectPrimitive(name, change.action.item);
			const action = {...change.action, item};
			return {...change, action};
		}
	}

	// TODO def shouldn't be in this file
	private static toObjectPrimitive(name: ID, item: FrontendPrimitive): ObjectPrimitive {
		if (typeof item === "object" && item !== null) {
			return {name, value: undefined, kind: Array.isArray(item) ? ObjectKind.ARRAY : ObjectKind.OBJECT};
		} else {
			return {name, value: item as BasePrimitive, kind: ObjectKind.OTHER};
		}
	}

	private appendChange(change: BackendChange): void {
		this.clock = change.clock;
		this.changes.push(change);
	}

	private insertChange(change: BackendChange): void {
		// TODO something with the change itself. idk where it goes lol
		this.changes.push(change);
	}

	private reapplyAllChanges(): void {
		this.objects = State.initObjects();
		this.changes.forEach((change: BackendChange) =>
			this.applyChange(change));
	}

	private applyChange(change: BackendChange): void {
		const {action} = change;
		if (isBackendAssignment(action)) {
			this.applyAssignment(action);
		} else if (isBackendInsertion(action)) {
			this.applyInsertion(action);
		} else if (isDeletion(action)) {
			this.applyDeletion(action);
		}
	}

	private getMetaObject(name: ID): MetaObject {
		const currentMap = this.objects.get(name);
		if (!currentMap) {
			throw new RangeError("Indexable element does not exist at this index");
		}
		return currentMap;
	}

	private createMetaObject(item: BackendPrimitive): void {
		const {name, kind} = item;
		if (kind === ObjectKind.OBJECT) {
			this.objects.set(name, new Map());
		} else if (kind === ObjectKind.ARRAY) {
			this.objects.set(name, []);
		}
	}

	private applyAssignment(assignment: BackendAssignment): void {
		const {item, at, in: _in} = assignment;
		const {name, value} = item;
		const parent = this.getMetaObject(_in);
		if (Array.isArray(parent)) {
			State.assignToList(parent, at, name, value);
		} else {
			parent.set(at, {name, value, deleted: false});
		}
		this.createMetaObject(item);
	}

	private static assignToList(parent: Array<Entry>, at: Index, name: ID, value: BasePrimitive): void {
		const trueIndex = State.findIndexInTombstoneArray(parent, State.ensureNumber(at));
		if (trueIndex < 0) {
			throw new RangeError("Cannot assign to something that does not exist");
		}
		const oldEntry = parent[trueIndex];
		parent[trueIndex] = {...oldEntry, deleted: true};
		State.insertInList(parent, trueIndex + 1, name, value);
	}

	private static insertInList(parent: Array<Entry>, index: number, name: ID, value: BasePrimitive): void {
		parent.splice(index, 0, {name, value, deleted: false});
	}

	// TODO should not be in this file
	private static findIndexInTombstoneArray(entries: Array<Entry>, liveIndex: number): number {
		let currentIndexOffset = liveIndex;
		let index;
		for (index = 0; index < entries.length; index = index + 1) {
			const entry = entries[index];
			if (entry.deleted === false) {
				if (currentIndexOffset === 0) {
					return index;
				} else {
					currentIndexOffset = currentIndexOffset - 1;
				}
			}
		}
		if (liveIndex < 0) {
			return -1;
		} else {
			throw new RangeError("Attempting to insert off the end of the list");
		}
	}

	private applyInsertion(insertion: BackendInsertion): void {
		const {item, in: _in} = insertion;
		const {name, value} = item;
		const parent = this.getMetaObject(_in);
		if (Array.isArray(parent)) {
			const index = State.findInsertionIndex(parent, insertion);
			State.insertInList(parent, index, name, value);
		} else {
			// TODO should really ensure this happens before application time
			throw new RangeError("Cannot insert into a non-list");
		}
		this.createMetaObject(item);
	}

	private static findInsertionIndex(entries: Array<Entry>, insertion: BackendInsertion): number {
		const {after} = insertion;
		// if inserting at the beginning of the list, start will be -1
		const start = entries.findIndex((entry) => entry.name === after);
		for (let index = start + 1; index < entries.length; index = index + 1) {
			const existingEntry = entries[index];
			if (State.nameLt(existingEntry.name, insertion.item.name)) { // existing entry happened before
				return index;
			}
		}
		return entries.length;
	}

	// TODO this code should not live here either
	private static nameLt(a: ID, b: ID): boolean {
		const [aPid, aClockString] = a.split("@");
		const [bPid, bClockString] = b.split("@");
		const aClock = Number(aClockString);
		const bClock = Number(bClockString);
		if (aClock < bClock) return true;
		if (bClock < aClock) return false;
		if (aPid < bPid) return true;
		if (bPid < aPid) return false;
		throw new EvalError("Two items in list with same name should be impossible");
	}

	private applyDeletion(deletion: Deletion): void {
		const {at, in: _in} = deletion;
		const parent = this.getMetaObject(_in);
		if (Array.isArray(parent)) {
			parent
				.forEach((entry, index) =>
					(entry.name === at) && (parent[index] = {...entry, deleted: true}));
		} else {
			Array.from(parent.entries())
				.forEach(([name, entry]) =>
					(entry.name === at) && parent.set(name, {...entry, deleted: true}));
		}
	}

	public listChanges(): BackendChange[] {
		return this.changes;
	}

	public render(): T {
		const metaObject = this.getMetaObject(ROOT_PARENT) as Map<Index, Entry>;
		if (metaObject.get(ROOT).deleted) {
			return undefined;
		} else {
			return this.renderRecursiveMap(metaObject)[ROOT];
		}
	}

	private renderRecursiveMap(metaObject: Map<Index, Entry>): any {
		return Array.from(metaObject.entries()).reduce((element: any, [index, entry]): any => {
			if (entry.deleted === false) {
				element[index] = this.renderRecursive(entry);
			}
			return element;
		}, {});
	}

	private renderRecursiveList(metaObject: Array<Entry>): any {
		return metaObject.filter((entry) => entry.deleted === false)
			.map((entry) => this.renderRecursive(entry));
	}

	private renderRecursive(entry: Entry): any {
		if (this.objects.has(entry.name as ID)) {
			const {name} = entry;
			const metaObject = this.getMetaObject(name as ID);
			return Array.isArray(metaObject) ?
				this.renderRecursiveList(metaObject) : this.renderRecursiveMap(metaObject);
		} else {
			return entry.value;
		}
	}
}

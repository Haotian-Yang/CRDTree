import Libp2p from "libp2p";
import {ICRDTree, CRDTreeTransport} from "crdtree";
import {debounce} from "debounce";
import {baseProtocol, Protocol, ProtocolKind} from "./protocol/Protocol";

interface IConnectedCRDTree<T = any> extends ICRDTree {

	id: string;
	addresses: string[];

	onUpdate(callback: (render) => void): void;

	stop(): Promise<void>;
}

class ConnectedCRDTree<T = any> implements IConnectedCRDTree<T> {
	private pendingUpdates: CRDTreeTransport<T>;
	private protocol: Protocol = baseProtocol;
	private meta: ICRDTree;

	constructor(private readonly node: Libp2p, private readonly crdt: ICRDTree) {
		this.pendingUpdates = [];
		this.crdt.onUpdate((update) => {
			this.protocol.saveJoins(update, this.meta);
			this.pendingUpdates.push(...update);
			this.broadcast();
		});
	}

	public get id(): string {
		return this.node.peerId.toB58String();
	}

	public get addresses(): string[] {
		return this.node.transportManager.getAddrs()
			.map((addr) => `${addr.toString()}/p2p/${this.id}`);
	}

	public setProtocol(protocol: Protocol, meta: ICRDTree): void {
		this.protocol = protocol;
		this.meta = meta;
	}

	public get protocolKind(): ProtocolKind {
		return this.protocol.kind;
	}

	public serializeProtocol(): CRDTreeTransport<any> {
		return this.meta?.serialize();
	}

	public assign(indices: Array<number | string>, item: any): void {
		this.crdt.assign(indices, item);
	}

	public insert(indices: [...Array<number | string>, number], item: any): void {
		this.crdt.insert(indices, item);
	}

	public delete(indices: Array<number | string>): void {
		this.crdt.delete(indices);
	}

	public get render(): any {
		return this.crdt.render;
	}

	public onUpdate(callback: (render: any) => void): void {
		this.crdt.onUpdate(() => callback(this.crdt.render));
	}

	public async stop(): Promise<void> {
		Object.keys(this)
			.filter((key) => this[key] instanceof Function)
			.forEach((key) => {
				if (key === "stop") {
					this[key] = () => Promise.resolve();
				} else {
					this[key] = function () {
						throw new Error("Cannot use a stopped CRDTree");
					}
				}
			});
		// TODO future work ... something something... broadcast metadata details
		await this.node.stop();
	}

	private readonly broadcast: () => void = debounce(async () => {
		const updatesToBroadcast = this.pendingUpdates;
		this.pendingUpdates = [];

		try {
			// Publish the message
			await this.protocol.broadcast(this.node, updatesToBroadcast, this.meta);
		} catch (err) {
			this.pendingUpdates.push(...updatesToBroadcast); // hopefully will get handled later
			console.warn("Updates couldn't get published. Will publish later. Reason:", err);
		}
	}, 50);

	public checkout(ref: string): void {
		this.protocol.subscribe(this.node, this.id, ref, this.meta);
		return this.crdt.checkout(ref);
	}

	public fork(name?: string): string {
		const ref = this.crdt.fork(name);
		this.protocol.subscribe(this.node, this.id, ref, this.meta);
		return ref;
	}

	public join(ref: string): void {
		if (this.crdt.listRefs().includes(ref)) {
			return this.crdt.join(ref);
		} else {
			throw new EvalError("Please checkout this branch first as you do not have a local copy");
		}
	}

	public listRefs(): string[] {
		return this.protocol.listRefs(this.crdt, this.meta);
	}

	public merge(remote: ICRDTree<any> | CRDTreeTransport<any>): string[] {
		return this.crdt.merge(remote);
	}

	public noop(): void {
		return this.crdt.noop();
	}

	public get ref(): string {
		return this.crdt.ref;
	}

	public serialize(ref?: string): CRDTreeTransport<any> {
		return this.crdt.serialize(ref);
	}
}

export {IConnectedCRDTree, ConnectedCRDTree}

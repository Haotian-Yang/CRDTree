import {FrontendPrimitive} from "./Primitive";
import {HEAD, ROOT, ROOT_PARENT} from "./Constants";
import {BackendChange} from "./Change";

export type ID = `${string}@${number}` | HEAD | ROOT | ROOT_PARENT;
export type Index = number | string;
export type CRDTreeTransport<T> = BackendChange[]; // used for sending updates across the network

export interface ICRDTree<T = any> {
	render(): T;

	serialize(): CRDTreeTransport<T>; // for when a new node joins the network
	// returns affected forks
	merge(remote: ICRDTree<T> | CRDTreeTransport<T>): ID[];

	assign<U extends FrontendPrimitive = any>(indices: Index[], item: U): void;

	insert<U extends FrontendPrimitive = any>(indices: [...Index[], number], item: U): void;

	delete(indices: Index[]): void;

	noop(): void; // useful when we add commit messages

	onUpdate(callback: (update: CRDTreeTransport<T>) => void): void;

	ref(): ID;

	listRefs(): ID[];

	fork(): ID;

	join(ref: ID): void; // same fork is a no-op
	checkout(ref: ID): void;
}
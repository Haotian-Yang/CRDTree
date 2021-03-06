import * as chai from "chai";
import {ICRDTree} from "../../src/API";
import * as fs from "fs";

chai.Assertion.addMethod('render', function (expectedRender) {
	const crdt: ICRDTree = this._obj;
	new chai.Assertion(crdt.render).to.deep.equal(expectedRender);
});

chai.Assertion.addMethod('renderOneOf', function (...expectedRender) {
	const crdt: ICRDTree = this._obj;
	new chai.Assertion(expectedRender).to.deep.include(crdt.render);
});


chai.Assertion.addMethod('renderEqual', function (remote: ICRDTree) {
	const crdt: ICRDTree = this._obj;
	new chai.Assertion(crdt.render).to.deep.equal(remote.render);
});

chai.Assertion.addMethod('merge', function (remote: ICRDTree) {
	const crdtA: ICRDTree = this._obj;
	const crdtB: ICRDTree = remote;
	crdtB.merge(crdtA);
	crdtA.merge(crdtB);
	new chai.Assertion(crdtA).to.renderEqual(crdtB);
});

chai.Assertion.addMethod('as', function (expectedRender) {
	new chai.Assertion(this._obj).render(expectedRender);
});

chai.Assertion.addMethod('asOneOf', function (...expectedRenders) {
	new chai.Assertion(expectedRenders, "No valid render").to.deep.include(this._obj.render);
});

chai.Assertion.addMethod('on', function (branch: string) {
	new chai.Assertion(this._obj.ref).to.deep.equal(branch);
});

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	export namespace Chai {
		interface Assertion {
			renderOneOf: (...val: any[]) => Assertion;
			render: (val: any) => Assertion;
			renderEqual: (remote: ICRDTree) => Assertion;
			merge: (remote: ICRDTree) => Assertion;
			as: (val: any) => Assertion;
			asOneOf: (...renders: any[]) => Assertion;
			on: (id: string) => Assertion;
		}
	}
}

const readResource = (filename: string): string =>
	fs.readFileSync(`${__dirname}/../resources/${filename}`)
		.toString();

export {readResource};

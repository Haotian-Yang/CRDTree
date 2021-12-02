
import {createNode} from "./P2P";
import {RootNetwork} from "./RootNetwork";
import {CRDTree} from "../src/CRDTree";
import {ICRDTree} from "../src/API";

let crdtA: ICRDTree;
crdtA = new CRDTree([], "A");
crdtA.assign([], {});

crdtA.assign(["foo"], 69);

let rn : RootNetwork;
rn = new RootNetwork();
rn.connect('/ip4/127.0.0.1/tcp/63785/ipfs/QmWGDfzPyfuYy9u71EJFvUe3wzgLJp9NwGvYrj2WnCA1sM');

setTimeout(function () {
    console.log("send CRDT");
    rn.send(crdtA);
}, 10000);
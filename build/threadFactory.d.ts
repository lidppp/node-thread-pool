/// <reference types="node" />
import { Worker } from "worker_threads";
declare type ExitCallbackFn = (id: number, isTemp: boolean) => void;
declare function threadFactory(filePath: string, isTemp: boolean, exitCallback: ExitCallbackFn): Worker;
export default threadFactory;

/// <reference types="node" />
import tF from "./threadFactory";
import { Worker } from "worker_threads";
declare enum ThreadPoolStatus {
    RUNNING = 0,
    SHUTDOWN = 1,
    TERMINATED = 2
}
declare enum workerStatus {
    FREE = 0,
    RUNNING = 1
}
declare type QueueCallback<N> = (err: any, result?: N) => void;
interface QueueItem<T, N> {
    callback: QueueCallback<N>;
    getData: () => T;
}
interface WorkerInfo<T> {
    status: workerStatus;
    worker: Worker;
    isTemp: boolean;
    messageHandler?: (msg: T) => void;
    errorHandler?: (err: Error) => void;
}
interface ThreadPoolType<T, N> {
    _fileUrl: string;
    maximumPoolSize: number;
    corePoolSize: number;
    _workQueue: QueueItem<T, N>[];
    _maxWorkQueue: number | null;
    threadFactory: typeof tF;
    _workers: {
        [index: number]: WorkerInfo<N>;
    };
    status: ThreadPoolStatus;
    _init(): void;
    run(data: QueueItem<T, N>): void;
    close(): void;
    cancelOne(id: number): Promise<number>;
    terminated(): void;
    _reload(id: number, worker: Worker): void;
    _tempWorkerDel(id: number): any;
    _exitCallback(id: number, isTemp: boolean): void;
    getWorkerInfo(): {
        num: {
            all: number;
            prem: number;
            temp: number;
        };
        freePremWorker: WorkerInfo<N>[];
    };
    _creatWorker(isTemp: boolean): number;
    _runWorker(workerInfo: WorkerInfo<N>, data: QueueItem<T, N>): void;
    _runQueue(workerInfo: WorkerInfo<N>): void;
}
declare class ThreadPoolImpl<T, N> implements ThreadPoolType<T, N> {
    _fileUrl: string;
    get fileUrl(): string;
    corePoolSize: number;
    maximumPoolSize: number;
    _workers: {
        [index: number]: WorkerInfo<N>;
    };
    status: ThreadPoolStatus;
    threadFactory: typeof tF;
    _workQueue: QueueItem<T, N>[];
    _maxWorkQueue: number | null;
    set maxWorkQueue(value: number | null);
    get maxWorkQueue(): number | null;
    constructor(fileUrl: string, maxThread: number, maximumPoolSize?: number);
    _init(): void;
    _creatWorker(isTemp: boolean): number;
    getWorkerInfo(): {
        num: {
            all: number;
            prem: number;
            temp: number;
        };
        freePremWorker: WorkerInfo<N>[];
    };
    run(data: QueueItem<T, N>): void;
    _runWorker(workerInfo: WorkerInfo<N>, data: QueueItem<T, N>): void;
    _runQueue(workerInfo: WorkerInfo<N>): void;
    _reload(id: number): void;
    _tempWorkerDel(id: number): void;
    _exitCallback: (id: number, isTemp: boolean) => void;
    cancelOne(id: number): Promise<number>;
    close(): void;
    terminated(): void;
}
export default ThreadPoolImpl;

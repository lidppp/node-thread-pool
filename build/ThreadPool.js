"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const threadFactory_1 = __importDefault(require("./threadFactory"));
// 线程池状态
var ThreadPoolStatus;
(function (ThreadPoolStatus) {
    ThreadPoolStatus[ThreadPoolStatus["RUNNING"] = 0] = "RUNNING";
    ThreadPoolStatus[ThreadPoolStatus["SHUTDOWN"] = 1] = "SHUTDOWN";
    ThreadPoolStatus[ThreadPoolStatus["TERMINATED"] = 2] = "TERMINATED"; // 执行terminated方法后进入该状态
})(ThreadPoolStatus || (ThreadPoolStatus = {}));
// 线程状态
var workerStatus;
(function (workerStatus) {
    workerStatus[workerStatus["FREE"] = 0] = "FREE";
    workerStatus[workerStatus["RUNNING"] = 1] = "RUNNING";
})(workerStatus || (workerStatus = {}));
class ThreadPoolImpl {
    constructor(fileUrl, maxThread, maximumPoolSize) {
        this._workers = {};
        this.status = ThreadPoolStatus.RUNNING;
        this.threadFactory = threadFactory_1.default;
        this._workQueue = [];
        this._maxWorkQueue = null; // 任务队列数量上线, null为无上限
        this._exitCallback = (id, isTemp) => {
            if (!isTemp) {
                this._reload(id);
            }
            else {
                this._tempWorkerDel(id);
            }
        };
        // 线程数不能小于等于0
        if (!maxThread || maxThread <= 0) {
            throw new Error("The number of threads must be greater than 0");
        }
        // 弹性线程不能小于线程数
        if (maximumPoolSize !== null && maximumPoolSize !== undefined && maximumPoolSize < maxThread) {
            throw new Error("The maximum number of threads must be greater than the number of threads");
        }
        this._fileUrl = fileUrl;
        this.corePoolSize = maxThread;
        this.maximumPoolSize = maximumPoolSize !== null && maximumPoolSize !== void 0 ? maximumPoolSize : maxThread;
        this._init();
    }
    get fileUrl() {
        return this._fileUrl;
    }
    set maxWorkQueue(value) {
        this._maxWorkQueue = value;
    }
    get maxWorkQueue() {
        return this._maxWorkQueue;
    }
    _init() {
        for (let i = 0; i < this.corePoolSize; i++) {
            this._creatWorker(false);
        }
    }
    _creatWorker(isTemp) {
        const worker = this.threadFactory(this._fileUrl, isTemp, this._exitCallback);
        const id = worker.threadId;
        this._workers[id] = { status: workerStatus.FREE, isTemp: isTemp, worker: worker };
        if (isTemp) {
            worker.once("message", () => {
                console.log(`=======临时进程接受消息, 销毁执行  worker:${id}=======`);
                this.cancelOne(id);
            });
        }
        return id;
    }
    getWorkerInfo() {
        // 运行中线程的数量
        const num = {
            all: 0,
            prem: 0,
            temp: 0, // 临时
        };
        // 闲置常驻线程
        const freePremWorker = [];
        for (const key in this._workers) {
            if (this._workers[key].status === workerStatus.RUNNING) {
                num.all++;
                if (this._workers[key].isTemp) {
                    num.temp++;
                }
                else {
                    num.prem++;
                }
            }
            else {
                // 获取所有闲置常驻线程
                if (!this._workers[key].isTemp) {
                    freePremWorker.push(this._workers[key]);
                }
            }
        }
        return { num, freePremWorker };
    }
    run(data) {
        if (this.status !== ThreadPoolStatus.RUNNING) {
            console.error(new Error("Not accepting new tasks"));
            return;
        }
        let { num, freePremWorker } = this.getWorkerInfo();
        // 如果已运行数量少于当前常驻线程数量 则取空闲线程[0]
        if (num.prem < this.corePoolSize) {
            const workerInfo = freePremWorker[0];
            this._runWorker(workerInfo, data);
        }
        // 如果已运行常驻进程与设定进程数量相同 并且 全部运行线程数量 小于 最大弹性线程数 说明可以创建临时进程执行
        else if (num.all < this.maximumPoolSize) {
            let id = this._creatWorker(true);
            this._runWorker(this._workers[id], data);
        }
        // 如果全部运行数量和最大弹性线程数相等 加入阻塞队列
        else {
            this._workQueue.push(data);
        }
    }
    _runWorker(workerInfo, data) {
        const clearWork = () => {
            if (workerInfo.messageHandler) {
                workerInfo.worker.removeListener('message', workerInfo.messageHandler);
            }
            if (workerInfo.errorHandler) {
                workerInfo.worker.removeListener('error', workerInfo.errorHandler);
            }
        };
        // 清除旧数据
        clearWork();
        workerInfo.status = workerStatus.RUNNING;
        workerInfo.messageHandler = (res) => {
            // 只监听单次数据返回 然后调用callback, 执行完成之后查询阻塞队列是否有任务未执行, 如果有则继续执行 没有就挂起
            data.callback(null, res);
            workerInfo.status = workerStatus.FREE;
            this._runQueue(workerInfo);
        };
        workerInfo.errorHandler = (err) => {
            // 只监听单次数据返回 然后调用callback, 执行完成之后查询阻塞队列是否有任务未执行, 如果有则继续执行 没有就挂起
            data.callback(err);
            workerInfo.status = workerStatus.FREE;
            this._runQueue(workerInfo);
        };
        workerInfo.worker.once("message", workerInfo.messageHandler);
        workerInfo.worker.once("error", workerInfo.errorHandler);
        workerInfo.worker.postMessage(data.getData());
    }
    _runQueue(workerInfo) {
        if (this._workQueue.length) {
            this._runWorker(workerInfo, this._workQueue.shift());
        }
    }
    _reload(id) {
        delete this._workers[id];
        if (this.status !== ThreadPoolStatus.TERMINATED) {
            this._creatWorker(false);
        }
    }
    _tempWorkerDel(id) {
        delete this._workers[id];
    }
    cancelOne(id) {
        return this._workers[id].worker.terminate();
    }
    close() {
        this.status = ThreadPoolStatus.SHUTDOWN;
        const interKey = setInterval(() => {
            let { num, freePremWorker } = this.getWorkerInfo();
            if (num.all === 0 && this._workQueue.length === 0) {
                this.terminated();
                clearInterval(interKey);
            }
        }, 200);
    }
    terminated() {
        this.status = ThreadPoolStatus.TERMINATED;
        this._workQueue = [];
        for (const workersKey in this._workers) {
            let id = this._workers[workersKey].worker.threadId;
            this.cancelOne(id);
        }
    }
}
exports.default = ThreadPoolImpl;
//# sourceMappingURL=ThreadPool.js.map
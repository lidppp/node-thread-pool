import tF from "./threadFactory"
import {Worker} from "worker_threads";

// 线程池状态
export enum ThreadPoolStatus {
    RUNNING, // 能接受新提交的任务也能处理阻塞队列中的任务
    SHUTDOWN, // 关闭状态, 不接受新提交的任务, 却可以继续处理阻塞队列中已保存的任务, 阻塞任务处理完成后进入 TERMINATED状态
    TERMINATED// 执行terminated方法后进入该状态
}

// 线程状态
enum workerStatus {
    FREE, // 空闲
    RUNNING, // 正在处理任务, 任务结束后状态置为FREE
}

type QueueCallback<N> = (err: any, result?: N) => void;

interface QueueItem<T, N> {
    callback: QueueCallback<N>; // 回调函数
    getData: () => T; // 传递给run的data
}

interface WorkerInfo<T> {
    // 每个worker当前的状态
    status: workerStatus;
    // worker实例
    worker: Worker;
    // 是否为弹性worker  弹性worker用完即杀
    isTemp: boolean;
    // message操作器, 执行新任务移除旧操作器时使用
    messageHandler?: (msg: T) => void
    // err操作器,执行新任务移除旧操作器时使用
    errorHandler?: (err: Error) => void
}

// 线程类型
interface ThreadPoolType<T, N> {
    // worker 文件路径
    _fileUrl: string;
    // 最大线程池大小
    maximumPoolSize: number;
    // 核心线程池大小
    corePoolSize: number;
    // 阻塞队列
    _workQueue: QueueItem<T, N>[];
    // 任务队列数量上线, null为无上限
    _maxWorkQueue: number | null;
    // 创建线程工厂
    threadFactory: typeof tF;
    _workers: {
        [index: number]: WorkerInfo<N>
    };
    // 线程池状态
    status: ThreadPoolStatus;

    // 初始化线程池
    _init(): void;

    // 添加任务
    run(data: QueueItem<T, N>): void;

    // 线程池终止, 但是会执行完当前队列
    close(): void;

    // 关闭单个线程当前执行的任务
    cancelOne(id: number): Promise<number>;

    // 强制线程池结束 停止一切线程
    terminated(): void;

    // 常驻线程退出后重新加载
    _reload(id: number, worker: Worker): void;

    // 临时线程退出后销毁
    _tempWorkerDel(id: number);

    // 线程退出总操作函数
    _exitCallback(id: number, isTemp: boolean): void

    // 获取运行中线程数量以及空闲线程
    getWorkerInfo(): { num: { all: number, prem: number, temp: number }, freePremWorker: WorkerInfo<N>[], runningWorker: WorkerInfo<N>[] };

    // 创建worker
    _creatWorker(isTemp: boolean): number;

    // 执行任务
    _runWorker(workerInfo: WorkerInfo<N>, data: QueueItem<T, N>): void

    // 执行阻塞队列任务
    _runQueue(workerInfo: WorkerInfo<N>): void

}

class ThreadPoolImpl<T, N> implements ThreadPoolType<T, N> {
    _fileUrl: string;
    set fileUrl(value: string) {
        throw new Error("Can not change fileUrl")
    }
    get fileUrl(): string {
        return this._fileUrl;
    }

    corePoolSize: number;
    maximumPoolSize: number;
    _workers: {
        [index: number]: WorkerInfo<N>;
    } = {}
    status: ThreadPoolStatus = ThreadPoolStatus.RUNNING;

    threadFactory = tF

    _workQueue: QueueItem<T, N>[] = [];
    _maxWorkQueue: number | null = null; // 任务队列数量上线, null为无上限
    set maxWorkQueue(value: number | null) {
        this._maxWorkQueue = value;
    }

    get maxWorkQueue(): number | null {
        return this._maxWorkQueue;
    }

    constructor(fileUrl: string, maxThread: number, maximumPoolSize?: number) {
        // 线程数不能小于等于0
        if (!maxThread || maxThread <= 0) {
            throw new Error("The number of threads must be greater than 0")
        }
        // 弹性线程不能小于线程数
        if (maximumPoolSize !== null && maximumPoolSize !== undefined && maximumPoolSize < maxThread) {
            throw new Error("The maximum number of threads must be greater than the number of threads")
        }
        this._fileUrl = fileUrl
        this.corePoolSize = maxThread
        this.maximumPoolSize = maximumPoolSize ?? maxThread
        this._init()
    }


    _init(): void {
        for (let i = 0; i < this.corePoolSize; i++) {
            this._creatWorker(false)
        }
    }

    _creatWorker(isTemp: boolean) {
        const worker = this.threadFactory(this._fileUrl, isTemp, this._exitCallback)
        const id = worker.threadId
        this._workers[id] = {status: workerStatus.FREE, isTemp: isTemp, worker: worker}
        if (isTemp) {
            worker.once("message", () => {
                console.log(`=======临时进程接受消息, 销毁执行  worker:${id}=======`)
                this.cancelOne(id)
            })
        }
        return id
    }

    getWorkerInfo() {
        // 运行中线程的数量
        const num = {
            all: 0,
            prem: 0, // 常驻
            temp: 0, // 临时
        }
        // 闲置常驻线程
        const freePremWorker: WorkerInfo<N>[] = []
        const runningWorker: WorkerInfo<N>[] = []
        for (const key in this._workers) {
            if (this._workers[key].status === workerStatus.RUNNING) {
                num.all++;
                if (this._workers[key].isTemp) {
                    num.temp++
                } else {
                    num.prem++
                }
                runningWorker.push(this._workers[key])
            } else {
                // 获取所有闲置常驻线程
                if (!this._workers[key].isTemp) {
                    freePremWorker.push(this._workers[key])
                }
            }
        }
        return {num, freePremWorker,runningWorker}
    }

    run(data: QueueItem<T, N>): void {
        if (this.status !== ThreadPoolStatus.RUNNING) {
            // console.error(new Error("Not accepting new tasks"))
            data.callback(new Error("Not accepting new tasks"))
            return
        }

        let {num, freePremWorker} = this.getWorkerInfo();
        // 如果已运行数量少于当前常驻线程数量 则取空闲线程[0]
        if (num.prem < this.corePoolSize) {
            const workerInfo = freePremWorker[0]
            this._runWorker(workerInfo, data)
        }
        // 如果已运行常驻进程与设定进程数量相同 并且 全部运行线程数量 小于 最大弹性线程数 说明可以创建临时进程执行
        else if (num.all < this.maximumPoolSize) {
            let id = this._creatWorker(true);
            this._runWorker(this._workers[id], data)
        }
        // 如果全部运行数量和最大弹性线程数相等 加入阻塞队列
        else {
            if(this._maxWorkQueue&&this._maxWorkQueue>0&&this._maxWorkQueue<this._workQueue.length){
                this._workQueue.push(data)
            }else {
                data.callback(new Error("Task queue is full"))
            }
        }
    }

    _runWorker(workerInfo: WorkerInfo<N>, data: QueueItem<T, N>) {
        const clearWork = () => {
            if (workerInfo.messageHandler) {
                workerInfo.worker.removeListener('message', workerInfo.messageHandler);
            }
            if (workerInfo.errorHandler) {
                workerInfo.worker.removeListener('error', workerInfo.errorHandler);
            }
        }
        // 清除旧数据
        clearWork()
        workerInfo.status = workerStatus.RUNNING
        workerInfo.messageHandler = (res) => {
            // 只监听单次数据返回 然后调用callback, 执行完成之后查询阻塞队列是否有任务未执行, 如果有则继续执行 没有就挂起
            data.callback(null, res)
            workerInfo.status = workerStatus.FREE
            this._runQueue(workerInfo)
        }
        workerInfo.errorHandler = (err) => {
            // 只监听单次数据返回 然后调用callback, 执行完成之后查询阻塞队列是否有任务未执行, 如果有则继续执行 没有就挂起
            data.callback(err)
            workerInfo.status = workerStatus.FREE
            this._runQueue(workerInfo)
        }
        workerInfo.worker.once("message", workerInfo.messageHandler)
        workerInfo.worker.once("error", workerInfo.errorHandler)
        workerInfo.worker.postMessage(data.getData())

    }

    _runQueue(workerInfo: WorkerInfo<N>) {
        if (this._workQueue.length) {
            this._runWorker(workerInfo, <QueueItem<T, N>>this._workQueue.shift())
        }
    }

    _reload(id: number) {
        delete this._workers[id];
        if (this.status!==ThreadPoolStatus.TERMINATED){
            this._creatWorker(false)
        }
    }

    _tempWorkerDel(id: number) {
        delete this._workers[id];
    }

    _exitCallback = (id: number, isTemp: boolean)=>{
        if (!isTemp) {
            this._reload(id)
        } else {
            this._tempWorkerDel(id)
        }
    }


    cancelOne(id: number): Promise<number> {
        return this._workers[id].worker.terminate()
    }

    close(): void {
        this.status = ThreadPoolStatus.SHUTDOWN
        const interKey = setInterval(()=>{
            let {num,freePremWorker} = this.getWorkerInfo();
            if (num.all===0 && this._workQueue.length===0){
                this.terminated()
                clearInterval(interKey)
            }
        },200)
    }

    terminated(): void {
        this.status = ThreadPoolStatus.TERMINATED
        this._workQueue = [];
        for (const workersKey in this._workers) {
            let id = this._workers[workersKey].worker.threadId;
            this.cancelOne(id)
        }
    }
}


export default ThreadPoolImpl

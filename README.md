## node简易线程池

使用方式

```js
const {default: tp, ThreadPoolStatus} = require("thread-pool")
const tp = new ThreadPool("FilePath", 4, 8)
// 注意 需要传入该格式的数据
const queue = {
    callback: (err, res) => {
      if (err) {
        throw err
      }
      // ... your code
    }, // 回调函数
    getData: () => {
      return {
        // ... your datas
      }
    }
}
tp.run(queue)
```

```javascript
// 子进程文件, 需要注意 这个线程池有核心线程重启功能 
// 所以需要文件以 message方式接受调用 否则会进入无限重启子进程的循环
const {isMainThread, threadId, parentPort} = require("worker_threads")
parentPort.on("message", (data) => {
    // ... your code
})
```

## 属性以及方法

> 下方需要用到实例的对象皆写为`tp`

### 构造函数`constructor`

type: `constructor(fileUrl: string, maxThread: number, maximumPoolSize?: number):void`

- fileUrl   线程打开文件路径, 注意请使用path.join(__dirname, "path")进行拼接完整路径,fileUrl在对象实例化后无法修改

- maxThread 核心线程数, 核心线程为不会被销毁, 无任务时挂起的线程, 必须大于0

- maximumPoolSize 最大线程数, 必须大于等于核心线程数, 如果不传则默认为maxThread

> 最大线程数-核心线程数 = 弹性线程数量, 任务密集时会创建弹性线程, 弹性线程, 用完即杀, 不会保留

### fileUrl

[ string ] \<readonly> 只读, worker文件路径

### corePoolSize

[ number ] \<readonly> 只读 核心线程数

核心线程为不会被销毁, 无任务时挂起的线程

### maximumPoolSize

[ number ] \<readonly> 只读 最大线程数

如果不传, 默认为maxThread

最大线程数-核心线程数 = 弹性线程数量, 任务密集时会创建弹性线程, 弹性线程, 用完即杀, 不会保留

### status

[ ThreadPoolStatus ]\<readonly> 线程池状态

#### ThreadPoolStatus

```typescript
enum ThreadPoolStatus {
    RUNNING, // 能接受新提交的任务也能处理阻塞队列中的任务
    SHUTDOWN, // 关闭状态, 不接受新提交的任务, 却可以继续处理阻塞队列中已保存的任务, 阻塞任务处理完成后进入 TERMINATED状态
    TERMINATED// 执行terminated方法后进入该状态
}

```

### run(data: QueueItem<T, N>):void

添加任务, 

以 `worker.postMessage(QueueItem.getData())`进行参数传递

当任务运行完成或者报错时, 会调用`QueueItem.callback`

#### 运行逻辑

> 如果调用了close()或者terminated(), 则不再接受新的任务,
> 
> 如果已运行数量少于当前常驻线程数量 则取空闲线程[0]
> 
> 如果已运行常驻进程与设定进程数量相同 并且 全部运行线程数量 小于 最大弹性线程数 则创建临时进程执行
> 
> 如果全部运行数量和最大线程数相等 加入阻塞队列

#### QueueItem

```typescript
type QueueCallback<N> = (err: any, result?: N) => void;

interface QueueItem<T, N> {
    callback: QueueCallback<N>; // 回调函数
    getData: () => T; // 传递给run的data
}
```

### getWorkerInfo(): { num: { all: number, prem: number, temp: number }, freePremWorker: WorkerInfo<N>[], runningWorker: WorkerInfo<N>[] }

获取运行中线程数量以及空闲线程

- num
  
  - all 全部运行的线程数量
  
  - prem 核心线程运行数量
  
  - temp 弹性线程运行数量

- freePremWorker   当前没有运行的核心线程数组

- runningWorker    当前正在运行的线程数组

#### WorkerInfo

```typescript
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
```

### close():void

该方法为**安全关闭线程池**的方法

执行完当前线程池中的任务后(包括正在运行和阻塞队列中的任务), 线程池终止, 在执行期间不再接收新任务

执行期间 线程池状态为 `SHUTDOWN`

执行完成后 线程池状态为 `TERMINATED`

执行完成后销毁所有线程

### terminated():void

该方法为**不安全关闭线程池**的方法

强制线程池结束 停止一切线程, 所有阻塞队列中的任务清空, 当前线程中的任务中断执行, 强制退出线程池

执行完成后 线程池状态为 `TERMINATED`

import {Worker} from "worker_threads";
type ExitCallbackFn =  (id: number,isTemp: boolean)=>void
// 创建线程工厂函数
function threadFactory(
    filePath: string,
    isTemp: boolean,
    exitCallback: ExitCallbackFn
) {
    const worker = new Worker(filePath)
    const workerId = worker.threadId


    worker.on("online", () => {
        console.log(`======= worker id: {${workerId}} online ======`);
    })
    worker.on("message", (res)=>{
        console.log(`======log: worker: ${workerId} send message ${JSON.stringify(res)}======`)
    })
    worker.on("error", (err) => {
        console.error(`======= worker id: {${workerId}} error ======`,err);
    })
    worker.on("exit", (exitCode) => {
        exitCallback(workerId,isTemp)
    })
    return worker
}

export default threadFactory


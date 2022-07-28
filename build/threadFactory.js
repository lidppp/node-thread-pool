"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
// 创建线程工厂函数
function threadFactory(filePath, isTemp, exitCallback) {
    const worker = new worker_threads_1.Worker(filePath);
    const workerId = worker.threadId;
    worker.on("online", () => {
        console.log(`======= worker id: {${workerId}} online ======`);
    });
    worker.on("message", (res) => {
        console.log(`======log: worker: ${workerId} send message ${JSON.stringify(res)}======`);
    });
    worker.on("error", (err) => {
        console.error(`======= worker id: {${workerId}} error ======`, err);
    });
    worker.on("exit", (exitCode) => {
        exitCallback(workerId, isTemp);
    });
    return worker;
}
exports.default = threadFactory;
//# sourceMappingURL=threadFactory.js.map